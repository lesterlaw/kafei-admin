import type { SupabaseClient } from '@supabase/supabase-js'
import {
  podAccessHint,
  type CofeplusEnvironment,
} from '@/lib/cofeplus/config'
import { LATTE_ART_GROUP } from '@/lib/cofeplus/latte-art-contract'
import { executeCofeplusRequest } from '@/lib/cofeplus/proxy'
import {
  mergeModifiersFromItems,
  parsePodItems,
  parsePods,
  podItemFromCacheRow,
  type PodItemOption,
  type PodSummary,
} from '@/components/api-test/cofeplus-test-shared'
import {
  matchMenuItem,
  normalizeDrinkName,
} from '@/lib/cofeplus/product-map'
import { getActiveCofeplusEnvironment } from '@/lib/cofeplus/settings'

export interface SyncCatalogOptions {
  environment: CofeplusEnvironment
  /** If set, only sync menu for this pod. Otherwise sync all pods. */
  podId?: string | null
  /** Also upsert into Kafei kiosks + products for mobile orders */
  upsertKafeiRecords?: boolean
}

export interface SyncCatalogResult {
  ok: boolean
  environment: CofeplusEnvironment
  podsSynced: number
  itemsSynced: number
  kiosksUpserted: number
  productsUpserted: number
  pods: PodSummary[]
  error?: string
}

const MENU_FETCH_TIMEOUT_MS = 30_000

async function fetchPods(environment: CofeplusEnvironment): Promise<PodSummary[]> {
  const response = await executeCofeplusRequest({
    method: 'GET',
    path: '/partner/v1/pods',
    environment,
    timeoutMs: MENU_FETCH_TIMEOUT_MS,
  })
  if (!response.ok) {
    const detail = response.body.slice(0, 240)
    if (response.status === 0 || /timeout|NETWORK_ERROR|Connect Timeout/i.test(detail)) {
      throw new Error(
        `Live/test CofePlus timed out (${environment} ${response.requestUrl || ''}). Wait a few seconds and retry. If this keeps happening from admin, the machine API may be slow from the server region.`
      )
    }
    throw new Error(`List pods failed (${response.status}): ${detail}`)
  }
  return parsePods(response.body)
}

async function fetchPodMenu(
  environment: CofeplusEnvironment,
  podId: string
): Promise<PodItemOption[]> {
  const menuRes = await executeCofeplusRequest({
    method: 'GET',
    path: `/partner/v1/pods/${encodeURIComponent(podId)}/menu`,
    query: { lang: 'en' },
    environment,
    timeoutMs: MENU_FETCH_TIMEOUT_MS,
  })

  let menuItems: PodItemOption[] = []
  if (menuRes.ok) {
    try {
      menuItems = parsePodItems(menuRes.body)
    } catch (err) {
      console.error('[cofeplus-sync] parse menu failed', err)
    }
  } else {
    console.warn(
      `[cofeplus-sync] menu fetch ${menuRes.status} for ${podId}: ${menuRes.body.slice(0, 160)}`
    )
  }

  const itemsRes = await executeCofeplusRequest({
    method: 'GET',
    path: `/partner/v1/pods/${encodeURIComponent(podId)}/items`,
    query: { lang: 'en' },
    environment,
    timeoutMs: MENU_FETCH_TIMEOUT_MS,
  })

  let catalogItems: PodItemOption[] = []
  if (itemsRes.ok) {
    try {
      catalogItems = parsePodItems(itemsRes.body)
    } catch (err) {
      console.error('[cofeplus-sync] parse items failed', err)
    }
  } else if (menuItems.length === 0) {
    const denied =
      menuRes.status === 403 ||
      itemsRes.status === 403 ||
      /POD_ACCESS_DENIED/i.test(`${menuRes.body} ${itemsRes.body}`)
    if (denied) {
      throw new Error(podAccessHint(environment, podId))
    }
    throw new Error(
      `Menu sync failed for ${podId} (menu ${menuRes.status}, items ${itemsRes.status})`
    )
  }

  if (menuItems.length > 0 && catalogItems.length > 0) {
    return mergeModifiersFromItems(menuItems, catalogItems)
  }
  if (menuItems.length > 0) return menuItems
  return catalogItems
}

export async function loadSyncedPodItem(
  adminClient: SupabaseClient,
  podId: string,
  itemCode: string,
  environment: CofeplusEnvironment
): Promise<PodItemOption | null> {
  const { data, error } = await adminClient
    .from('cofeplus_menu_items')
    .select('item_code, display, category, price, out_of_stock, modifiers, raw')
    .eq('environment', environment)
    .eq('pod_id', podId)
    .eq('item_code', itemCode)
    .maybeSingle()

  if (error) {
    console.error('[cofeplus-sync] loadSyncedPodItem failed', error)
    return null
  }
  if (!data) return null
  return podItemFromCacheRow(data)
}

/**
 * Printed latte art only works on the machine items whose menu has a
 * latte-art group (the starred twins, e.g. "Latte*" for "Latte"). Returns the
 * item code to dispatch for this art flag, or null when the pod has no
 * printing version of the drink.
 */
export async function findLatteArtItemCode(
  adminClient: SupabaseClient,
  podId: string,
  itemCode: string,
  environment: CofeplusEnvironment,
  artFlag: string
): Promise<string | null> {
  const { data, error } = await adminClient
    .from('cofeplus_menu_items')
    .select('item_code, display, category, price, out_of_stock, modifiers, raw')
    .eq('environment', environment)
    .eq('pod_id', podId)

  if (error) {
    console.error('[cofeplus-sync] findLatteArtItemCode failed', error)
    return null
  }

  const items = (data || [])
    .map((row) => podItemFromCacheRow(row))
    .filter((item): item is PodItemOption => item !== null)
  const supportsArt = (item: PodItemOption) =>
    item.modifierGroups.some(
      (group) =>
        group.group === LATTE_ART_GROUP &&
        group.options.some((option) => option.flag === artFlag)
    )
  const baseName = (display: string) =>
    display.replace(/\*/g, '').trim().toLowerCase().replace(/\s+/g, ' ')

  const current = items.find((item) => item.itemCode === itemCode)
  if (!current) return null
  if (supportsArt(current)) return current.itemCode

  const twin = items.find(
    (item) =>
      !item.outOfStock &&
      supportsArt(item) &&
      baseName(item.display) === baseName(current.display)
  )
  return twin?.itemCode ?? null
}

async function upsertPodsCache(
  adminClient: SupabaseClient,
  environment: CofeplusEnvironment,
  pods: PodSummary[]
) {
  const syncedAt = new Date().toISOString()
  const rows = pods.map((pod) => ({
    environment,
    pod_id: pod.podId,
    display: pod.display || pod.podId,
    raw: pod,
    synced_at: syncedAt,
  }))

  if (rows.length === 0) return 0

  const { error } = await adminClient.from('cofeplus_pods').upsert(rows, {
    onConflict: 'environment,pod_id',
  })
  if (error) {
    throw new Error(`Failed to save pods: ${error.message}`)
  }
  return rows.length
}

async function upsertMenuCache(
  adminClient: SupabaseClient,
  environment: CofeplusEnvironment,
  podId: string,
  items: PodItemOption[]
) {
  const syncedAt = new Date().toISOString()

  // Replace this pod's cached menu for the environment
  await adminClient
    .from('cofeplus_menu_items')
    .delete()
    .eq('environment', environment)
    .eq('pod_id', podId)

  if (items.length === 0) return 0

  const rows = items.map((item) => ({
    environment,
    pod_id: podId,
    item_code: item.itemCode,
    display: item.display,
    category: item.category || null,
    price: item.price,
    out_of_stock: item.outOfStock,
    modifiers: item.modifiers,
    raw: item,
    synced_at: syncedAt,
  }))

  const { error } = await adminClient.from('cofeplus_menu_items').insert(rows)
  if (error) {
    throw new Error(`Failed to save menu items for ${podId}: ${error.message}`)
  }
  return rows.length
}

async function upsertKiosksFromPods(
  adminClient: SupabaseClient,
  pods: PodSummary[]
) {
  if (pods.length === 0) return 0

  const { data: existingKiosks, error: listError } = await adminClient
    .from('kiosks')
    .select('id, pod_id')

  if (listError) {
    throw new Error(`Failed to load kiosks: ${listError.message}`)
  }

  // One machine: stamp that pod onto existing locations instead of creating a
  // new kiosk named after the CofePlus pod.
  if ((existingKiosks?.length || 0) > 0 && pods.length === 1) {
    const podId = pods[0].podId
    let upserted = 0
    for (const kiosk of existingKiosks || []) {
      if (kiosk.pod_id === podId) {
        upserted += 1
        continue
      }
      const { error } = await adminClient
        .from('kiosks')
        .update({ pod_id: podId, is_active: true })
        .eq('id', kiosk.id)
      if (!error) upserted += 1
    }
    return upserted
  }

  let upserted = 0

  for (const pod of pods) {
    const { data: existing } = await adminClient
      .from('kiosks')
      .select('id')
      .eq('pod_id', pod.podId)
      .maybeSingle()

    if (existing) {
      upserted += 1
      continue
    }

    const { error } = await adminClient.from('kiosks').insert({
      name: pod.display || pod.podId,
      location: pod.display || pod.podId,
      address: `CofePlus pod ${pod.podId}`,
      pod_id: pod.podId,
      is_active: true,
    })
    if (!error) upserted += 1
  }

  return upserted
}

function normalizeProductName(name: string) {
  return normalizeDrinkName(name)
}

async function upsertProductsFromItems(
  adminClient: SupabaseClient,
  items: PodItemOption[]
) {
  let upserted = 0
  const seen = new Set<string>()

  const { data: existingProducts, error: listError } = await adminClient
    .from('products')
    .select('id, name, cofeplus_item_code')

  if (listError) {
    throw new Error(`Failed to load products: ${listError.message}`)
  }

  const byCode = new Map<string, { id: string; name: string; cofeplus_item_code: string | null }>()
  const byName = new Map<string, { id: string; name: string; cofeplus_item_code: string | null }>()
  for (const product of existingProducts || []) {
    if (product.cofeplus_item_code) {
      byCode.set(product.cofeplus_item_code, product)
    }
    byName.set(normalizeProductName(product.name), product)
  }

  for (const item of items) {
    if (!item.itemCode || seen.has(item.itemCode)) continue
    seen.add(item.itemCode)

    const existing =
      byCode.get(item.itemCode) || byName.get(normalizeProductName(item.display))

    if (existing) {
      const { error } = await adminClient
        .from('products')
        .update({ cofeplus_item_code: item.itemCode })
        .eq('id', existing.id)
      if (!error) {
        upserted += 1
        byCode.set(item.itemCode, { ...existing, cofeplus_item_code: item.itemCode })
      }
    }
  }

  const menuCandidates = items
    .filter((item) => item.itemCode && item.display)
    .map((item) => ({ itemCode: item.itemCode, display: item.display }))

  for (const product of existingProducts || []) {
    if (product.cofeplus_item_code) continue
    const match = matchMenuItem(product.name, menuCandidates)
    if (!match) continue
    const { error } = await adminClient
      .from('products')
      .update({ cofeplus_item_code: match.itemCode })
      .eq('id', product.id)
    if (!error) upserted += 1
  }

  return upserted
}

const SKIP_ADDON_GROUPS = new Set([
  'temperature',
  'cup-size',
  'cupSize',
  'cup_size',
  'size',
])

/**
 * Name changes for an existing add-on when the machine label is `label`.
 * Follows the machine while the name is still the previous machine label;
 * keeps an admin rename and flags it for review instead. Null: nothing changed.
 */
export function followMachineLabel(
  existing: { name: string; cofeplus_display: string | null },
  label: string,
  now: string
): {
  cofeplus_display: string
  name?: string
  cofeplus_display_changed_at?: string | null
} | null {
  if (existing.cofeplus_display === label) return null
  // No label stored yet (rows from before labels were tracked): any other name
  // counts as a rename, since nothing says it was ever the machine label
  const renamed =
    existing.cofeplus_display == null
      ? existing.name !== label
      : existing.name !== existing.cofeplus_display
  if (!renamed || existing.name === label) {
    return { cofeplus_display: label, name: label, cofeplus_display_changed_at: null }
  }
  return { cofeplus_display: label, cofeplus_display_changed_at: now }
}

/**
 * Upsert paid customer modifiers from CofePlus into Kafei add_ons.
 * Skips machine-required groups (temperature, cup size).
 *
 * With followLabels (syncing the active environment), names track the machine:
 * an add-on still named after the previous machine label takes the new one, and
 * an admin rename is kept but flagged for review. Other environments only
 * refresh the machine keys, so a test sync cannot relabel live add-ons.
 */
async function upsertAddOnsFromItems(
  adminClient: SupabaseClient,
  items: PodItemOption[],
  followLabels: boolean
) {
  const seen = new Map<
    string,
    {
      group: string
      flag: string
      price: number
      locator?: string
      /** label -> how many drinks use it */
      labels: Map<string, number>
    }
  >()

  for (const item of items) {
    const groups = item.modifierGroups || []
    for (const group of groups) {
      const groupKey = String(group.group || '').toLowerCase()
      if (SKIP_ADDON_GROUPS.has(group.group) || SKIP_ADDON_GROUPS.has(groupKey)) {
        continue
      }
      for (const option of group.options || []) {
        if (!option.flag || option.flag === 'none') continue
        // Skip empty latte-art placeholders that need upload
        if (
          groupKey.includes('latte') &&
          (option.flag === 'catalog' || option.flag === 'upload')
        ) {
          continue
        }
        const key = `${group.group}::${option.flag}`
        const label = String(
          option.display || `${group.display || group.group}: ${option.flag}`
        )
        const entry = seen.get(key)
        if (entry) {
          entry.labels.set(label, (entry.labels.get(label) || 0) + 1)
          continue
        }
        const price =
          typeof option.price === 'number'
            ? option.price
            : Number(option.price) || 0
        seen.set(key, {
          group: group.group,
          flag: option.flag,
          price,
          locator: undefined,
          labels: new Map([[label, 1]]),
        })
      }
    }
  }

  let upserted = 0
  for (const addon of seen.values()) {
    // Drinks can label one flag differently: the most common label wins
    const label = [...addon.labels.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
    )[0][0]

    const { data: existing } = await adminClient
      .from('add_ons')
      .select('id, name, cofeplus_display')
      .eq('cofeplus_group', addon.group)
      .eq('cofeplus_flag', addon.flag)
      .maybeSingle()

    const now = new Date().toISOString()
    const machineKeys = {
      description: `${addon.group} / ${addon.flag}`,
      cofeplus_group: addon.group,
      cofeplus_flag: addon.flag,
      cofeplus_locator: addon.locator || null,
      source: 'cofeplus',
      updated_at: now,
    }

    if (existing) {
      // Keep admin price and visibility. Sync machine keys, and the name only
      // while nobody renamed it.
      const update: Record<string, unknown> = { ...machineKeys }
      if (followLabels) {
        const change = followMachineLabel(existing, label, now)
        if (change) {
          Object.assign(update, change)
          if (change.cofeplus_display_changed_at) {
            console.warn(
              `[cofeplus-sync] ${addon.group}/${addon.flag} is now "${label}" on the machine but named "${existing.name}" in Kafei`
            )
          }
        }
      }
      const { error } = await adminClient
        .from('add_ons')
        .update(update)
        .eq('id', existing.id)
      if (!error) upserted += 1
    } else {
      const { error } = await adminClient.from('add_ons').insert({
        ...machineKeys,
        name: label,
        price: addon.price,
        temperature: 'both' as const,
        is_hidden: false,
        cofeplus_display: label,
      })
      if (!error) upserted += 1
    }
  }

  // Hide legacy manual seed add-ons
  await adminClient
    .from('add_ons')
    .update({ is_hidden: true, updated_at: new Date().toISOString() })
    .eq('source', 'manual')
    .in('name', ['Oat Milk', 'Espresso', 'Flavors'])

  return upserted
}

/**
 * Pull pods + menu from CofePlus, cache them, and optionally map into
 * Kafei kiosks (pod_id) + products (cofeplus_item_code) for mobile orders.
 */
export async function syncCofeplusCatalog(
  adminClient: SupabaseClient,
  options: SyncCatalogOptions
): Promise<SyncCatalogResult> {
  const environment = options.environment === 'live' ? 'live' : 'test'
  const upsertKafei = options.upsertKafeiRecords !== false

  let podsSynced = 0
  let itemsSynced = 0
  let kiosksUpserted = 0
  let productsUpserted = 0
  let pods: PodSummary[] = []

  try {
    pods = await fetchPods(environment)
    podsSynced = await upsertPodsCache(adminClient, environment, pods)

    if (!options.podId?.trim() && pods.length > 0) {
      const keep = pods.map((pod) => pod.podId)
      await adminClient
        .from('cofeplus_pods')
        .delete()
        .eq('environment', environment)
        .not('pod_id', 'in', `(${keep.join(',')})`)
      await adminClient
        .from('cofeplus_menu_items')
        .delete()
        .eq('environment', environment)
        .not('pod_id', 'in', `(${keep.join(',')})`)
    }

    let targetPods: PodSummary[] = options.podId?.trim()
      ? pods.filter((pod) => pod.podId === options.podId?.trim())
      : pods

    if (options.podId?.trim() && targetPods.length === 0) {
      const requested = options.podId.trim()
      throw new Error(
        podAccessHint(
          environment,
          requested,
          pods.map((pod) => pod.podId)
        )
      )
    }

    const allItems: PodItemOption[] = []

    for (const pod of targetPods) {
      try {
        const items = await fetchPodMenu(environment, pod.podId)
        const saved = await upsertMenuCache(
          adminClient,
          environment,
          pod.podId,
          items
        )
        itemsSynced += saved
        allItems.push(...items)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Sync failed'
        if (targetPods.length > 1 && /POD_ACCESS_DENIED|not available on/i.test(message)) {
          console.warn(`[cofeplus-sync] skip ${pod.podId}: ${message}`)
          continue
        }
        throw err
      }
    }

    if (upsertKafei) {
      kiosksUpserted = await upsertKiosksFromPods(
        adminClient,
        targetPods.length > 0 ? targetPods : pods
      )
      productsUpserted = await upsertProductsFromItems(adminClient, allItems)
      try {
        const activeEnvironment = await getActiveCofeplusEnvironment(adminClient)
        await upsertAddOnsFromItems(
          adminClient,
          allItems,
          environment === activeEnvironment
        )
      } catch (err) {
        console.warn('[cofeplus-sync] add-on upsert failed', err)
      }
    }

    await adminClient.from('cofeplus_sync_runs').insert({
      environment,
      pod_id: options.podId?.trim() || null,
      pods_synced: podsSynced,
      items_synced: itemsSynced,
      kiosks_upserted: kiosksUpserted,
      products_upserted: productsUpserted,
      status: 'success',
    })

    return {
      ok: true,
      environment,
      podsSynced,
      itemsSynced,
      kiosksUpserted,
      productsUpserted,
      pods: targetPods.length > 0 ? targetPods : pods,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sync failed'
    await adminClient.from('cofeplus_sync_runs').insert({
      environment,
      pod_id: options.podId?.trim() || null,
      pods_synced: podsSynced,
      items_synced: itemsSynced,
      kiosks_upserted: kiosksUpserted,
      products_upserted: productsUpserted,
      status: 'failed',
      error: message,
    })

    return {
      ok: false,
      environment,
      podsSynced,
      itemsSynced,
      kiosksUpserted,
      productsUpserted,
      pods,
      error: message,
    }
  }
}

import type { SupabaseClient } from '@supabase/supabase-js'
import type { CofeplusEnvironment } from '@/lib/cofeplus/config'
import { executeCofeplusRequest } from '@/lib/cofeplus/proxy'
import {
  parsePodItems,
  parsePods,
  podItemFromCacheRow,
  type PodItemOption,
  type PodSummary,
} from '@/components/api-test/cofeplus-test-shared'

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

const MENU_FETCH_TIMEOUT_MS = 12_000

async function fetchPods(environment: CofeplusEnvironment): Promise<PodSummary[]> {
  const response = await executeCofeplusRequest({
    method: 'GET',
    path: '/partner/v1/pods',
    environment,
    timeoutMs: MENU_FETCH_TIMEOUT_MS,
  })
  if (!response.ok) {
    throw new Error(`List pods failed (${response.status}): ${response.body.slice(0, 240)}`)
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

  if (menuItems.length > 0) {
    return menuItems
  }

  const itemsRes = await executeCofeplusRequest({
    method: 'GET',
    path: `/partner/v1/pods/${encodeURIComponent(podId)}/items`,
    query: { lang: 'en' },
    environment,
    timeoutMs: MENU_FETCH_TIMEOUT_MS,
  })

  if (!itemsRes.ok) {
    throw new Error(
      `Menu sync failed for ${podId} (menu ${menuRes.status}, items ${itemsRes.status})`
    )
  }

  try {
    return parsePodItems(itemsRes.body)
  } catch (err) {
    console.error('[cofeplus-sync] parse items failed', err)
    return []
  }
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
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
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
      continue
    }

    // Leave unmatched CofePlus drinks in cofeplus_menu_items only.
    // The Kafei product catalog stays curated; dispatch reads the synced cache.
  }

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

    let targetPods: PodSummary[] = options.podId?.trim()
      ? pods.filter((pod) => pod.podId === options.podId?.trim())
      : pods

    if (options.podId?.trim() && targetPods.length === 0) {
      // Still allow syncing a manually entered pod that wasn't in the list
      const manualPod = {
        podId: options.podId.trim(),
        display: options.podId.trim(),
      }
      targetPods = [manualPod]
      podsSynced = await upsertPodsCache(adminClient, environment, [
        ...pods,
        manualPod,
      ])
    }

    const allItems: PodItemOption[] = []

    for (const pod of targetPods) {
      const items = await fetchPodMenu(environment, pod.podId)
      const saved = await upsertMenuCache(
        adminClient,
        environment,
        pod.podId,
        items
      )
      itemsSynced += saved
      allItems.push(...items)
    }

    if (upsertKafei) {
      kiosksUpserted = await upsertKiosksFromPods(
        adminClient,
        targetPods.length > 0 ? targetPods : pods
      )
      productsUpserted = await upsertProductsFromItems(adminClient, allItems)
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

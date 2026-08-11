import type { SupabaseClient } from '@supabase/supabase-js'
import type { CofeplusEnvironment } from '@/lib/cofeplus/config'
import { executeCofeplusRequest } from '@/lib/cofeplus/proxy'
import {
  mergeModifiersFromItems,
  parsePodItems,
  parsePods,
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

async function fetchPods(environment: CofeplusEnvironment): Promise<PodSummary[]> {
  const response = await executeCofeplusRequest({
    method: 'GET',
    path: '/partner/v1/pods',
    environment,
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
  const [menuRes, itemsRes] = await Promise.all([
    executeCofeplusRequest({
      method: 'GET',
      path: `/partner/v1/pods/${encodeURIComponent(podId)}/menu`,
      environment,
    }),
    executeCofeplusRequest({
      method: 'GET',
      path: `/partner/v1/pods/${encodeURIComponent(podId)}/items`,
      environment,
    }),
  ])

  let menuItems: PodItemOption[] = []
  let flatItems: PodItemOption[] = []

  if (menuRes.ok) {
    try {
      menuItems = parsePodItems(menuRes.body)
    } catch (err) {
      console.error('[cofeplus-sync] parse menu failed', err)
    }
  }

  if (itemsRes.ok) {
    try {
      flatItems = parsePodItems(itemsRes.body)
    } catch (err) {
      console.error('[cofeplus-sync] parse items failed', err)
    }
  }

  if (menuItems.length > 0) {
    return mergeModifiersFromItems(menuItems, flatItems)
  }
  return flatItems
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
  let upserted = 0

  for (const pod of pods) {
    const { data: existing } = await adminClient
      .from('kiosks')
      .select('id')
      .eq('pod_id', pod.podId)
      .maybeSingle()

    if (existing) {
      const { error } = await adminClient
        .from('kiosks')
        .update({
          name: pod.display || pod.podId,
          location: pod.display || pod.podId,
          is_active: true,
        })
        .eq('id', existing.id)
      if (!error) upserted += 1
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

function guessTemperature(
  display: string,
  category: string
): 'hot' | 'cold' | 'both' | null {
  const text = `${display} ${category}`.toLowerCase()
  const isIced = /\b(iced|ice|cold|frappe|frappé)\b/.test(text)
  const isHot = /\b(hot|warm)\b/.test(text)
  if (isIced && isHot) return 'both'
  if (isIced) return 'cold'
  if (isHot) return 'hot'
  return null
}

async function upsertProductsFromItems(
  adminClient: SupabaseClient,
  items: PodItemOption[]
) {
  let upserted = 0
  const seen = new Set<string>()

  for (const item of items) {
    if (!item.itemCode || seen.has(item.itemCode)) continue
    seen.add(item.itemCode)

    const { data: existing } = await adminClient
      .from('products')
      .select('id')
      .eq('cofeplus_item_code', item.itemCode)
      .maybeSingle()

    const payload = {
      name: item.display,
      description: item.category
        ? `${item.category} · synced from CofePlus`
        : 'Synced from CofePlus',
      price: Number(item.price) || 0,
      temperature: guessTemperature(item.display, item.category),
      is_hidden: item.outOfStock || item.offMenu,
      cofeplus_item_code: item.itemCode,
    }

    if (existing) {
      const { error } = await adminClient
        .from('products')
        .update(payload)
        .eq('id', existing.id)
      if (!error) upserted += 1
      continue
    }

    const { error } = await adminClient.from('products').insert(payload)
    if (!error) upserted += 1
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

import type { SupabaseClient } from '@supabase/supabase-js'
import { parseHandArtLocator } from '@/lib/cofeplus/latte-art-contract'

export interface AddonInfo {
  id: string
  name: string
  price: number
  group: string | null
}

const GROUP_LABELS: Record<string, string> = {
  milk: 'Milk',
  profile: 'Strength',
  bean: 'Bean',
  sweetness: 'Sweetness',
  syrup: 'Syrup',
  lid: 'Lid',
}

// Older orders stored add-ons as a JSON string inside the jsonb column; newer ones store an array.
export function parseAddonIds(value: unknown): string[] {
  let list: unknown = value
  if (typeof value === 'string') {
    try {
      list = JSON.parse(value)
    } catch {
      list = []
    }
  }
  return Array.isArray(list) ? list.filter((id): id is string => typeof id === 'string') : []
}

/** Names and prices for every add-on id used by these order items, in one query. */
export async function loadAddonMap(
  supabase: SupabaseClient,
  items: { addons?: unknown }[]
): Promise<Map<string, AddonInfo>> {
  const ids = [...new Set(items.flatMap((item) => parseAddonIds(item.addons)))]
  const map = new Map<string, AddonInfo>()
  if (ids.length === 0) return map

  const { data } = await supabase
    .from('add_ons')
    .select('id, name, price, cofeplus_group')
    .in('id', ids)

  for (const row of data || []) {
    map.set(row.id, {
      id: row.id,
      name: row.name,
      price: Number(row.price) || 0,
      group: row.cofeplus_group ?? null,
    })
  }
  return map
}

export function addonLabel(addon: AddonInfo) {
  const group = addon.group ? GROUP_LABELS[addon.group] || addon.group : null
  const name = group ? `${group}: ${addon.name}` : addon.name
  return addon.price > 0 ? `${name} (+$${addon.price.toFixed(2)})` : name
}

/** Heart and Leaf are stored as catalog plus a hand-art locator. */
export function describeLatteArt(
  flag: unknown,
  locator: unknown
): { label: string; imageUrl: string | null } | null {
  if (typeof flag !== 'string' || !flag || flag === 'none') return null
  const value = typeof locator === 'string' ? locator.trim() : ''
  const hand = parseHandArtLocator(value)
  if (hand) {
    return { label: hand === 'heart' ? 'Heart (hand poured)' : 'Leaf (hand poured)', imageUrl: null }
  }
  const imageUrl = /^https?:\/\//.test(value) ? value : null
  if (flag === 'upload') return { label: 'Customer photo (printed)', imageUrl }
  return { label: 'Random design (printed)', imageUrl }
}

/** One line per order item for tables and CSV export, e.g. "Hot Latte · Milk: Oat Milk · Art: Heart". */
export function summarizeOrderItem(
  item: { addons?: unknown; latte_art_flag?: unknown; latte_art_locator?: unknown; products?: unknown },
  addonMap: Map<string, AddonInfo>
) {
  const product = Array.isArray(item.products) ? item.products[0] : item.products
  const productName =
    product && typeof product === 'object' && typeof (product as { name?: unknown }).name === 'string'
      ? (product as { name: string }).name
      : 'Unknown drink'
  const parts = [productName]
  for (const id of parseAddonIds(item.addons)) {
    const addon = addonMap.get(id)
    parts.push(addon ? addonLabel(addon) : 'Removed add-on')
  }
  const art = describeLatteArt(item.latte_art_flag, item.latte_art_locator)
  if (art) parts.push(`Art: ${art.label}`)
  return parts.join(' · ')
}

export interface OrderItemDetails {
  /** One line per add-on, e.g. { label: 'Milk', value: 'Oat Milk', price: 0.8 } */
  options: { label: string; value: string; price: number }[]
  latte_art: { label: string; image_url: string | null } | null
}

/** What the customer picked for one order item, ready for the app to show. */
export function buildItemDetails(
  item: { addons?: unknown; latte_art_flag?: unknown; latte_art_locator?: unknown },
  addonMap: Map<string, AddonInfo>
): OrderItemDetails {
  const options = parseAddonIds(item.addons).map((id) => {
    const addon = addonMap.get(id)
    if (!addon) return { label: 'Add-on', value: 'Removed add-on', price: 0 }
    const label = addon.group ? GROUP_LABELS[addon.group] || addon.group : 'Extra'
    return { label, value: addon.name, price: addon.price }
  })
  const art = describeLatteArt(item.latte_art_flag, item.latte_art_locator)
  return {
    options,
    latte_art: art ? { label: art.label, image_url: art.imageUrl } : null,
  }
}

type OrderWithItems = {
  order_items?: { addons?: unknown; latte_art_flag?: unknown; latte_art_locator?: unknown }[] | null
}

/** Adds item_details to every order item, loading add-on names in one query. */
export async function withItemDetails<T extends OrderWithItems>(
  supabase: SupabaseClient,
  orders: T[]
): Promise<T[]> {
  const items = orders.flatMap((order) => order.order_items || [])
  if (items.length === 0) return orders
  const addonMap = await loadAddonMap(supabase, items)
  return orders.map((order) => ({
    ...order,
    order_items: (order.order_items || []).map((item) => ({
      ...item,
      item_details: buildItemDetails(item, addonMap),
    })),
  }))
}

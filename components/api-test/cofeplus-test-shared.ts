import type { CofeplusEnvironment } from '@/lib/cofeplus/config'

export type { CofeplusEnvironment }

export interface ConnectionState {
  environment: CofeplusEnvironment
  baseUrl: string
  accessToken: string
  defaultPodId: string
  hasEnvToken: boolean
  hasHmacSecret: boolean
  hasTestHmacSecret: boolean
  hasLiveHmacSecret: boolean
  testBaseUrl: string
  liveBaseUrl: string
  kid: string
  tokenExpiresAt: string | null
}

export interface PodSummary {
  podId: string
  display: string
}

export interface DispatchModifier {
  group: string
  flag: string
  price?: number
  locator?: string
}

export interface ModifierOption {
  flag: string
  display: string
  price?: number
  isDefault: boolean
  /** When set, this option is only valid if the required group flag is selected */
  requires?: {
    group: string
    flags: string[]
  }
}

export interface ModifierGroup {
  group: string
  display: string
  options: ModifierOption[]
}

export interface PodItemOption {
  itemCode: string
  display: string
  price: number
  outOfStock: boolean
  offMenu: boolean
  category: string
  /** Currently selected modifiers (defaults until the user configures) */
  modifiers: DispatchModifier[]
  /** Full catalog of modifier groups/options for configuration UI */
  modifierGroups: ModifierGroup[]
}

export interface CreateDispatchResult {
  id: string
  orderNumber: string
  pickupCode: string
}

export interface OrderHistoryItem {
  id: string
  podId: string
  state: string
  timeCreated: string
  itemCount: number
  queueToken: string
  pickupCode: string
  isRefunded: boolean
  paymentAmount: number
}

export interface OrderHistoryPage {
  items: OrderHistoryItem[]
  nextCursor: string | null
}

export interface DispatchSnapshot {
  id: string
  state: string
  orderNumber: string
  pickupCode: string
  archived: boolean
  itemCount: number
  lineItemCodes: string[]
}

export interface HealthReadiness {
  status: string
  dependencies: Record<string, string>
}

export function formatJson(raw: string) {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

export function parsePods(raw: string): PodSummary[] {
  const data = JSON.parse(raw) as unknown
  if (!Array.isArray(data)) {
    throw new Error('Unexpected pods response shape')
  }

  return data
    .map((pod) => {
      if (!pod || typeof pod !== 'object') return null
      const record = pod as Record<string, unknown>
      const podId = typeof record.podId === 'string' ? record.podId : ''
      if (!podId) return null
      return {
        podId,
        display:
          typeof record.display === 'string' && record.display
            ? record.display
            : podId,
      }
    })
    .filter((pod): pod is PodSummary => pod !== null)
}

export function parsePod(raw: string): PodSummary {
  const record = asRecord(JSON.parse(raw) as unknown)
  if (!record || typeof record.podId !== 'string' || !record.podId) {
    throw new Error('Unexpected pod response shape')
  }
  return {
    podId: record.podId,
    display:
      typeof record.display === 'string' && record.display
        ? record.display
        : record.podId,
  }
}

export function parsePodStatus(raw: string): string {
  return raw.trim() || '(empty)'
}

export function parseHealthReadiness(raw: string): HealthReadiness {
  const record = asRecord(JSON.parse(raw) as unknown)
  if (!record || typeof record.status !== 'string') {
    throw new Error('Unexpected readiness response shape')
  }
  const dependencies = asRecord(record.dependencies) || {}
  const normalized: Record<string, string> = {}
  for (const [key, value] of Object.entries(dependencies)) {
    if (typeof value === 'string') normalized[key] = value
  }
  return { status: record.status, dependencies: normalized }
}

function mapOrderHistoryItem(raw: unknown): OrderHistoryItem | null {
  const record = asRecord(raw)
  if (!record || typeof record.id !== 'string') return null
  return {
    id: record.id,
    podId: typeof record.podId === 'string' ? record.podId : '',
    state: typeof record.state === 'string' ? record.state : 'unknown',
    timeCreated:
      typeof record.timeCreated === 'string' ? record.timeCreated : '',
    itemCount: typeof record.itemCount === 'number' ? record.itemCount : 0,
    queueToken:
      typeof record.queueToken === 'string' ? record.queueToken : '',
    pickupCode:
      typeof record.pickupCode === 'string' ? record.pickupCode : '',
    isRefunded: record.isRefunded === true,
    paymentAmount:
      typeof record.paymentAmount === 'number' ? record.paymentAmount : 0,
  }
}

export function parseOrderHistoryPage(raw: string): OrderHistoryPage {
  const record = asRecord(JSON.parse(raw) as unknown)
  if (!record || !Array.isArray(record.items)) {
    throw new Error('Unexpected orders response shape (expected { items, nextCursor })')
  }
  return {
    items: record.items
      .map(mapOrderHistoryItem)
      .filter((item): item is OrderHistoryItem => item !== null),
    nextCursor:
      typeof record.nextCursor === 'string' && record.nextCursor
        ? record.nextCursor
        : null,
  }
}

export function parseOrderHistoryExport(raw: string): OrderHistoryItem[] {
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  return lines
    .map((line) => {
      try {
        return mapOrderHistoryItem(JSON.parse(line) as unknown)
      } catch {
        return null
      }
    })
    .filter((item): item is OrderHistoryItem => item !== null)
}

export function parseSingleItem(raw: string, category = 'Item'): PodItemOption {
  const mapped = mapRawItem(JSON.parse(raw) as unknown, category)
  if (!mapped) {
    throw new Error('Unexpected item response shape')
  }
  return mapped
}

/**
 * `/partner/v1/menus/{podId}` omits modifiers; merge them from a flat `/items` list.
 */
export function mergeModifiersFromItems(
  primary: PodItemOption[],
  secondary: PodItemOption[]
): PodItemOption[] {
  const byCode = new Map(secondary.map((item) => [item.itemCode, item]))
  return primary.map((item) => {
    if (item.modifierGroups.length > 0 || item.modifiers.length > 0) return item
    const match = byCode.get(item.itemCode)
    if (!match || (match.modifierGroups.length === 0 && match.modifiers.length === 0)) {
      return item
    }
    return {
      ...item,
      modifiers: match.modifiers,
      modifierGroups: match.modifierGroups,
      price: item.price || match.price,
    }
  })
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null
  return value as Record<string, unknown>
}

function parseModifierGroups(rawModifiers: unknown): ModifierGroup[] {
  if (!Array.isArray(rawModifiers)) return []

  const groups: ModifierGroup[] = []

  for (const rawGroup of rawModifiers) {
    const groupRecord = asRecord(rawGroup)
    if (!groupRecord) continue
    const group =
      typeof groupRecord.group === 'string' ? groupRecord.group : ''
    if (!group) continue

    const options = Array.isArray(groupRecord.options)
      ? groupRecord.options
          .map((option) => asRecord(option))
          .filter((option): option is Record<string, unknown> => option !== null)
          .map((option): ModifierOption | null => {
            const flag = typeof option.flag === 'string' ? option.flag : ''
            if (!flag) return null

            const requiresRecord = asRecord(option.requires)
            let requires: ModifierOption['requires']
            if (
              requiresRecord &&
              typeof requiresRecord.group === 'string' &&
              Array.isArray(requiresRecord.options)
            ) {
              const flags = requiresRecord.options
                .map((entry) => asRecord(entry)?.flag)
                .filter((entry): entry is string => typeof entry === 'string')
              if (flags.length > 0) {
                requires = { group: requiresRecord.group, flags }
              }
            }

            return {
              flag,
              display:
                (typeof option.display === 'string' && option.display) ||
                (typeof option.displayShort === 'string' && option.displayShort) ||
                flag,
              price: typeof option.price === 'number' ? option.price : undefined,
              isDefault: option.isDefault === true,
              requires,
            }
          })
          .filter((option): option is ModifierOption => option !== null)
      : []

    if (options.length === 0) continue

    groups.push({
      group,
      display:
        (typeof groupRecord.display === 'string' && groupRecord.display) ||
        (typeof groupRecord.displayShort === 'string' &&
          groupRecord.displayShort) ||
        group,
      options,
    })
  }

  return groups
}

function optionMatchesRequires(
  option: ModifierOption,
  selectedByGroup: Map<string, string>
) {
  if (!option.requires) return true
  const selected = selectedByGroup.get(option.requires.group)
  if (!selected) return true
  return option.requires.flags.includes(selected)
}

/**
 * Resolve selected modifiers from a catalog.
 * `preferred` maps group → flag (user overrides). Falls back to isDefault / first valid.
 */
export function selectModifiersFromGroups(
  groups: ModifierGroup[],
  preferred: Record<string, string> = {}
): DispatchModifier[] {
  const selectedByGroup = new Map<string, string>()
  const result: DispatchModifier[] = []

  // Resolve temperature first so cupSize / dependent options can filter
  const temperatureGroup = groups.find((group) => group.group === 'temperature')
  if (temperatureGroup) {
    const preferredFlag = preferred.temperature
    const selected =
      temperatureGroup.options.find((option) => option.flag === preferredFlag) ||
      temperatureGroup.options.find((option) => option.isDefault) ||
      temperatureGroup.options[0]
    if (selected) selectedByGroup.set('temperature', selected.flag)
  }

  for (const group of groups) {
    const preferredFlag = preferred[group.group]
    const validOptions = group.options.filter((option) =>
      optionMatchesRequires(option, selectedByGroup)
    )
    const pool = validOptions.length > 0 ? validOptions : group.options

    const selected =
      pool.find((option) => option.flag === preferredFlag) ||
      pool.find((option) => option.isDefault) ||
      pool[0]

    if (!selected) continue

    // Skip empty latte-art; catalog/upload need locator we don't have in this tester
    if (
      group.group === 'latte-art' &&
      (selected.flag === 'none' ||
        selected.flag === 'catalog' ||
        selected.flag === 'upload')
    ) {
      continue
    }

    const modifier: DispatchModifier = {
      group: group.group,
      flag: selected.flag,
    }
    if (typeof selected.price === 'number') {
      modifier.price = selected.price
    }
    result.push(modifier)
    selectedByGroup.set(group.group, selected.flag)
  }

  return result
}

export function modifiersToChoiceMap(
  modifiers: DispatchModifier[]
): Record<string, string> {
  return Object.fromEntries(
    modifiers.map((modifier) => [modifier.group, modifier.flag])
  )
}

export function modifierExtraTotal(modifiers: DispatchModifier[]) {
  return modifiers.reduce((sum, modifier) => sum + (modifier.price || 0), 0)
}

export function podItemFromCacheRow(row: {
  item_code?: string
  display?: string
  category?: string | null
  price?: number | string | null
  out_of_stock?: boolean | null
  modifiers?: unknown
  raw?: unknown
}): PodItemOption | null {
  const raw = row.raw
  if (raw && typeof raw === 'object') {
    const item = raw as Partial<PodItemOption>
    if (typeof item.itemCode === 'string' && item.itemCode && Array.isArray(item.modifiers)) {
      return {
        itemCode: item.itemCode,
        display: item.display || row.display || item.itemCode,
        price: Number(item.price ?? row.price) || 0,
        outOfStock: item.outOfStock === true || row.out_of_stock === true,
        offMenu: item.offMenu === true,
        category: item.category || row.category || 'Menu',
        modifiers: item.modifiers,
        modifierGroups: Array.isArray(item.modifierGroups) ? item.modifierGroups : [],
      }
    }

    const mapped = mapRawItem(raw, row.category || 'Menu')
    if (mapped) return mapped
  }

  const itemCode = row.item_code?.trim() || ''
  if (!itemCode) return null

  return {
    itemCode,
    display: row.display?.trim() || itemCode,
    price: Number(row.price) || 0,
    outOfStock: row.out_of_stock === true,
    offMenu: false,
    category: row.category || 'Menu',
    modifiers: Array.isArray(row.modifiers) ? (row.modifiers as DispatchModifier[]) : [],
    modifierGroups: [],
  }
}

function mapRawItem(
  rawItem: unknown,
  category: string
): PodItemOption | null {
  const record = asRecord(rawItem)
  if (!record) return null

  const itemCode = typeof record.itemCode === 'string' ? record.itemCode : ''
  if (!itemCode || itemCode === '___INVALID_ITEM_CODE___') return null
  if (record.isProduct === false) return null

  const badges = Array.isArray(record.badges) ? record.badges : []
  const outOfStock = badges.includes('out-of-stock')
  const offMenu = badges.includes('off-menu')
  const modifierGroups = parseModifierGroups(record.modifiers)
  const modifiers = selectModifiersFromGroups(modifierGroups)

  return {
    itemCode,
    display:
      typeof record.display === 'string' && record.display
        ? record.display
        : itemCode,
    price: typeof record.price === 'number' ? record.price : 0,
    outOfStock,
    offMenu,
    category,
    modifiers,
    modifierGroups,
  }
}

/**
 * Accepts either:
 * - flat item list from `/partner/v1/pods/{podId}/items`
 * - menu categories from `/partner/v1/pods/{podId}/menu` or `/partner/v1/menus/{podId}`
 */
export function parsePodItems(raw: string): PodItemOption[] {
  const data = JSON.parse(raw) as unknown
  if (!Array.isArray(data)) {
    throw new Error('Unexpected items/menu response shape')
  }

  const looksLikeMenu = data.some((entry) => {
    const record = asRecord(entry)
    return Boolean(record && Array.isArray(record.items) && !record.itemCode)
  })

  const mapped: PodItemOption[] = []

  if (looksLikeMenu) {
    for (const categoryEntry of data) {
      const categoryRecord = asRecord(categoryEntry)
      if (!categoryRecord) continue
      const category =
        (typeof categoryRecord.display === 'string' && categoryRecord.display) ||
        (typeof categoryRecord.category === 'string' && categoryRecord.category) ||
        'Menu'
      const items = Array.isArray(categoryRecord.items)
        ? categoryRecord.items
        : []
      for (const item of items) {
        const mappedItem = mapRawItem(item, category)
        if (mappedItem) mapped.push(mappedItem)
      }
    }
  } else {
    for (const item of data) {
      const mappedItem = mapRawItem(item, 'Items')
      if (mappedItem) mapped.push(mappedItem)
    }
  }

  // Prefer on-menu sellable items; dedupe codes that appear in multiple categories
  const seen = new Set<string>()
  return mapped
    .filter((item) => !item.offMenu)
    .filter((item) => {
      if (seen.has(item.itemCode)) return false
      seen.add(item.itemCode)
      return true
    })
    .sort((a, b) => {
      const categoryCompare = a.category.localeCompare(b.category)
      if (categoryCompare !== 0) return categoryCompare
      return a.display.localeCompare(b.display)
    })
}

export function parseCreateDispatch(raw: string): CreateDispatchResult {
  const data = JSON.parse(raw) as Record<string, unknown>
  const id = typeof data.id === 'string' ? data.id : ''
  if (!id) {
    throw new Error('Create dispatch response missing id')
  }

  return {
    id,
    orderNumber:
      typeof data.orderNumber === 'string' ? data.orderNumber : '(none)',
    pickupCode:
      typeof data.pickupCode === 'string' ? data.pickupCode : '(none)',
  }
}

export function parseDispatchState(raw: string): string {
  try {
    const data = JSON.parse(raw) as Record<string, unknown>
    return typeof data.state === 'string' ? data.state : 'unknown'
  } catch {
    return 'unknown'
  }
}

export function parseDispatchSnapshot(
  raw: string,
  fallbackId = ''
): DispatchSnapshot {
  const data = asRecord(JSON.parse(raw) as unknown)
  if (!data || typeof data !== 'object') {
    throw new Error('Unexpected dispatch/order response shape')
  }

  const id =
    (typeof data.id === 'string' && data.id) ||
    fallbackId ||
    ''
  if (!id && typeof data.state !== 'string') {
    throw new Error('Unexpected dispatch/order response shape')
  }

  const lineItems = Array.isArray(data.lineItems) ? data.lineItems : []
  const lineRecords = lineItems
    .map((line) => asRecord(line))
    .filter((line): line is Record<string, unknown> => line !== null)
  const lineItemCodes = lineRecords
    .map((line) => (typeof line.itemCode === 'string' ? line.itemCode : ''))
    .filter(Boolean)

  const lineStatuses = lineRecords
    .map((line) => (typeof line.status === 'string' ? line.status.toLowerCase() : ''))
    .filter(Boolean)

  let state =
    typeof data.state === 'string' && data.state
      ? data.state.toLowerCase()
      : lineStatuses[0] || 'unknown'

  // Official FetchDispatchState / DispatchLineItemStatus:
  // pending, accepted, making, ready, done, failed.
  // If every line is already terminal, trust that over a stale parent state.
  const allLinesTerminal =
    lineStatuses.length > 0 &&
    lineStatuses.every((status) => status === 'done' || status === 'failed')
  if (allLinesTerminal) {
    state = lineStatuses.some((status) => status === 'failed') ? 'failed' : 'done'
  }

  return {
    id: id || fallbackId || 'unknown',
    state,
    orderNumber:
      typeof data.orderNumber === 'string'
        ? data.orderNumber
        : typeof data.queueToken === 'string'
          ? data.queueToken
          : '(none)',
    pickupCode:
      typeof data.pickupCode === 'string' ? data.pickupCode : '(none)',
    archived:
      data.archived === true ||
      (typeof data.archivedAt === 'string' && Boolean(data.archivedAt)) ||
      (typeof data.timeArchived === 'string' && Boolean(data.timeArchived)),
    itemCount: typeof data.itemCount === 'number' ? data.itemCount : lineItemCodes.length,
    lineItemCodes,
  }
}

export function isDispatchArchivedError(status: number, raw: string): boolean {
  if (status !== 410) return false
  try {
    const data = asRecord(JSON.parse(raw) as unknown)
    return (
      data?.code === 'DISPATCH_ARCHIVED' ||
      data?.message === 'DISPATCH_ARCHIVED' ||
      data?.error === 'DISPATCH_ARCHIVED' ||
      raw.includes('DISPATCH_ARCHIVED')
    )
  } catch {
    return raw.includes('DISPATCH_ARCHIVED')
  }
}

export function parseOamMenuSummary(raw: string): {
  categoryCount: number
  itemCodeCount: number
} {
  const data = JSON.parse(raw) as unknown
  if (!Array.isArray(data)) {
    throw new Error('Unexpected OAM menu response shape')
  }
  let itemCodeCount = 0
  for (const entry of data) {
    const record = asRecord(entry)
    const items = Array.isArray(record?.items) ? record.items : []
    itemCodeCount += items.length
  }
  return { categoryCount: data.length, itemCodeCount }
}

/**
 * Human-readable parse summary for the raw API tester result panel.
 */
export function summarizeCofeplusResponse(
  endpointId: string,
  status: number,
  raw: string
): string | null {
  try {
    switch (endpointId) {
      case 'health-liveness':
        return `Liveness: ${raw.trim() || '(empty)'}`
      case 'health-readiness': {
        const readiness = parseHealthReadiness(raw)
        const deps = Object.entries(readiness.dependencies)
          .map(([key, value]) => `${key}=${value}`)
          .join(', ')
        return `Status: ${readiness.status}${deps ? ` (${deps})` : ''}`
      }
      case 'list-pods': {
        const pods = parsePods(raw)
        return `${pods.length} pods: ${pods.map((p) => p.podId).join(', ') || '(none)'}`
      }
      case 'fetch-pod': {
        const pod = parsePod(raw)
        return `Pod ${pod.podId} — ${pod.display}`
      }
      case 'fetch-pod-status':
        return `Pod status: ${parsePodStatus(raw)}`
      case 'list-menu':
      case 'fetch-pod-menu':
      case 'list-pod-items': {
        const items = parsePodItems(raw)
        const withMods = items.filter((item) => item.modifiers.length > 0).length
        return `${items.length} sellable items (${withMods} with default modifiers)`
      }
      case 'fetch-item':
      case 'fetch-pod-item': {
        const item = parseSingleItem(raw)
        return `${item.display} (${item.itemCode}) — S$${item.price}, ${item.modifiers.length} default modifiers`
      }
      case 'create-dispatch': {
        const created = parseCreateDispatch(raw)
        return `Dispatch ${created.id} · order ${created.orderNumber} · pickup ${created.pickupCode}`
      }
      case 'fetch-dispatch':
      case 'fetch-order-history': {
        if (isDispatchArchivedError(status, raw)) {
          return 'Dispatch archived (410) — use GET /partner/v1/pods/{podId}/orders/{orderId}'
        }
        const snap = parseDispatchSnapshot(raw)
        return `${snap.archived ? 'Archived order' : 'Dispatch'} ${snap.id} · state=${snap.state} · items=${snap.itemCount}${
          snap.lineItemCodes.length
            ? ` [${snap.lineItemCodes.join(', ')}]`
            : ''
        }`
      }
      case 'query-orders': {
        const page = parseOrderHistoryPage(raw)
        return `${page.items.length} orders${page.nextCursor ? ' (has nextCursor)' : ''} · states: ${
          [...new Set(page.items.map((item) => item.state))].join(', ') || '(none)'
        }`
      }
      case 'export-orders': {
        const items = parseOrderHistoryExport(raw)
        return `NDJSON export: ${items.length} orders`
      }
      case 'oam-get-menu': {
        const summary = parseOamMenuSummary(raw)
        return `OAM menu: ${summary.categoryCount} categories, ${summary.itemCodeCount} item refs`
      }
      default:
        return null
    }
  } catch (err) {
    return `Parse note: ${err instanceof Error ? err.message : 'unrecognized shape'}`
  }
}

export const TERMINAL_DISPATCH_STATES = new Set(['ready', 'done', 'failed'])

export function buildDispatchBody(item: PodItemOption, options?: {
  lang?: string
  channel?: 'mobile' | 'on-site'
  deliveryPort?: number
  displayNote?: string
  modifiers?: DispatchModifier[]
}) {
  const qty = 1
  const unitPrice = item.price
  const modifiers = options?.modifiers ?? item.modifiers
  const total = (unitPrice + modifierExtraTotal(modifiers)) * qty
  const body = {
    pricing: {
      total,
      ccy: 'SGD',
      charges: [] as unknown[],
    },
    lang: options?.lang || 'en',
    itemCount: qty,
    channel: options?.channel || 'mobile',
    deliveryPort: options?.deliveryPort ?? 1,
    lineItems: [
      {
        qty,
        price: unitPrice,
        itemCode: item.itemCode,
        modifiers: modifiers.map(({ group, flag, price, locator }) => {
          const modifier: Record<string, unknown> = { group, flag }
          if (typeof price === 'number') modifier.price = price
          if (typeof locator === 'string') modifier.locator = locator
          return modifier
        }),
        displayNote: options?.displayNote || item.display,
      },
    ],
  }

  return JSON.stringify(body, null, 2)
}

export function applyItemToDispatchBody(body: string, item: PodItemOption) {
  const parsed = JSON.parse(body || '{}') as Record<string, unknown>
  const lineItems = Array.isArray(parsed.lineItems) ? [...parsed.lineItems] : [{}]
  const first =
    lineItems[0] && typeof lineItems[0] === 'object'
      ? { ...(lineItems[0] as Record<string, unknown>) }
      : {}

  first.itemCode = item.itemCode
  first.price = item.price
  first.qty = typeof first.qty === 'number' ? first.qty : 1
  first.modifiers = item.modifiers.map(({ group, flag, price, locator }) => {
    const modifier: Record<string, unknown> = { group, flag }
    if (typeof price === 'number') modifier.price = price
    if (typeof locator === 'string') modifier.locator = locator
    return modifier
  })
  first.displayNote =
    typeof first.displayNote === 'string' && first.displayNote.trim()
      ? first.displayNote
      : item.display

  lineItems[0] = first
  parsed.lineItems = lineItems
  parsed.itemCount =
    typeof parsed.itemCount === 'number'
      ? parsed.itemCount
      : lineItems.reduce((sum, line) => {
          const qty =
            line &&
            typeof line === 'object' &&
            typeof (line as { qty?: unknown }).qty === 'number'
              ? (line as { qty: number }).qty
              : 1
          return sum + qty
        }, 0)

  const pricing: Record<string, unknown> =
    parsed.pricing && typeof parsed.pricing === 'object'
      ? { ...(parsed.pricing as Record<string, unknown>) }
      : { ccy: 'SGD', charges: [] }
  const qty = typeof first.qty === 'number' ? first.qty : 1
  pricing.total = (item.price + modifierExtraTotal(item.modifiers)) * qty
  if (!pricing.ccy) pricing.ccy = 'SGD'
  if (!Array.isArray(pricing.charges)) pricing.charges = []
  parsed.pricing = pricing

  if (!parsed.lang) parsed.lang = 'en'
  if (!parsed.channel) parsed.channel = 'mobile'
  if (typeof parsed.deliveryPort !== 'number') parsed.deliveryPort = 1

  return JSON.stringify(parsed, null, 2)
}

import type { SupabaseClient } from '@supabase/supabase-js'
import { getActiveCofeplusEnvironment } from '@/lib/cofeplus/settings'
import {
  cancelledAfterMissedScansMessage,
  findBusyMachineOrders,
  getQueueSnapshot,
  missedScanQueueMessage,
  normalizeScanCode,
  parseDeliveryPort,
  settleMissedScan,
  startImmediateBrewForOrder,
  syncBusyOrderAndAdvanceQueue,
  tryActivateNextQueuedOrder,
  windowBusyMessage,
  wrongWindowScanMessage,
  type MachineOrderRow,
} from '@/lib/cofeplus/queue'
import type { PairedKiosk } from '@/lib/kiosk/device'

const ORDER_SCAN_SELECT =
  'id, status, pickup_code, cofeplus_dispatch_id, cofeplus_pod_id, cofeplus_environment, machine_activated_at, scan_expires_at, missed_scans, created_at, order_number, user_id, kiosk_id, delivery_port, redemption_id'

export interface KioskDrinkView {
  orderId: string
  orderNumber: string
  status: string
  drinkName: string
  /** Product photo for the kiosk screen */
  drinkImage: string | null
  /** 'hot' | 'cold' | 'both' */
  temperature: string | null
  deliveryPort: number | null
  pickupCode: string | null
  alreadyStarted?: boolean
}

interface KioskDrinkInfo {
  name: string
  imageUrl: string | null
  temperature: string | null
}

async function loadDrinkInfo(
  adminClient: SupabaseClient,
  orderId: string
): Promise<KioskDrinkInfo> {
  const { data } = await adminClient
    .from('order_items')
    .select('products(name, image_url, temperature)')
    .eq('order_id', orderId)
    .limit(1)
    .maybeSingle()

  type ProductRow = {
    name?: string
    image_url?: string | null
    temperature?: string | null
  }
  const raw = data?.products as ProductRow | ProductRow[] | null
  const product = Array.isArray(raw) ? raw[0] : raw
  return {
    name: product?.name?.trim() || 'Drink',
    imageUrl: product?.image_url || null,
    temperature: product?.temperature || null,
  }
}

function toDrinkView(
  order: MachineOrderRow,
  drink: KioskDrinkInfo,
  extra?: { alreadyStarted?: boolean }
): KioskDrinkView {
  return {
    orderId: order.id,
    orderNumber: order.order_number || '',
    status: order.status,
    drinkName: drink.name,
    drinkImage: drink.imageUrl,
    temperature: drink.temperature,
    deliveryPort:
      order.delivery_port === 1 || order.delivery_port === 2
        ? order.delivery_port
        : null,
    pickupCode: order.pickup_code,
    alreadyStarted: extra?.alreadyStarted,
  }
}

const ACTIVE_SCAN_STATUSES = ['pending', 'brewing', 'ready', 'queued'] as const
const TRUNCATED_KAFEI_CODE = /^KF[A-F0-9]{4,9}$/

type ScanLookup =
  | { kind: 'found'; order: MachineOrderRow; via: 'exact' | 'prefix' | 'order-number' }
  | { kind: 'ambiguous' }
  | { kind: 'miss' }

function escapeIlike(value: string) {
  return value.replace(/[%_\\]/g, '\\$&')
}

async function findByPickupPrefix(
  adminClient: SupabaseClient,
  code: string,
  statuses?: readonly string[]
): Promise<ScanLookup> {
  if (!TRUNCATED_KAFEI_CODE.test(code)) return { kind: 'miss' }

  let query = adminClient
    .from('orders')
    .select(ORDER_SCAN_SELECT)
    .ilike('pickup_code', `${escapeIlike(code)}%`)
    .order('created_at', { ascending: false })
    .limit(2)

  if (statuses) {
    query = query.in('status', [...statuses])
  }

  const { data, error } = await query
  if (error) {
    console.error('[kiosk] prefix lookup failed', error)
    return { kind: 'miss' }
  }

  const rows = (data || []) as MachineOrderRow[]
  if (rows.length > 1) return { kind: 'ambiguous' }
  if (rows.length === 1) return { kind: 'found', order: rows[0], via: 'prefix' }
  return { kind: 'miss' }
}

async function lookupScanOrder(
  adminClient: SupabaseClient,
  code: string
): Promise<ScanLookup> {
  const byPickup = await adminClient
    .from('orders')
    .select(ORDER_SCAN_SELECT)
    .ilike('pickup_code', code)
    .in('status', [...ACTIVE_SCAN_STATUSES])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (byPickup.data) {
    return { kind: 'found', order: byPickup.data as MachineOrderRow, via: 'exact' }
  }

  const activePrefix = await findByPickupPrefix(
    adminClient,
    code,
    ACTIVE_SCAN_STATUSES
  )
  if (activePrefix.kind !== 'miss') return activePrefix

  const byNumber = await adminClient
    .from('orders')
    .select(ORDER_SCAN_SELECT)
    .ilike('order_number', code)
    .in('status', [...ACTIVE_SCAN_STATUSES])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (byNumber.data) {
    return {
      kind: 'found',
      order: byNumber.data as MachineOrderRow,
      via: 'order-number',
    }
  }

  const closed = await adminClient
    .from('orders')
    .select(ORDER_SCAN_SELECT)
    .ilike('pickup_code', code)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (closed.data) {
    return { kind: 'found', order: closed.data as MachineOrderRow, via: 'exact' }
  }

  return findByPickupPrefix(adminClient, code)
}

export function orderMatchesKiosk(order: MachineOrderRow, kiosk: PairedKiosk) {
  if (order.kiosk_id && order.kiosk_id === kiosk.id) return true
  const orderPod = order.cofeplus_pod_id?.trim()
  const kioskPod = kiosk.pod_id?.trim()
  return Boolean(orderPod && kioskPod && orderPod === kioskPod)
}

function queueEnvironment(order: MachineOrderRow) {
  return order.cofeplus_environment === 'test' ? 'test' : 'live'
}

export async function scanPickupAtKiosk(
  adminClient: SupabaseClient,
  kiosk: PairedKiosk,
  rawCode: string,
  scanPort: unknown
): Promise<
  | { ok: true; drink: KioskDrinkView }
  | { ok: false; error: string; status: number; queuePosition?: number | null }
> {
  const code = normalizeScanCode(rawCode)
  const lockedScanPort = parseDeliveryPort(scanPort)
  console.log(
    `[kiosk] scan raw=${JSON.stringify(rawCode)} normalized=${code || '(empty)'} port=${lockedScanPort ?? 'none'}`
  )
  if (!code) {
    return { ok: false, error: 'Empty scan', status: 400 }
  }
  if (!lockedScanPort) {
    return {
      ok: false,
      error:
        'This tablet has no window selected. Open pairing and choose window 1 or 2.',
      status: 400,
    }
  }

  const lookup = await lookupScanOrder(adminClient, code)
  if (lookup.kind === 'ambiguous') {
    console.warn(`[kiosk] scan ambiguous normalized=${code}`)
    return {
      ok: false,
      error:
        'Scan was cut off and matches more than one order. Hold the QR steady and scan again.',
      status: 409,
    }
  }
  if (lookup.kind === 'miss') {
    console.warn(`[kiosk] scan miss normalized=${code}`)
    return { ok: false, error: 'No matching order for this code', status: 404 }
  }

  const order = lookup.order
  if (lookup.via === 'prefix') {
    console.log(
      `[kiosk] recovered truncated scan code=${code} pickup=${order.pickup_code} order=${order.id}`
    )
  }

  if (!orderMatchesKiosk(order, kiosk)) {
    return {
      ok: false,
      error: 'This QR belongs to another machine',
      status: 409,
    }
  }

  let current = order
  if (current.status === 'pending') {
    current = await settleMissedScan(adminClient, current)
  }

  if (current.status === 'cancelled') {
    const missed = current.missed_scans || 0
    return {
      ok: false,
      error:
        missed >= 3
          ? cancelledAfterMissedScansMessage()
          : 'This order was cancelled.',
      status: 409,
    }
  }

  if (current.status === 'completed') {
    return { ok: false, error: 'This order is already finished.', status: 409 }
  }

  if (current.status === 'queued') {
    const podId = current.cofeplus_pod_id?.trim()
    if (podId) {
      await tryActivateNextQueuedOrder(
        adminClient,
        podId,
        queueEnvironment(current)
      )
    }
    const { data: refreshed } = await adminClient
      .from('orders')
      .select(ORDER_SCAN_SELECT)
      .eq('id', current.id)
      .maybeSingle()
    if (refreshed) current = refreshed as MachineOrderRow
  }

  if (current.status === 'queued') {
    const queue = await getQueueSnapshot(adminClient, current)
    console.log(
      `[kiosk] late scan order=${current.id} position=${queue.position ?? 'none'} misses=${current.missed_scans || 0}`
    )
    return {
      ok: false,
      error: missedScanQueueMessage(queue.position),
      status: 409,
      queuePosition: queue.position,
    }
  }

  const assignedPort = parseDeliveryPort(current.delivery_port)
  if (assignedPort && assignedPort !== lockedScanPort) {
    return {
      ok: false,
      error: wrongWindowScanMessage(assignedPort),
      status: 409,
    }
  }

  const podId = kiosk.pod_id?.trim() || current.cofeplus_pod_id?.trim()
  const environment = await getActiveCofeplusEnvironment(adminClient)
  if (podId) {
    const busy = await findBusyMachineOrders(adminClient, podId, environment)
    const occupant = busy.find(
      (row) =>
        row.id !== current.id && parseDeliveryPort(row.delivery_port) === lockedScanPort
    )
    if (occupant && occupant.status !== 'pending') {
      return {
        ok: false,
        error: windowBusyMessage(lockedScanPort),
        status: 409,
      }
    }
    if (occupant && occupant.status === 'pending' && occupant.pickup_code) {
      return {
        ok: false,
        error: `Window ${lockedScanPort} is waiting for another customer. Please scan at your assigned window.`,
        status: 409,
      }
    }
  }

  const result = await startImmediateBrewForOrder(adminClient, current, {
    podId,
    fromScan: true,
    deliveryPort: lockedScanPort,
  })

  if (result.error) {
    return { ok: false, error: result.error, status: 409 }
  }

  const drinkInfo = await loadDrinkInfo(adminClient, result.order.id)
  return {
    ok: true,
    drink: toDrinkView(result.order, drinkInfo, {
      alreadyStarted: result.alreadyStarted,
    }),
  }
}

export async function getKioskBoard(
  adminClient: SupabaseClient,
  kiosk: PairedKiosk,
  deliveryPort?: unknown
) {
  const podId = kiosk.pod_id?.trim()
  const environment = await getActiveCofeplusEnvironment(adminClient)

  if (!podId) {
    return {
      kiosk: {
        id: kiosk.id,
        name: kiosk.name,
        location: kiosk.location,
        podId: '',
      },
      environment,
      waitingCount: 0,
      serving: [] as KioskDrinkView[],
    }
  }

  const busy = await findBusyMachineOrders(adminClient, podId, environment)
  const synced = await Promise.all(
    busy.map((row) =>
      syncBusyOrderAndAdvanceQueue(adminClient, row).catch((error) => {
        console.error('[kiosk] board sync failed', row.id, error)
        return row
      })
    )
  )

  const boardPort = parseDeliveryPort(deliveryPort)
  const serving = (
    await Promise.all(
      synced
        .filter((row) => row.status === 'brewing' || row.status === 'ready')
        .filter((row) => {
          if (!boardPort) return true
          const rowPort = parseDeliveryPort(row.delivery_port)
          return rowPort == null || rowPort === boardPort
        })
        .map(async (row) =>
          toDrinkView(row, await loadDrinkInfo(adminClient, row.id))
        )
    )
  ).sort((a, b) => (a.deliveryPort || 9) - (b.deliveryPort || 9))

  const { count } = await adminClient
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('cofeplus_pod_id', podId)
    .eq('cofeplus_environment', environment)
    .eq('status', 'queued')

  return {
    kiosk: {
      id: kiosk.id,
      name: kiosk.name,
      location: kiosk.location,
      podId,
    },
    environment,
    waitingCount: count || 0,
    serving,
  }
}

export async function getKioskOrderView(
  adminClient: SupabaseClient,
  kiosk: PairedKiosk,
  orderId: string
): Promise<
  | { ok: true; drink: KioskDrinkView }
  | { ok: false; error: string; status: number }
> {
  const { data } = await adminClient
    .from('orders')
    .select(ORDER_SCAN_SELECT)
    .eq('id', orderId)
    .maybeSingle()

  if (!data) {
    return { ok: false, error: 'Order not found', status: 404 }
  }

  const order = data as MachineOrderRow
  if (!orderMatchesKiosk(order, kiosk)) {
    return { ok: false, error: 'Order is not for this machine', status: 403 }
  }

  const synced = ['pending', 'brewing', 'ready'].includes(order.status)
    ? await syncBusyOrderAndAdvanceQueue(adminClient, order)
    : order

  return {
    ok: true,
    drink: toDrinkView(synced, await loadDrinkInfo(adminClient, synced.id)),
  }
}

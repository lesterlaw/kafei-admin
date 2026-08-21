import type { SupabaseClient } from '@supabase/supabase-js'
import {
  createPickupDispatch,
  fetchDispatchSnapshot,
  fetchPodAvailability,
  isSimulatedDispatchId,
  mapDispatchSnapshotToOrderStatus,
} from '@/lib/cofeplus/dispatch'
import type { CofeplusEnvironment } from '@/lib/cofeplus/config'
import {
  drinkModifierPreferences,
  matchMenuItem,
} from '@/lib/cofeplus/product-map'
import { resolveCofeplusEnvironment } from '@/lib/cofeplus/proxy'
import {
  dispenseSecondsForEnvironment,
  formatWaitLabel,
  TEST_DISPENSE_SECONDS,
} from '@/lib/cofeplus/timing'

/** Orders that currently occupy the physical machine / dispenser */
const MACHINE_BUSY_STATUSES = ['pending', 'brewing', 'ready'] as const

/** Orders still waiting for their turn (no pickup QR yet) */
const QUEUE_WAITING_STATUSES = ['queued'] as const

const ORDER_SELECT =
  'id, status, pickup_code, cofeplus_dispatch_id, cofeplus_pod_id, cofeplus_environment, machine_activated_at, created_at, order_number, user_id, kiosk_id, delivery_port'

/** Physical dispense holes on a Kafei machine */
export const DISPENSE_PORTS = [1, 2] as const
export const MAX_CONCURRENT_DISPENSES = DISPENSE_PORTS.length

/** Ignore in-flight CofePlus calls for this long before retrying a stuck pending order */
const ACTIVATION_RETRY_SECONDS = 20

export type MachineOrderRow = {
  id: string
  status: string
  pickup_code: string | null
  cofeplus_dispatch_id: string | null
  cofeplus_pod_id: string | null
  cofeplus_environment: string | null
  machine_activated_at?: string | null
  created_at: string
  order_number?: string
  user_id?: string
  kiosk_id?: string
  delivery_port?: number | null
}

export interface QueueSnapshot {
  position: number | null
  aheadCount: number
  isYourTurn: boolean
  totalWaiting: number
  /** Seconds until this order is expected to start / finish its turn */
  estimatedWaitSeconds: number
  /** Human-readable wait label */
  estimatedWaitLabel: string
  /** Seconds used per drink for this environment */
  secondsPerDrink: number
}

function asEnvironment(value: string | null | undefined): CofeplusEnvironment {
  return resolveCofeplusEnvironment(value)
}

function emptyQueue(
  partial?: Partial<QueueSnapshot> & { environment?: CofeplusEnvironment }
): QueueSnapshot {
  const environment = partial?.environment || 'test'
  const secondsPerDrink = dispenseSecondsForEnvironment(environment)
  const estimatedWaitSeconds = partial?.estimatedWaitSeconds ?? 0
  return {
    position: partial?.position ?? null,
    aheadCount: partial?.aheadCount ?? 0,
    isYourTurn: partial?.isYourTurn ?? false,
    totalWaiting: partial?.totalWaiting ?? 0,
    estimatedWaitSeconds,
    estimatedWaitLabel: formatWaitLabel(estimatedWaitSeconds),
    secondsPerDrink,
  }
}

function elapsedSecondsSince(iso: string | null | undefined): number {
  if (!iso) return 0
  const ms = Date.now() - new Date(iso).getTime()
  return Math.max(0, Math.floor(ms / 1000))
}

const STATUS_PROGRESSION: Record<string, number> = {
  queued: 0,
  pending: 1,
  brewing: 2,
  ready: 3,
  completed: 4,
  cancelled: 4,
}

function shouldWriteOrderStatus(current: string, next: string) {
  if (next === current) return false
  if (next === 'cancelled') return true
  if (current === 'completed' || current === 'cancelled') return false
  const from = STATUS_PROGRESSION[current]
  const to = STATUS_PROGRESSION[next]
  if (from == null || to == null) return true
  return to > from
}

/**
 * Whether this pod currently has an order that still owns the dispenser
 * (QR shown / brewing / drink waiting to be collected).
 */
export async function findBusyMachineOrders(
  adminClient: SupabaseClient,
  podId: string,
  environment: CofeplusEnvironment
): Promise<MachineOrderRow[]> {
  const { data, error } = await adminClient
    .from('orders')
    .select(ORDER_SELECT)
    .eq('cofeplus_pod_id', podId)
    .eq('cofeplus_environment', environment)
    .in('status', [...MACHINE_BUSY_STATUSES])
    .not('cofeplus_dispatch_id', 'is', null)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[queue] findBusyMachineOrders failed', error)
    return []
  }

  return (data || []) as MachineOrderRow[]
}

export async function findBusyMachineOrder(
  adminClient: SupabaseClient,
  podId: string,
  environment: CofeplusEnvironment
): Promise<MachineOrderRow | null> {
  const busy = await findBusyMachineOrders(adminClient, podId, environment)
  return busy[0] || null
}

export function findFreeDeliveryPort(busyOrders: MachineOrderRow[]): number | null {
  const used = new Set(
    busyOrders
      .map((order) => Number(order.delivery_port))
      .filter((port) => port === 1 || port === 2)
  )
  // Occupied holes without a stored port still consume a slot
  let unassigned = busyOrders.filter(
    (order) => order.delivery_port !== 1 && order.delivery_port !== 2
  ).length
  for (const port of DISPENSE_PORTS) {
    if (used.has(port)) continue
    if (unassigned > 0) {
      unassigned -= 1
      continue
    }
    return port
  }
  return null
}

export async function getQueueSnapshot(
  adminClient: SupabaseClient,
  order: MachineOrderRow
): Promise<QueueSnapshot> {
  const podId = order.cofeplus_pod_id?.trim()
  const environment = asEnvironment(order.cofeplus_environment)
  const secondsPerDrink = dispenseSecondsForEnvironment(environment)

  if (!podId) {
    return emptyQueue({
      environment,
      isYourTurn: Boolean(order.pickup_code),
      estimatedWaitSeconds: 0,
    })
  }

  if (order.status !== 'queued') {
    const isYourTurn =
      Boolean(order.pickup_code) &&
      MACHINE_BUSY_STATUSES.includes(
        order.status as (typeof MACHINE_BUSY_STATUSES)[number]
      )

    let estimatedWaitSeconds = 0
    if (isYourTurn && environment === 'test') {
      const elapsed = elapsedSecondsSince(order.machine_activated_at)
      estimatedWaitSeconds = Math.max(0, TEST_DISPENSE_SECONDS - elapsed)
    }

    return emptyQueue({
      environment,
      position: order.pickup_code ? 0 : null,
      aheadCount: 0,
      isYourTurn,
      estimatedWaitSeconds,
      secondsPerDrink,
    })
  }

  const { data: waiting, error } = await adminClient
    .from('orders')
    .select('id, created_at')
    .eq('cofeplus_pod_id', podId)
    .eq('cofeplus_environment', environment)
    .in('status', [...QUEUE_WAITING_STATUSES])
    .order('created_at', { ascending: true })

  if (error || !waiting) {
    console.error('[queue] getQueueSnapshot failed', error)
    return emptyQueue({ environment, isYourTurn: false })
  }

  const index = waiting.findIndex((row) => row.id === order.id)
  const busyOrders = await findBusyMachineOrders(adminClient, podId, environment)
  const aheadInQueue = index < 0 ? 0 : index
  const aheadCount = aheadInQueue + busyOrders.length
  const position = index < 0 ? null : aheadCount + 1

  let estimatedWaitSeconds = aheadCount * secondsPerDrink
  if (busyOrders.length > 0 && environment === 'test') {
    const oldest = busyOrders[0]
    const elapsed = elapsedSecondsSince(oldest.machine_activated_at)
    const busyRemaining = Math.max(0, TEST_DISPENSE_SECONDS - elapsed)
    const extraBusy = Math.max(0, busyOrders.length - 1) * secondsPerDrink
    estimatedWaitSeconds = aheadInQueue * secondsPerDrink + busyRemaining + extraBusy
  }

  return emptyQueue({
    environment,
    position,
    aheadCount,
    isYourTurn: false,
    totalWaiting: waiting.length,
    estimatedWaitSeconds,
    secondsPerDrink,
  })
}

export function syntheticPodIdForKiosk(kioskId: string) {
  return `kiosk-${kioskId}`
}

async function loadOrderItemForDispatch(
  adminClient: SupabaseClient,
  orderId: string,
  environment: CofeplusEnvironment,
  podId?: string
): Promise<{
  itemCode: string
  displayNote: string
  modifierPreferences: Record<string, string>
} | null> {
  const { data, error } = await adminClient
    .from('order_items')
    .select('product_id, products(name, temperature, cofeplus_item_code)')
    .eq('order_id', orderId)
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[queue] loadOrderItemForDispatch failed', error)
  }

  const products = data?.products as
    | { name?: string; temperature?: string | null; cofeplus_item_code?: string | null }
    | { name?: string; temperature?: string | null; cofeplus_item_code?: string | null }[]
    | null

  const product = Array.isArray(products) ? products[0] : products
  let itemCode = product?.cofeplus_item_code?.trim() || ''
  const displayNote = product?.name?.trim() || itemCode || 'Your drink'
  const modifierPreferences = drinkModifierPreferences(
    displayNote,
    product?.temperature
  )

  if (!itemCode && product?.name) {
    let menuQuery = adminClient
      .from('cofeplus_menu_items')
      .select('item_code, display')
      .eq('environment', environment)
    if (podId) {
      menuQuery = menuQuery.eq('pod_id', podId)
    }
    const { data: menuItems } = await menuQuery
    const match = matchMenuItem(
      product.name,
      (menuItems || []).map((row) => ({
        itemCode: row.item_code,
        display: row.display,
      }))
    )
    if (match) {
      itemCode = match.itemCode
    }
  }

  if (itemCode) {
    return { itemCode, displayNote, modifierPreferences }
  }

  // Test mode still needs a QR so checkout can be exercised without admin mapping
  if (environment === 'test') {
    return { itemCode: 'TEST-ITEM', displayNote, modifierPreferences }
  }

  return null
}

export async function persistPickupForOrder(
  adminClient: SupabaseClient,
  order: MachineOrderRow,
  podId: string,
  environment: CofeplusEnvironment,
  deliveryPort?: number | null,
  mode: 'pickup' | 'immediate' = 'pickup'
): Promise<{ order: MachineOrderRow; error?: string }> {
  const item = await loadOrderItemForDispatch(
    adminClient,
    order.id,
    environment,
    podId
  )
  if (!item) {
    return {
      order,
      error:
        'This drink is missing a CofePlus item code. Set it on the product in admin.',
    }
  }

  console.log(
    `[queue] activating order ${order.id} pod=${podId} env=${environment} item=${item.itemCode}`
  )

  const port = deliveryPort === 2 ? 2 : deliveryPort === 1 ? 1 : 1

  const dispatchResult = await createPickupDispatch({
    podId,
    itemCode: item.itemCode,
    environment,
    displayNote: item.displayNote,
    deliveryPort: port,
    modifierPreferences: item.modifierPreferences,
    mode,
    adminClient,
  })

  if (!dispatchResult.ok) {
    console.error('[queue] dispatch failed', dispatchResult)
    return { order, error: dispatchResult.error }
  }

  const activationFields: Record<string, unknown> = {
    status: mode === 'immediate' ? 'brewing' : 'pending',
    pickup_code: dispatchResult.dispatch.pickupCode,
    cofeplus_dispatch_id: dispatchResult.dispatch.id,
    cofeplus_pod_id: podId,
    cofeplus_environment: environment,
    machine_activated_at: new Date().toISOString(),
    delivery_port: port,
  }

  let activatedResult = await adminClient
    .from('orders')
    .update(activationFields)
    .eq('id', order.id)
    .is('pickup_code', null)
    .select(ORDER_SELECT)
    .maybeSingle()

  if (
    activatedResult.error &&
    /delivery_port/i.test(activatedResult.error.message)
  ) {
    delete activationFields.delivery_port
    activatedResult = await adminClient
      .from('orders')
      .update(activationFields)
      .eq('id', order.id)
      .is('pickup_code', null)
      .select(
        'id, status, pickup_code, cofeplus_dispatch_id, cofeplus_pod_id, cofeplus_environment, machine_activated_at, created_at, order_number, user_id, kiosk_id'
      )
      .maybeSingle()
  }

  const { data: activated, error: activateError } = activatedResult

  if (activateError) {
    console.error('[queue] failed to persist activated dispatch', activateError)
    return { order, error: activateError.message }
  }

  if (!activated) {
    const { data: current } = await adminClient
      .from('orders')
      .select(ORDER_SELECT)
      .eq('id', order.id)
      .single()
    return { order: (current as MachineOrderRow) || order }
  }

  console.log(
    `[queue] activated order ${activated.id} pickup=${activated.pickup_code} env=${environment}`
  )
  return { order: activated as MachineOrderRow }
}

/**
 * Mint a pickup QR for a machine order that is pending/ready but never got a
 * pickup_code (failed dispatch, missing pod at create time, or mid-claim).
 */
async function recoverStuckPendingOrder(
  adminClient: SupabaseClient,
  order: MachineOrderRow,
  podId: string,
  environment: CofeplusEnvironment
): Promise<{ order: MachineOrderRow; error?: string }> {
  if (order.pickup_code || order.cofeplus_dispatch_id) {
    return { order }
  }

  const busy = await findBusyMachineOrders(adminClient, podId, environment)
  const others = busy.filter((row) => row.id !== order.id)
  const freePort = findFreeDeliveryPort(others)
  if (!freePort) {
    if (order.status !== 'queued') {
      const { data: queued } = await adminClient
        .from('orders')
        .update({ status: 'queued' })
        .eq('id', order.id)
        .is('pickup_code', null)
        .select(ORDER_SELECT)
        .maybeSingle()
      if (queued) {
        return { order: queued as MachineOrderRow }
      }
    }
    return { order }
  }

  const claimedAgo = elapsedSecondsSince(order.machine_activated_at)
  const inFlight =
    order.status === 'pending' &&
    Boolean(order.machine_activated_at) &&
    claimedAgo < ACTIVATION_RETRY_SECONDS
  if (inFlight) {
    return { order }
  }

  return persistPickupForOrder(adminClient, order, podId, environment, freePort)
}

/**
 * If the pod is free, activate the oldest queued order by creating its
 * pickup dispatch (real CofePlus in live; simulated QR in test).
 */
export async function tryActivateNextQueuedOrder(
  adminClient: SupabaseClient,
  podId: string,
  environment: CofeplusEnvironment
): Promise<{ order: MachineOrderRow | null; error?: string }> {
  const busy = await findBusyMachineOrders(adminClient, podId, environment)
  const freePort = findFreeDeliveryPort(busy)
  if (!freePort) {
    return { order: null }
  }

  const podHealth = await fetchPodAvailability(podId, environment)
  if (!podHealth.available) {
    console.log(
      `[queue] skip activate pod=${podId}: machine not free (${podHealth.status})`
    )
    return { order: null, error: `Machine not available (${podHealth.status})` }
  }

  const { data: nextQueued, error } = await adminClient
    .from('orders')
    .select(ORDER_SELECT)
    .eq('cofeplus_pod_id', podId)
    .eq('cofeplus_environment', environment)
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error || !nextQueued) {
    if (error) console.error('[queue] tryActivateNextQueuedOrder select failed', error)
    return { order: null }
  }

  const item = await loadOrderItemForDispatch(
    adminClient,
    nextQueued.id,
    environment
  )
  if (!item) {
    console.error(
      `[queue] cannot activate order ${nextQueued.id}: missing product item code`
    )
    return {
      order: null,
      error:
        'This drink is missing a CofePlus item code. Set it on the product in admin.',
    }
  }

  // Claim the slot before calling CofePlus to reduce double-activate races
  const { data: claimed, error: claimError } = await adminClient
    .from('orders')
    .update({
      status: 'pending',
      machine_activated_at: new Date().toISOString(),
    })
    .eq('id', nextQueued.id)
    .eq('status', 'queued')
    .select(ORDER_SELECT)
    .maybeSingle()

  if (claimError || !claimed) {
    console.error('[queue] claim race lost or failed', claimError)
    return { order: null }
  }

  const persisted = await persistPickupForOrder(
    adminClient,
    claimed as MachineOrderRow,
    podId,
    environment,
    freePort
  )

  if (persisted.error && !persisted.order.pickup_code) {
    await adminClient
      .from('orders')
      .update({ status: 'queued', machine_activated_at: null })
      .eq('id', claimed.id)
      .eq('status', 'pending')
      .is('pickup_code', null)
    return { order: null, error: persisted.error }
  }

  return { order: persisted.order }
}

/**
 * Test mode: after TEST_DISPENSE_SECONDS, mark the active order completed
 * (no real scan). Live mode never uses this path.
 */
async function maybeCompleteTestDispense(
  adminClient: SupabaseClient,
  order: MachineOrderRow
): Promise<MachineOrderRow> {
  const environment = asEnvironment(order.cofeplus_environment)
  if (environment !== 'test') {
    return order
  }

  if (
    !MACHINE_BUSY_STATUSES.includes(
      order.status as (typeof MACHINE_BUSY_STATUSES)[number]
    )
  ) {
    return order
  }

  const activatedAt = order.machine_activated_at || order.created_at
  const elapsed = elapsedSecondsSince(activatedAt)
  if (elapsed < TEST_DISPENSE_SECONDS) {
    // Mid-simulation progress: pending → brewing after a quarter of the wait
    const brewAfterSeconds = Math.max(15, Math.floor(TEST_DISPENSE_SECONDS / 4))
    if (elapsed >= brewAfterSeconds && order.status === 'pending') {
      const { data: brewing } = await adminClient
        .from('orders')
        .update({ status: 'brewing' })
        .eq('id', order.id)
        .eq('status', 'pending')
        .select(ORDER_SELECT)
        .maybeSingle()
      if (brewing) return brewing as MachineOrderRow
    }
    return order
  }

  console.log(
    `[queue] test simulate complete order=${order.id} after ${elapsed}s`
  )

  const { data: completed, error } = await adminClient
    .from('orders')
    .update({ status: 'completed' })
    .eq('id', order.id)
    .in('status', [...MACHINE_BUSY_STATUSES])
    .select(ORDER_SELECT)
    .maybeSingle()

  if (error || !completed) {
    console.error('[queue] test simulate complete failed', error)
    return order
  }

  return completed as MachineOrderRow
}

/**
 * Sync the busy order's state. Live: CofePlus scan/status.
 * Test: 1-minute simulated dispense then success. Then promote next queued order.
 */
export async function syncBusyOrderAndAdvanceQueue(
  adminClient: SupabaseClient,
  order: MachineOrderRow
): Promise<MachineOrderRow> {
  const podId = order.cofeplus_pod_id?.trim()
  if (!podId) {
    return order
  }

  const environment = asEnvironment(order.cofeplus_environment)
  let current = order

  if (
    current.cofeplus_dispatch_id &&
    MACHINE_BUSY_STATUSES.includes(
      current.status as (typeof MACHINE_BUSY_STATUSES)[number]
    )
  ) {
    if (isSimulatedDispatchId(current.cofeplus_dispatch_id)) {
      current = await maybeCompleteTestDispense(adminClient, current)
    } else {
      const snapshot = await fetchDispatchSnapshot(
        podId,
        current.cofeplus_dispatch_id,
        environment,
        {
          // pending + 404 can be a create delay. brewing/ready + gone
          // means the cup was collected and left the live table.
          completeIfMissing: current.status !== 'pending',
        }
      )

      if (snapshot.ok) {
        const nextStatus = mapDispatchSnapshotToOrderStatus(snapshot.snapshot)
        if (shouldWriteOrderStatus(current.status, nextStatus)) {
          console.log(
            `[queue] dispatch ${current.cofeplus_dispatch_id} state=${snapshot.snapshot.state} archived=${snapshot.snapshot.archived} → ${current.status} to ${nextStatus}`
          )
          const { data: updated, error } = await adminClient
            .from('orders')
            .update({ status: nextStatus })
            .eq('id', current.id)
            .select(ORDER_SELECT)
            .single()

          if (!error && updated) {
            current = updated as MachineOrderRow
          }
        }
      } else {
        console.warn(
          `[queue] dispatch snapshot failed order=${current.id}`,
          snapshot.error
        )
      }
    }
  }

  const stillBusy = MACHINE_BUSY_STATUSES.includes(
    current.status as (typeof MACHINE_BUSY_STATUSES)[number]
  )

  await tryActivateNextQueuedOrder(adminClient, podId, environment)

  return current
}

/**
 * Refresh a specific order: sync if it holds the machine, or try to activate
 * it / compute queue position if it is still waiting.
 */
export async function refreshOrderQueueState(
  adminClient: SupabaseClient,
  order: MachineOrderRow
): Promise<{
  order: MachineOrderRow
  queue: QueueSnapshot
  activationError?: string
}> {
  const podId = order.cofeplus_pod_id?.trim()
  const environment = asEnvironment(order.cofeplus_environment)

  if (!podId) {
    return {
      order,
      queue: emptyQueue({
        environment,
        isYourTurn: Boolean(order.pickup_code),
      }),
      activationError: order.pickup_code
        ? undefined
        : 'This kiosk is not linked to a CofePlus machine',
    }
  }

  let current = order
  let activationError: string | undefined

  const needsPickup =
    !current.pickup_code &&
    !current.cofeplus_dispatch_id &&
    MACHINE_BUSY_STATUSES.includes(
      current.status as (typeof MACHINE_BUSY_STATUSES)[number]
    )

  if (current.status === 'queued') {
    // Keep advancing the pod queue (sync whoever is busy, then maybe activate us)
    const busyOrders = await findBusyMachineOrders(adminClient, podId, environment)
    for (const busy of busyOrders) {
      await syncBusyOrderAndAdvanceQueue(adminClient, busy)
    }
    const activated = await tryActivateNextQueuedOrder(adminClient, podId, environment)
    if (activated.error && current.status === 'queued') {
      activationError = activated.error
    }

    const { data: refreshed } = await adminClient
      .from('orders')
      .select(ORDER_SELECT)
      .eq('id', order.id)
      .single()

    if (refreshed) {
      current = refreshed as MachineOrderRow
    }
    if (current.pickup_code) {
      activationError = undefined
    }
  } else if (needsPickup) {
    const recovered = await recoverStuckPendingOrder(
      adminClient,
      current,
      podId,
      environment
    )
    current = recovered.order
    activationError = recovered.error
  } else if (
    current.cofeplus_dispatch_id &&
    MACHINE_BUSY_STATUSES.includes(
      current.status as (typeof MACHINE_BUSY_STATUSES)[number]
    )
  ) {
    current = await syncBusyOrderAndAdvanceQueue(adminClient, current)
  }

  const queue = await getQueueSnapshot(adminClient, current)
  if (current.pickup_code && current.status !== 'queued') {
    queue.isYourTurn = ['pending', 'brewing', 'ready'].includes(current.status)
    if (queue.isYourTurn) {
      queue.position = 0
      queue.aheadCount = 0
    }
  }

  return { order: current, queue, activationError }
}

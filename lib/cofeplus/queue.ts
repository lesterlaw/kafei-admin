import type { SupabaseClient } from '@supabase/supabase-js'
import {
  createPickupDispatch,
  fetchDispatchSnapshot,
  mapDispatchStateToOrderStatus,
} from '@/lib/cofeplus/dispatch'
import type { CofeplusEnvironment } from '@/lib/cofeplus/config'
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
  'id, status, pickup_code, cofeplus_dispatch_id, cofeplus_pod_id, cofeplus_environment, machine_activated_at, created_at, order_number, user_id'

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

/**
 * Whether this pod currently has an order that still owns the dispenser
 * (QR shown / brewing / drink waiting to be collected).
 */
export async function findBusyMachineOrder(
  adminClient: SupabaseClient,
  podId: string,
  environment: CofeplusEnvironment
): Promise<MachineOrderRow | null> {
  const { data, error } = await adminClient
    .from('orders')
    .select(ORDER_SELECT)
    .eq('cofeplus_pod_id', podId)
    .eq('cofeplus_environment', environment)
    .in('status', [...MACHINE_BUSY_STATUSES])
    .not('cofeplus_dispatch_id', 'is', null)
    .order('created_at', { ascending: true })
    .limit(1)

  if (error) {
    console.error('[queue] findBusyMachineOrder failed', error)
    return null
  }

  return (data?.[0] as MachineOrderRow | undefined) || null
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
  const busy = await findBusyMachineOrder(adminClient, podId, environment)
  const aheadInQueue = index < 0 ? 0 : index
  const aheadCount = aheadInQueue + (busy ? 1 : 0)
  const position = index < 0 ? null : aheadCount + 1

  let estimatedWaitSeconds = aheadCount * secondsPerDrink
  if (busy && environment === 'test') {
    const elapsed = elapsedSecondsSince(busy.machine_activated_at)
    const busyRemaining = Math.max(0, TEST_DISPENSE_SECONDS - elapsed)
    estimatedWaitSeconds = aheadInQueue * secondsPerDrink + busyRemaining
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

async function loadOrderItemForDispatch(
  adminClient: SupabaseClient,
  orderId: string
): Promise<{ itemCode: string; displayNote: string } | null> {
  const { data, error } = await adminClient
    .from('order_items')
    .select('products(name, cofeplus_item_code)')
    .eq('order_id', orderId)
    .limit(1)
    .maybeSingle()

  if (error || !data) {
    console.error('[queue] loadOrderItemForDispatch failed', error)
    return null
  }

  const products = data.products as
    | { name?: string; cofeplus_item_code?: string | null }
    | { name?: string; cofeplus_item_code?: string | null }[]
    | null

  const product = Array.isArray(products) ? products[0] : products
  const itemCode = product?.cofeplus_item_code?.trim() || ''
  if (!itemCode) {
    return null
  }

  return {
    itemCode,
    displayNote: product?.name?.trim() || itemCode,
  }
}

/**
 * If the pod is free, activate the oldest queued order by creating its
 * pickup dispatch (real CofePlus in live; simulated QR in test).
 */
export async function tryActivateNextQueuedOrder(
  adminClient: SupabaseClient,
  podId: string,
  environment: CofeplusEnvironment
): Promise<MachineOrderRow | null> {
  const busy = await findBusyMachineOrder(adminClient, podId, environment)
  if (busy) {
    return null
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
    return null
  }

  const item = await loadOrderItemForDispatch(adminClient, nextQueued.id)
  if (!item) {
    console.error(
      `[queue] cannot activate order ${nextQueued.id}: missing product item code`
    )
    return null
  }

  // Claim the slot before calling CofePlus to reduce double-activate races
  const { data: claimed, error: claimError } = await adminClient
    .from('orders')
    .update({ status: 'pending' })
    .eq('id', nextQueued.id)
    .eq('status', 'queued')
    .select(ORDER_SELECT)
    .maybeSingle()

  if (claimError || !claimed) {
    console.error('[queue] claim race lost or failed', claimError)
    return null
  }

  console.log(
    `[queue] activating order ${claimed.id} pod=${podId} env=${environment} item=${item.itemCode}`
  )

  const dispatchResult = await createPickupDispatch({
    podId,
    itemCode: item.itemCode,
    environment,
    displayNote: item.displayNote,
  })

  if (!dispatchResult.ok) {
    console.error('[queue] dispatch failed; reverting to queued', dispatchResult)
    await adminClient
      .from('orders')
      .update({ status: 'queued' })
      .eq('id', claimed.id)
      .eq('status', 'pending')
    return null
  }

  const activatedAt = new Date().toISOString()
  const { data: activated, error: activateError } = await adminClient
    .from('orders')
    .update({
      status: 'pending',
      pickup_code: dispatchResult.dispatch.pickupCode,
      cofeplus_dispatch_id: dispatchResult.dispatch.id,
      cofeplus_pod_id: podId,
      cofeplus_environment: environment,
      machine_activated_at: activatedAt,
    })
    .eq('id', claimed.id)
    .select(ORDER_SELECT)
    .single()

  if (activateError || !activated) {
    console.error('[queue] failed to persist activated dispatch', activateError)
    return null
  }

  console.log(
    `[queue] activated order ${activated.id} pickup=${activated.pickup_code} env=${environment}`
  )
  return activated as MachineOrderRow
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
    // Mid-simulation progress: pending → brewing after ~2s for nicer UX
    if (elapsed >= 2 && order.status === 'pending') {
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
 * Test: 5s simulated dispense then success. Then promote next queued order.
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
    if (environment === 'test') {
      current = await maybeCompleteTestDispense(adminClient, current)
    } else {
      const snapshot = await fetchDispatchSnapshot(
        podId,
        current.cofeplus_dispatch_id,
        environment
      )

      if (snapshot.ok) {
        const nextStatus = mapDispatchStateToOrderStatus(snapshot.snapshot.state)
        if (nextStatus !== current.status) {
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
      }
    }
  }

  const stillBusy = MACHINE_BUSY_STATUSES.includes(
    current.status as (typeof MACHINE_BUSY_STATUSES)[number]
  )

  if (!stillBusy) {
    await tryActivateNextQueuedOrder(adminClient, podId, environment)
  }

  return current
}

/**
 * Refresh a specific order: sync if it holds the machine, or try to activate
 * it / compute queue position if it is still waiting.
 */
export async function refreshOrderQueueState(
  adminClient: SupabaseClient,
  order: MachineOrderRow
): Promise<{ order: MachineOrderRow; queue: QueueSnapshot }> {
  const podId = order.cofeplus_pod_id?.trim()
  const environment = asEnvironment(order.cofeplus_environment)

  if (!podId) {
    return {
      order,
      queue: emptyQueue({
        environment,
        isYourTurn: Boolean(order.pickup_code),
      }),
    }
  }

  let current = order

  if (current.status === 'queued') {
    // Keep advancing the pod queue (sync whoever is busy, then maybe activate us)
    const busy = await findBusyMachineOrder(adminClient, podId, environment)
    if (busy) {
      await syncBusyOrderAndAdvanceQueue(adminClient, busy)
    } else {
      await tryActivateNextQueuedOrder(adminClient, podId, environment)
    }

    const { data: refreshed } = await adminClient
      .from('orders')
      .select(ORDER_SELECT)
      .eq('id', order.id)
      .single()

    if (refreshed) {
      current = refreshed as MachineOrderRow
    }
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

  return { order: current, queue }
}

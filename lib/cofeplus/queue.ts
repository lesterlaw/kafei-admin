import { randomBytes } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  createPickupDispatch,
  dispatchLockIdForOrder,
  fetchDispatchSnapshot,
  fetchPodAvailability,
  isInFlightDispatchLock,
  isLocalDispatchId,
  isSimulatedDispatchId,
  mapDispatchSnapshotToOrderStatus,
} from '@/lib/cofeplus/dispatch'
import type { CofeplusEnvironment } from '@/lib/cofeplus/config'
import {
  LATTE_ART_GROUP,
  LATTE_ART_LOCATOR_CHOICE,
  HAND_LATTE_ART_ITEM_CODES,
  isPlainHotLatte,
  parseHandArtLocator,
} from '@/lib/cofeplus/latte-art-contract'
import {
  drinkModifierPreferences,
  inferAddonModifier,
  matchMenuItem,
} from '@/lib/cofeplus/product-map'
import { resolveCofeplusEnvironment } from '@/lib/cofeplus/proxy'
import {
  dispenseSecondsForEnvironment,
  formatWaitLabel,
  TEST_DISPENSE_SECONDS,
} from '@/lib/cofeplus/timing'
import { getProductLogicSettings } from '@/lib/product-logic/settings'
import {
  commitRedemption,
  releaseRedemption,
} from '@/lib/product-logic/redemptions'
import { activateReferralOnFirstDrink } from '@/lib/product-logic/referrals'

/** Orders that currently occupy the physical machine / dispenser */
const MACHINE_BUSY_STATUSES = ['pending', 'brewing', 'ready'] as const

/** Orders still waiting for their turn (no pickup QR yet) */
const QUEUE_WAITING_STATUSES = ['queued'] as const

const ORDER_SELECT =
  'id, status, pickup_code, cofeplus_dispatch_id, cofeplus_pod_id, cofeplus_environment, machine_activated_at, scan_expires_at, missed_scans, created_at, order_number, user_id, kiosk_id, delivery_port, redemption_id'

const MAX_MISSED_SCANS = 3

/** Physical dispense holes on a Kafei machine */
export const DISPENSE_PORTS = [1, 2] as const
export const MAX_CONCURRENT_DISPENSES = DISPENSE_PORTS.length

/**
 * Ignore in-flight CofePlus calls for this long before retrying a stuck
 * pending order. Shorter than the old 20s so a killed serverless claim
 * does not leave the app on "Preparing your QR code".
 */
const ACTIVATION_RETRY_SECONDS = 8

export type MachineOrderRow = {
  id: string
  status: string
  pickup_code: string | null
  cofeplus_dispatch_id: string | null
  cofeplus_pod_id: string | null
  cofeplus_environment: string | null
  machine_activated_at?: string | null
  scan_expires_at?: string | null
  missed_scans?: number | null
  created_at: string
  order_number?: string
  user_id?: string
  kiosk_id?: string
  delivery_port?: number | null
  redemption_id?: string | null
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

function remainingSecondsUntil(iso: string | null | undefined): number {
  if (!iso) return 0
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 1000))
}

async function scanExpiryIso(
  adminClient: SupabaseClient,
  from = Date.now()
): Promise<string> {
  try {
    const settings = await getProductLogicSettings(adminClient)
    const seconds = settings.scan_window_seconds || 80
    return new Date(from + seconds * 1000).toISOString()
  } catch {
    return new Date(from + 80_000).toISOString()
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function reloadOrder(
  adminClient: SupabaseClient,
  orderId: string
): Promise<MachineOrderRow | null> {
  const { data } = await adminClient
    .from('orders')
    .select(ORDER_SELECT)
    .eq('id', orderId)
    .maybeSingle()
  return (data as MachineOrderRow) || null
}

const STATUS_PROGRESSION: Record<string, number> = {
  queued: 0,
  pending: 1,
  brewing: 2,
  ready: 3,
  completed: 4,
  cancelled: 4,
}

export function shouldWriteOrderStatus(current: string, next: string) {
  if (next === current) return false
  if (next === 'cancelled') return true
  if (current === 'completed' || current === 'cancelled') return false
  const from = STATUS_PROGRESSION[current]
  const to = STATUS_PROGRESSION[next]
  if (from == null || to == null) return true
  return to > from
}

export async function persistMappedDispatchStatus(
  adminClient: SupabaseClient,
  order: MachineOrderRow,
  snapshot: {
    state: string
    archived: boolean
    pickupCode?: string
    deliveryPort?: number | null
  }
): Promise<MachineOrderRow> {
  const nextStatus = mapDispatchSnapshotToOrderStatus(snapshot)
  const scannedPort = parseDeliveryPort(snapshot.deliveryPort)
  const lockedPort = parseDeliveryPort(order.delivery_port)
  const shouldWriteStatus = shouldWriteOrderStatus(order.status, nextStatus)
  // Never move an already-locked hole to whatever CofePlus reports.
  const shouldWritePort =
    scannedPort != null && lockedPort == null && order.delivery_port !== scannedPort

  if (!shouldWriteStatus && !shouldWritePort) {
    return order
  }

  console.log(
    `[queue] dispatch ${order.cofeplus_dispatch_id} state=${snapshot.state} archived=${snapshot.archived} → ${order.status} to ${nextStatus}${
      scannedPort ? ` port=${scannedPort}` : ''
    }`
  )

  const patch: Record<string, unknown> = {}
  if (shouldWriteStatus) patch.status = nextStatus
  if (shouldWritePort) patch.delivery_port = scannedPort

  let { data: updated, error } = await adminClient
    .from('orders')
    .update(patch)
    .eq('id', order.id)
    .select(ORDER_SELECT)
    .single()

  if (error && shouldWritePort && isUniquePortError(error) && shouldWriteStatus) {
    const retry = await adminClient
      .from('orders')
      .update({ status: nextStatus })
      .eq('id', order.id)
      .select(ORDER_SELECT)
      .single()
    updated = retry.data
    error = retry.error
  }

  if (error || !updated) {
    console.warn('[queue] persistMappedDispatchStatus failed', error)
    return order
  }

  const next = updated as MachineOrderRow
  if (next.status === 'completed') {
    await onOrderCompleted(adminClient, next)
  }
  if (next.status === 'cancelled') {
    try {
      await releaseRedemption(adminClient, next.id)
    } catch (err) {
      console.error('[queue] releaseRedemption failed', err)
    }
  }
  return next
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

function isUniquePortError(error: { message?: string; code?: string } | null) {
  const message = error?.message || ''
  return (
    error?.code === '23505' ||
    /orders_active_delivery_port|duplicate key|unique/i.test(message)
  )
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

export function parseDeliveryPort(value: unknown): 1 | 2 | null {
  if (value === 1 || value === '1') return 1
  if (value === 2 || value === '2') return 2
  return null
}

function asLockedPort(value: unknown): 1 | 2 | undefined {
  return parseDeliveryPort(value) ?? undefined
}

export function wrongWindowScanMessage(assigned: 1 | 2) {
  return `This order is for window ${assigned}. Please scan at window ${assigned}.`
}

export function windowBusyMessage(port: 1 | 2) {
  return `Window ${port} is currently serving another drink. Please wait.`
}

export function missedScanQueueMessage(position: number | null) {
  if (position && position > 0) {
    return `You missed the scan window. Please wait for your turn. You are now #${position} in the queue.`
  }
  return 'You missed the scan window. Please wait at the back of the queue for your turn.'
}

export function cancelledAfterMissedScansMessage() {
  return 'This order was cancelled after 3 missed scans. Please place a new order in the app.'
}

/** CofePlus create-dispatch requires an integer hole. Prefer an unused 1|2. */
export function pickDeliveryPort(busyOrders: MachineOrderRow[]): 1 | 2 {
  const used = new Set(
    busyOrders
      .map((order) => Number(order.delivery_port))
      .filter((port) => port === 1 || port === 2)
  )
  for (const port of DISPENSE_PORTS) {
    if (!used.has(port)) return port
  }
  return 1
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
    const holdingMachine = MACHINE_BUSY_STATUSES.includes(
      order.status as (typeof MACHINE_BUSY_STATUSES)[number]
    )
    const isYourTurn = Boolean(order.pickup_code) && holdingMachine

    let estimatedWaitSeconds = 0
    if (isYourTurn && environment === 'test') {
      const elapsed = elapsedSecondsSince(order.machine_activated_at)
      estimatedWaitSeconds = Math.max(0, TEST_DISPENSE_SECONDS - elapsed)
    }

    return emptyQueue({
      environment,
      position: order.pickup_code ? 0 : holdingMachine ? 1 : null,
      aheadCount: 0,
      isYourTurn,
      // Pending without a code is still generating, not "Ready now"
      estimatedWaitSeconds:
        holdingMachine && !order.pickup_code ? 1 : estimatedWaitSeconds,
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

export function normalizeScanCode(raw: string) {
  const compact = raw.trim().replace(/\s+/g, '').toUpperCase()
  const kafeiCode = compact.match(/KF[A-F0-9]{8}/)
  if (kafeiCode) return kafeiCode[0]
  // The kiosk scanner often submits before the last characters land.
  // Keep a KF prefix so lookup can recover it when only one order matches.
  const partialKafeiCode = compact.match(/KF[A-F0-9]{4,7}/)
  if (partialKafeiCode) return partialKafeiCode[0]
  const orderNumber = compact.match(/ORD-[A-Z0-9-]+/)
  if (orderNumber) return orderNumber[0]
  return compact
}

function randomKafeiPickupCode() {
  return `KF${randomBytes(4).toString('hex').toUpperCase()}`
}

async function allocateUniquePickupCode(adminClient: SupabaseClient) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = randomKafeiPickupCode()
    const { data } = await adminClient
      .from('orders')
      .select('id')
      .eq('pickup_code', code)
      .maybeSingle()
    if (!data) return code
  }
  return `KF${Date.now().toString(36).toUpperCase()}`
}

async function mintLocalPickupQr(
  adminClient: SupabaseClient,
  order: MachineOrderRow,
  podId: string,
  environment: CofeplusEnvironment,
  deliveryPort?: number | null
): Promise<{ order: MachineOrderRow; error?: string }> {
  const preferredPort =
    asLockedPort(deliveryPort) ?? asLockedPort(order.delivery_port)
  let lockedPort = preferredPort
  if (!lockedPort) {
    const busy = await findBusyMachineOrders(adminClient, podId, environment)
    lockedPort = pickDeliveryPort(busy.filter((row) => row.id !== order.id))
  }

  const pickupCode = await allocateUniquePickupCode(adminClient)
  const expiry = await scanExpiryIso(adminClient)
  const activationFields: Record<string, unknown> = {
    status: order.status === 'queued' ? 'pending' : order.status,
    pickup_code: pickupCode,
    cofeplus_pod_id: podId,
    cofeplus_environment: environment,
    machine_activated_at: order.machine_activated_at || new Date().toISOString(),
    scan_expires_at: expiry,
    delivery_port: lockedPort,
  }

  let write = await adminClient
    .from('orders')
    .update(activationFields)
    .eq('id', order.id)
    .is('pickup_code', null)
    .select(ORDER_SELECT)
    .maybeSingle()

  if (write.error && /delivery_port/i.test(write.error.message)) {
    delete activationFields.delivery_port
    write = await adminClient
      .from('orders')
      .update(activationFields)
      .eq('id', order.id)
      .is('pickup_code', null)
      .select(ORDER_SELECT)
      .maybeSingle()
  }

  if (write.data?.pickup_code) {
    console.log(
      `[queue] minted Kafei QR order=${write.data.id} pickup=${write.data.pickup_code} pod=${podId}`
    )
    return { order: write.data as MachineOrderRow }
  }

  const current = await reloadOrder(adminClient, order.id)
  if (current?.pickup_code) {
    return { order: current }
  }

  return {
    order: current || order,
    error: write.error?.message || 'Failed to save pickup QR',
  }
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
    .select(
      'product_id, addons, latte_art_flag, latte_art_locator, products(name, temperature, cofeplus_item_code)'
    )
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

  // Merge selected Kafei add-ons → CofePlus modifier group/flag
  const rawAddons = data?.addons
  let addonIds: string[] = []
  if (Array.isArray(rawAddons)) {
    addonIds = rawAddons.filter((id): id is string => typeof id === 'string')
  } else if (typeof rawAddons === 'string') {
    try {
      const parsed = JSON.parse(rawAddons)
      if (Array.isArray(parsed)) {
        addonIds = parsed.filter((id): id is string => typeof id === 'string')
      }
    } catch {
      /* ignore */
    }
  }

  if (addonIds.length > 0) {
    const { data: addonRows } = await adminClient
      .from('add_ons')
      .select('id, name, cofeplus_group, cofeplus_flag, cofeplus_locator')
      .in('id', addonIds)

    for (const addon of addonRows || []) {
      if (addon.cofeplus_group && addon.cofeplus_flag) {
        modifierPreferences[addon.cofeplus_group] = addon.cofeplus_flag
        continue
      }
      const inferred = inferAddonModifier(addon.name || '')
      if (inferred) {
        modifierPreferences[inferred.group] = inferred.flag
      }
    }
  }

  const latteArtFlag =
    typeof data?.latte_art_flag === 'string' ? data.latte_art_flag.trim() : ''
  const latteArtLocator =
    typeof data?.latte_art_locator === 'string'
      ? data.latte_art_locator.trim()
      : ''
  const handArt =
    isPlainHotLatte(displayNote, product?.temperature)
      ? parseHandArtLocator(latteArtLocator)
      : null
  if (handArt) {
    itemCode = HAND_LATTE_ART_ITEM_CODES[handArt]
  } else if (
    (latteArtFlag === 'catalog' || latteArtFlag === 'upload') &&
    latteArtLocator &&
    !modifierPreferences.temperature?.startsWith('iced')
  ) {
    modifierPreferences[LATTE_ART_GROUP] = latteArtFlag
    modifierPreferences[LATTE_ART_LOCATOR_CHOICE] = latteArtLocator
  }

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

/**
 * pickup = mint a Kafei QR only. The kiosk APK later starts immediate.
 * immediate = call CofePlus now (admin skip / no QR yet).
 */
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
  const latest = await reloadOrder(adminClient, order.id)
  if (latest?.pickup_code) {
    if (
      mode === 'pickup' &&
      !latest.scan_expires_at &&
      elapsedSecondsSince(latest.machine_activated_at) < 15
    ) {
      const expiry = await scanExpiryIso(adminClient)
      const { data: patched } = await adminClient
        .from('orders')
        .update({ scan_expires_at: expiry })
        .eq('id', latest.id)
        .eq('pickup_code', latest.pickup_code)
        .select(ORDER_SELECT)
        .maybeSingle()
      return { order: (patched as MachineOrderRow) || { ...latest, scan_expires_at: expiry } }
    }
    return { order: latest }
  }
  if (latest?.cofeplus_dispatch_id && !isLocalDispatchId(latest.cofeplus_dispatch_id)) {
    return { order: latest }
  }

  if (!item) {
    return {
      order: latest || order,
      error:
        'This drink is missing a CofePlus item code. Set it on the product in admin.',
    }
  }

  // Pickup no longer calls CofePlus. The kiosk APK scans this QR, then we
  // start mode=immediate so brew statuses actually come back.
  if (mode === 'pickup') {
    return mintLocalPickupQr(
      adminClient,
      latest || order,
      podId,
      environment,
      deliveryPort
    )
  }

  const lockId = dispatchLockIdForOrder(order.id)
  const lockAge = elapsedSecondsSince(latest?.machine_activated_at)
  if (
    isInFlightDispatchLock(latest?.cofeplus_dispatch_id) &&
    lockAge < ACTIVATION_RETRY_SECONDS
  ) {
    return { order: latest || order }
  }

  if (!isInFlightDispatchLock(latest?.cofeplus_dispatch_id)) {
    const { data: locked } = await adminClient
      .from('orders')
      .update({
        cofeplus_dispatch_id: lockId,
        machine_activated_at:
          latest?.machine_activated_at || new Date().toISOString(),
      })
      .eq('id', order.id)
      .is('pickup_code', null)
      .is('cofeplus_dispatch_id', null)
      .select(ORDER_SELECT)
      .maybeSingle()

    if (!locked) {
      const current = await reloadOrder(adminClient, order.id)
      return { order: current || latest || order }
    }
  }

  const preferredPort =
    asLockedPort(deliveryPort) ??
    asLockedPort(latest?.delivery_port ?? order.delivery_port)
  let lockedPort = preferredPort
  if (!lockedPort) {
    const busy = await findBusyMachineOrders(adminClient, podId, environment)
    lockedPort = pickDeliveryPort(busy.filter((row) => row.id !== order.id))
  }

  console.log(
    `[queue] activating order ${order.id} pod=${podId} env=${environment} item=${item.itemCode} port=${lockedPort} iced=${item.modifierPreferences.temperature}`
  )

  const dispatchResult = await createPickupDispatch({
    podId,
    itemCode: item.itemCode,
    environment,
    displayNote: item.displayNote,
    deliveryPort: lockedPort,
    modifierPreferences: item.modifierPreferences,
    mode,
    adminClient,
    idempotencyKey: `kafei-${order.id}-m${latest?.missed_scans || 0}`,
  })

  if (!dispatchResult.ok) {
    console.error('[queue] dispatch failed', dispatchResult)
    await adminClient
      .from('orders')
      .update({
        status: 'pending',
        cofeplus_dispatch_id: null,
      })
      .eq('id', order.id)
      .eq('cofeplus_dispatch_id', lockId)
    const current = await reloadOrder(adminClient, order.id)
    return {
      order: current || { ...order, status: 'pending', cofeplus_dispatch_id: null },
      error: dispatchResult.error,
    }
  }

  const activationFields: Record<string, unknown> = {
    status: 'brewing',
    pickup_code: dispatchResult.dispatch.pickupCode || null,
    cofeplus_dispatch_id: dispatchResult.dispatch.id,
    cofeplus_pod_id: podId,
    cofeplus_environment: environment,
    machine_activated_at: new Date().toISOString(),
    delivery_port: lockedPort,
    scan_expires_at: null,
  }

  let lastError: string | undefined
  for (let attempt = 0; attempt < 3; attempt++) {
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
        .select(ORDER_SELECT)
        .maybeSingle()
    }

    const { data: activated, error: activateError } = activatedResult

    if (activated?.pickup_code) {
      console.log(
        `[queue] activated order ${activated.id} pickup=${activated.pickup_code} env=${environment}`
      )
      return { order: activated as MachineOrderRow }
    }

    const current = await reloadOrder(adminClient, order.id)
    if (current?.pickup_code) {
      return { order: current }
    }

    if (activateError) {
      lastError = activateError.message
      console.error('[queue] failed to persist activated dispatch', activateError)
    }

    await sleep(250 * (attempt + 1))
  }

  return { order: latest || order, error: lastError || 'Failed to save pickup QR' }
}

/**
 * Start CofePlus mode=immediate for an order that already has a Kafei QR.
 * Keeps pickup_code so the phone screen and kiosk stay in sync.
 */
export async function persistImmediateDispatchForOrder(
  adminClient: SupabaseClient,
  order: MachineOrderRow,
  podId: string,
  environment: CofeplusEnvironment,
  deliveryPort?: number | null
): Promise<{ order: MachineOrderRow; error?: string; alreadyStarted?: boolean }> {
  let latest = (await reloadOrder(adminClient, order.id)) || order
  if (
    latest.cofeplus_dispatch_id &&
    !isLocalDispatchId(latest.cofeplus_dispatch_id)
  ) {
    return { order: latest, alreadyStarted: true }
  }

  const item = await loadOrderItemForDispatch(
    adminClient,
    latest.id,
    environment,
    podId
  )
  if (!item) {
    return {
      order: latest,
      error:
        'This drink is missing a CofePlus item code. Set it on the product in admin.',
    }
  }

  const lockId = dispatchLockIdForOrder(latest.id)
  const lockAge = elapsedSecondsSince(latest.machine_activated_at)
  if (
    isInFlightDispatchLock(latest.cofeplus_dispatch_id) &&
    lockAge < ACTIVATION_RETRY_SECONDS
  ) {
    return { order: latest, alreadyStarted: true }
  }

  if (!isInFlightDispatchLock(latest.cofeplus_dispatch_id)) {
    let lockQuery = adminClient
      .from('orders')
      .update({
        cofeplus_dispatch_id: lockId,
        machine_activated_at:
          latest.machine_activated_at || new Date().toISOString(),
      })
      .eq('id', latest.id)
    lockQuery = latest.cofeplus_dispatch_id
      ? lockQuery.eq('cofeplus_dispatch_id', latest.cofeplus_dispatch_id)
      : lockQuery.is('cofeplus_dispatch_id', null)
    const { data: locked } = await lockQuery.select(ORDER_SELECT).maybeSingle()

    if (!locked) {
      const current = await reloadOrder(adminClient, latest.id)
      const held = current || latest
      return {
        order: held,
        alreadyStarted: Boolean(held.cofeplus_dispatch_id),
      }
    }
  }

  const preferredPort =
    asLockedPort(deliveryPort) ?? asLockedPort(latest.delivery_port)
  let lockedPort = preferredPort
  if (!lockedPort) {
    const busy = await findBusyMachineOrders(adminClient, podId, environment)
    lockedPort = pickDeliveryPort(busy.filter((row) => row.id !== latest.id))
  }

  if (lockedPort && latest.delivery_port !== lockedPort) {
    const claim = await adminClient
      .from('orders')
      .update({ delivery_port: lockedPort })
      .eq('id', latest.id)
      .select(ORDER_SELECT)
      .maybeSingle()
    if (claim.error && isUniquePortError(claim.error)) {
      return { order: latest, error: windowBusyMessage(lockedPort) }
    }
    if (claim.data) {
      latest = claim.data as MachineOrderRow
    }
  }

  console.log(
    `[queue] immediate brew order=${latest.id} pod=${podId} env=${environment} item=${item.itemCode} port=${lockedPort}`
  )

  const dispatchResult = await createPickupDispatch({
    podId,
    itemCode: item.itemCode,
    environment,
    displayNote: item.displayNote,
    deliveryPort: lockedPort,
    modifierPreferences: item.modifierPreferences,
    mode: 'immediate',
    adminClient,
    idempotencyKey: `kafei-${latest.id}-scan-m${latest.missed_scans || 0}`,
  })

  if (!dispatchResult.ok) {
    console.error('[queue] immediate dispatch failed', dispatchResult)
    await adminClient
      .from('orders')
      .update({
        status: 'pending',
        cofeplus_dispatch_id: null,
      })
      .eq('id', latest.id)
      .eq('cofeplus_dispatch_id', lockId)
    const current = await reloadOrder(adminClient, latest.id)
    return {
      order: current || { ...latest, status: 'pending', cofeplus_dispatch_id: null },
      error: dispatchResult.error,
    }
  }

  const activationFields: Record<string, unknown> = {
    status: 'brewing',
    cofeplus_dispatch_id: dispatchResult.dispatch.id,
    cofeplus_pod_id: podId,
    cofeplus_environment: environment,
    machine_activated_at: new Date().toISOString(),
    delivery_port: lockedPort,
    scan_expires_at: null,
  }
  if (!latest.pickup_code && dispatchResult.dispatch.pickupCode) {
    activationFields.pickup_code = dispatchResult.dispatch.pickupCode
  }

  let write = await adminClient
    .from('orders')
    .update(activationFields)
    .eq('id', latest.id)
    .select(ORDER_SELECT)
    .maybeSingle()

  if (write.error && /delivery_port/i.test(write.error.message)) {
    if (preferredPort) {
      return {
        order: latest,
        error: windowBusyMessage(preferredPort),
      }
    }
    delete activationFields.delivery_port
    write = await adminClient
      .from('orders')
      .update(activationFields)
      .eq('id', latest.id)
      .select(ORDER_SELECT)
      .maybeSingle()
  }

  if (write.data) {
    console.log(
      `[queue] immediate started order=${write.data.id} dispatch=${write.data.cofeplus_dispatch_id}`
    )
    return { order: write.data as MachineOrderRow }
  }

  const current = await reloadOrder(adminClient, latest.id)
  return {
    order: current || latest,
    error: write.error?.message || 'Failed to save immediate dispatch',
  }
}

export async function startImmediateBrewForOrder(
  adminClient: SupabaseClient,
  order: MachineOrderRow,
  options?: { podId?: string; fromScan?: boolean; deliveryPort?: number | null }
): Promise<{ order: MachineOrderRow; error?: string; alreadyStarted?: boolean }> {
  let current = (await reloadOrder(adminClient, order.id)) || order
  const requiredPod = options?.podId?.trim()
  const orderPod = current.cofeplus_pod_id?.trim()

  if (requiredPod && orderPod && orderPod !== requiredPod) {
    return { order: current, error: 'This QR is for a different machine' }
  }

  if (!options?.fromScan) {
    current = await maybeExpireMissedScan(adminClient, current)
    if (current.status === 'queued') {
      return {
        order: current,
        error:
          'QR expired. The customer will get a new code when it is their turn again.',
      }
    }
  }

  if (current.status === 'completed' || current.status === 'cancelled') {
    return { order: current, error: 'This order is already finished' }
  }

  if (
    current.cofeplus_dispatch_id &&
    !isLocalDispatchId(current.cofeplus_dispatch_id)
  ) {
    current = await syncBusyOrderAndAdvanceQueue(adminClient, current)
    return { order: current, alreadyStarted: true }
  }

  const podId = orderPod || requiredPod
  if (!podId) {
    return { order: current, error: 'Order is not linked to a machine' }
  }

  const environment = asEnvironment(current.cofeplus_environment)
  return persistImmediateDispatchForOrder(
    adminClient,
    current,
    podId,
    environment,
    asLockedPort(options?.deliveryPort) ?? current.delivery_port
  )
}

/**
 * Reopen a stuck / cancelled order, mint a fresh Kafei QR, and put it back
 * at the machine so the customer can scan again. Does not call CofePlus.
 */
export async function resetOrderForRescan(
  adminClient: SupabaseClient,
  orderId: string
): Promise<{ order?: MachineOrderRow; pickupCode?: string | null; error?: string }> {
  const current = await reloadOrder(adminClient, orderId)
  if (!current) {
    return { error: 'Order not found' }
  }
  if (current.status === 'completed') {
    return { order: current, error: 'Completed orders cannot be reset' }
  }
  if (
    current.cofeplus_dispatch_id &&
    !isLocalDispatchId(current.cofeplus_dispatch_id)
  ) {
    return {
      order: current,
      error:
        'This order already has a live CofePlus dispatch. Resetting it could brew twice.',
    }
  }

  const podId = current.cofeplus_pod_id?.trim()
  if (!podId) {
    return { order: current, error: 'Order is not linked to a machine' }
  }

  const environment = asEnvironment(current.cofeplus_environment)
  const pickupCode = await allocateUniquePickupCode(adminClient)
  const expiry = new Date(Date.now() + 15 * 60 * 1000).toISOString()
  const busy = await findBusyMachineOrders(adminClient, podId, environment)
  const others = busy.filter((row) => row.id !== current.id)
  const lockedPort =
    asLockedPort(current.delivery_port) ?? pickDeliveryPort(others)

  const fields: Record<string, unknown> = {
    status: 'pending',
    pickup_code: pickupCode,
    cofeplus_dispatch_id: null,
    machine_activated_at: new Date().toISOString(),
    scan_expires_at: expiry,
    missed_scans: 0,
    delivery_port: lockedPort,
  }

  let write = await adminClient
    .from('orders')
    .update(fields)
    .eq('id', current.id)
    .select(ORDER_SELECT)
    .maybeSingle()

  if (write.error && isUniquePortError(write.error)) {
    delete fields.delivery_port
    write = await adminClient
      .from('orders')
      .update(fields)
      .eq('id', current.id)
      .select(ORDER_SELECT)
      .maybeSingle()
  }

  if (write.error || !write.data) {
    return {
      order: current,
      error: write.error?.message || 'Failed to reset order for rescan',
    }
  }

  const order = write.data as MachineOrderRow
  console.log(
    `[queue] reset for rescan order=${order.id} pickup=${order.pickup_code} port=${order.delivery_port}`
  )
  return { order, pickupCode: order.pickup_code }
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
  if (order.pickup_code) {
    return { order }
  }
  if (
    order.cofeplus_dispatch_id &&
    !isLocalDispatchId(order.cofeplus_dispatch_id)
  ) {
    return { order }
  }
  if (
    isInFlightDispatchLock(order.cofeplus_dispatch_id) &&
    elapsedSecondsSince(order.machine_activated_at) < ACTIVATION_RETRY_SECONDS
  ) {
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

  const persisted = await persistPickupForOrder(
    adminClient,
    order,
    podId,
    environment,
    freePort
  )

  if (persisted.error && !persisted.order.pickup_code) {
    await adminClient
      .from('orders')
      .update({
        status: 'queued',
        machine_activated_at: null,
        delivery_port: null,
        cofeplus_dispatch_id: null,
      })
      .eq('id', order.id)
      .eq('status', 'pending')
      .is('pickup_code', null)
    return {
      order: {
        ...order,
        status: 'queued',
        machine_activated_at: null,
        delivery_port: null,
        cofeplus_dispatch_id: null,
      },
      error: persisted.error,
    }
  }

  return persisted
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
    environment,
    podId
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

  // Claim a machine slot (max 2). CofePlus still needs an integer hole.
  const { data: claimed, error: claimError } = await adminClient
    .from('orders')
    .update({
      status: 'pending',
      machine_activated_at: new Date().toISOString(),
      delivery_port: null,
    })
    .eq('id', nextQueued.id)
    .eq('status', 'queued')
    .select(ORDER_SELECT)
    .maybeSingle()

  if (claimError || !claimed) {
    console.error('[queue] claim race lost or failed', claimError)
    return { order: null }
  }

  const busyAfter = await findBusyMachineOrders(adminClient, podId, environment)
  const others = busyAfter.filter((row) => row.id !== claimed.id)
  const assignedPort = findFreeDeliveryPort(others)
  if (!assignedPort) {
    await adminClient
      .from('orders')
      .update({
        status: 'queued',
        machine_activated_at: null,
        delivery_port: null,
        cofeplus_dispatch_id: null,
      })
      .eq('id', claimed.id)
      .eq('status', 'pending')
      .is('pickup_code', null)
    return { order: null }
  }

  const persisted = await persistPickupForOrder(
    adminClient,
    claimed as MachineOrderRow,
    podId,
    environment,
    assignedPort
  )

  if (persisted.error && !persisted.order.pickup_code) {
    await adminClient
      .from('orders')
      .update({
        status: 'queued',
        machine_activated_at: null,
        delivery_port: null,
        cofeplus_dispatch_id: null,
      })
      .eq('id', claimed.id)
      .eq('status', 'pending')
      .is('pickup_code', null)
    return { order: null, error: persisted.error }
  }

  return { order: persisted.order }
}

/**
 * Test mode: after TEST_DISPENSE_SECONDS, finish an order that already started
 * brewing. Unscanned pending QRs must expire and requeue instead.
 */
async function maybeCompleteTestDispense(
  adminClient: SupabaseClient,
  order: MachineOrderRow
): Promise<MachineOrderRow> {
  const environment = asEnvironment(order.cofeplus_environment)
  if (environment !== 'test') {
    return order
  }

  // Waiting for a scan — do not auto-complete or fake a brew.
  if (order.status === 'pending') {
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

  await onOrderCompleted(adminClient, completed as MachineOrderRow)
  return completed as MachineOrderRow
}

/**
 * Place a missed-scan order as 3rd overall: behind the other serving slot
 * and the next waiter who takes this freed QR. Example: A (QR) B C D,
 * A misses → C gets the QR, order becomes B, C, A, D.
 */
async function createdAtForThirdPlace(
  adminClient: SupabaseClient,
  order: MachineOrderRow,
  podId: string,
  environment: CofeplusEnvironment
): Promise<string> {
  const { data: waiting } = await adminClient
    .from('orders')
    .select('id, created_at')
    .eq('cofeplus_pod_id', podId)
    .eq('cofeplus_environment', environment)
    .eq('status', 'queued')
    .neq('id', order.id)
    .order('created_at', { ascending: true })

  const nextUp = waiting?.[0]
  const afterNext = waiting?.[1]
  if (!nextUp) {
    return new Date().toISOString()
  }

  const nextTime = new Date(nextUp.created_at).getTime()
  if (afterNext) {
    const afterTime = new Date(afterNext.created_at).getTime()
    const mid = Math.floor((nextTime + afterTime) / 2)
    if (mid > nextTime) {
      return new Date(mid).toISOString()
    }
  }

  return new Date(nextTime + 1000).toISOString()
}

/**
 * If the QR is not scanned within the window, push the user to 3rd in queue
 * and regenerate later. After 3 misses the order is cancelled.
 */
async function maybeExpireMissedScan(
  adminClient: SupabaseClient,
  order: MachineOrderRow
): Promise<MachineOrderRow> {
  if (order.status !== 'pending') return order
  if (!order.pickup_code || !order.scan_expires_at || !order.machine_activated_at) {
    return order
  }

  const expiresAt = order.scan_expires_at
    ? new Date(order.scan_expires_at).getTime()
    : null

  let deadline = expiresAt
  if (!deadline) {
    try {
      const settings = await getProductLogicSettings(adminClient)
      deadline =
        new Date(order.machine_activated_at).getTime() +
        (settings.scan_window_seconds || 80) * 1000
    } catch {
      deadline = new Date(order.machine_activated_at).getTime() + 80_000
    }
  }

  if (Date.now() < deadline) {
    return order
  }

  const missed = (order.missed_scans || 0) + 1
  const podId = order.cofeplus_pod_id?.trim()
  const environment = asEnvironment(order.cofeplus_environment)

  if (missed >= MAX_MISSED_SCANS) {
    console.log(
      `[queue] scan missed ${missed}x order=${order.id} — cancelling`
    )
    const { data: cancelled } = await adminClient
      .from('orders')
      .update({
        status: 'cancelled',
        cofeplus_dispatch_id: null,
        machine_activated_at: null,
        scan_expires_at: null,
        delivery_port: null,
        missed_scans: missed,
      })
      .eq('id', order.id)
      .eq('status', 'pending')
      .select(ORDER_SELECT)
      .maybeSingle()

    if (cancelled) {
      try {
        await releaseRedemption(adminClient, cancelled.id)
      } catch (err) {
        console.error('[queue] releaseRedemption failed', err)
      }
      return cancelled as MachineOrderRow
    }
    return order
  }

  const requeueCreatedAt = podId
    ? await createdAtForThirdPlace(adminClient, order, podId, environment)
    : new Date().toISOString()

  console.log(
    `[queue] scan window missed order=${order.id} miss=${missed} — requeue as 3rd`
  )

    const { data: bumped } = await adminClient
    .from('orders')
    .update({
      status: 'queued',
      cofeplus_dispatch_id: null,
      machine_activated_at: null,
      scan_expires_at: null,
      delivery_port: null,
      missed_scans: missed,
      created_at: requeueCreatedAt,
    })
    .eq('id', order.id)
    .eq('status', 'pending')
    .select(ORDER_SELECT)
    .maybeSingle()

  return (bumped as MachineOrderRow) || order
}

/** Requeue a pending order whose scan window has already closed. */
export async function settleMissedScan(
  adminClient: SupabaseClient,
  order: MachineOrderRow
): Promise<MachineOrderRow> {
  return maybeExpireMissedScan(adminClient, order)
}

async function onOrderCompleted(
  adminClient: SupabaseClient,
  order: MachineOrderRow
) {
  try {
    await commitRedemption(adminClient, order.id)
  } catch (err) {
    console.error('[queue] commitRedemption failed', err)
  }
  if (order.user_id) {
    try {
      await activateReferralOnFirstDrink(adminClient, order.user_id)
    } catch (err) {
      console.error('[queue] referral activation failed', err)
    }
  }
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
  let current = await maybeExpireMissedScan(adminClient, order)

  if (current.status === 'queued') {
    await tryActivateNextQueuedOrder(adminClient, podId, environment)
    const reloaded = await reloadOrder(adminClient, current.id)
    return reloaded || current
  }

  if (
    !current.pickup_code &&
    !current.cofeplus_dispatch_id &&
    MACHINE_BUSY_STATUSES.includes(
      current.status as (typeof MACHINE_BUSY_STATUSES)[number]
    )
  ) {
    const recovered = await recoverStuckPendingOrder(
      adminClient,
      current,
      podId,
      environment
    )
    current = recovered.order
  }

  if (
    current.cofeplus_dispatch_id &&
    MACHINE_BUSY_STATUSES.includes(
      current.status as (typeof MACHINE_BUSY_STATUSES)[number]
    )
  ) {
    if (isInFlightDispatchLock(current.cofeplus_dispatch_id)) {
      if (
        !current.pickup_code &&
        elapsedSecondsSince(current.machine_activated_at) >= ACTIVATION_RETRY_SECONDS
      ) {
        const recovered = await persistPickupForOrder(
          adminClient,
          current,
          podId,
          environment,
          current.delivery_port
        )
        current = recovered.order
      }
    } else if (isSimulatedDispatchId(current.cofeplus_dispatch_id)) {
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
        current = await persistMappedDispatchStatus(
          adminClient,
          current,
          snapshot.snapshot
        )
      } else {
        console.warn(
          `[queue] dispatch snapshot failed order=${current.id}`,
          snapshot.error
        )
      }
    }
  }

  if (current.status === 'completed') {
    await onOrderCompleted(adminClient, current)
  }

  if (current.status === 'cancelled') {
    try {
      await releaseRedemption(adminClient, current.id)
    } catch (err) {
      console.error('[queue] releaseRedemption failed', err)
    }
  }

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
    await Promise.all(
      busyOrders.map((busy) =>
        syncBusyOrderAndAdvanceQueue(adminClient, busy).catch((error) => {
          console.error('[queue] sibling sync failed', busy.id, error)
        })
      )
    )
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
    const siblings = await findBusyMachineOrders(adminClient, podId, environment)
    await Promise.all(
      siblings
        .filter((sibling) => sibling.id !== current.id)
        .map((sibling) =>
          syncBusyOrderAndAdvanceQueue(adminClient, sibling).catch((error) => {
            console.error('[queue] sibling sync failed', sibling.id, error)
          })
        )
    )
    if (current.status === 'completed' || current.status === 'cancelled') {
      const { data: refreshed } = await adminClient
        .from('orders')
        .select(ORDER_SELECT)
        .eq('id', current.id)
        .single()
      if (refreshed) current = refreshed as MachineOrderRow
    }
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

import {
  buildDispatchBody,
  isDispatchArchivedError,
  parseCreateDispatch,
  parseDispatchSnapshot,
  selectModifiersFromGroups,
  type CreateDispatchResult,
  type DispatchSnapshot,
  type PodItemOption,
} from '@/components/api-test/cofeplus-test-shared'
import type { CofeplusEnvironment } from '@/lib/cofeplus/config'
import { executeCofeplusRequest } from '@/lib/cofeplus/proxy'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadSyncedPodItem } from '@/lib/cofeplus/sync'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface CreatePickupDispatchInput {
  podId: string
  itemCode: string
  environment: CofeplusEnvironment
  displayNote?: string
  deliveryPort?: number
  modifierPreferences?: Record<string, string>
  /**
   * pickup = wait for QR scan, then brew (default).
   * immediate = skip pickup / skip the machine queue and start fulfillment now.
   */
  mode?: 'pickup' | 'immediate'
  adminClient?: SupabaseClient
}

export function isSimulatedDispatchId(dispatchId: string | null | undefined) {
  return Boolean(dispatchId?.startsWith('sim-'))
}

export interface CreatePickupDispatchResult {
  ok: true
  environment: CofeplusEnvironment
  dispatch: CreateDispatchResult
  item: PodItemOption
}

export interface CreatePickupDispatchError {
  ok: false
  environment: CofeplusEnvironment
  error: string
  status?: number
  body?: string
}

async function loadPodItem(
  podId: string,
  itemCode: string,
  environment: CofeplusEnvironment,
  adminClient?: SupabaseClient
): Promise<
  | { ok: true; item: PodItemOption }
  | { ok: false; error: string; status?: number; body?: string }
> {
  const client = adminClient ?? createAdminClient()
  const cached = await loadSyncedPodItem(client, podId, itemCode, environment)
  if (cached) {
    return { ok: true, item: cached }
  }

  return {
    ok: false,
    error: `Item ${itemCode} is not in the synced menu for ${podId}. Run CofePlus sync.`,
  }
}

/**
 * Test-mode fake dispatch: no CofePlus call. QR is still shown so the app
 * flow can be exercised; queue auto-completes after TEST_DISPENSE_SECONDS.
 */
export function createSimulatedPickupDispatch(
  input: CreatePickupDispatchInput
): CreatePickupDispatchResult {
  const environment: CofeplusEnvironment = 'test'
  const itemCode = input.itemCode.trim()
  const stamp = Date.now().toString(36).toUpperCase()
  const pickupCode = `KAFEI-TEST-${stamp}`
  const dispatchId = `sim-${stamp}`

  return {
    ok: true,
    environment,
    dispatch: {
      id: dispatchId,
      orderNumber: `SIM-${stamp}`,
      pickupCode,
    },
    item: {
      itemCode,
      display: input.displayNote || itemCode,
      price: 0,
      outOfStock: false,
      offMenu: false,
      category: 'coffee',
      modifiers: [],
      modifierGroups: [],
    },
  }
}

export async function createPickupDispatch(
  input: CreatePickupDispatchInput
): Promise<CreatePickupDispatchResult | CreatePickupDispatchError> {
  const environment = input.environment === 'live' ? 'live' : 'test'
  const podId = input.podId.trim()
  const itemCode = input.itemCode.trim()

  if (!podId) {
    return { ok: false, environment, error: 'Missing CofePlus pod id' }
  }
  if (!itemCode) {
    return { ok: false, environment, error: 'Missing CofePlus item code' }
  }

  const mode = input.mode === 'immediate' ? 'immediate' : 'pickup'
  const canCallMachine = !podId.startsWith('kiosk-')

  if (!canCallMachine) {
    return createSimulatedPickupDispatch(input)
  }

  const loaded = await loadPodItem(podId, itemCode, environment, input.adminClient)
  if (!loaded.ok) {
    return {
      ok: false,
      environment,
      error: loaded.error,
      status: loaded.status,
      body: loaded.body,
    }
  }

  const modifiers = input.modifierPreferences
    ? selectModifiersFromGroups(
        loaded.item.modifierGroups,
        input.modifierPreferences
      )
    : loaded.item.modifiers

  const body = buildDispatchBody(loaded.item, {
    lang: 'en',
    channel: 'mobile',
    deliveryPort: input.deliveryPort === 2 ? 2 : 1,
    displayNote: input.displayNote || loaded.item.display,
    modifiers,
  })

  const response = await executeCofeplusRequest({
    method: 'POST',
    path: `/partner/v1/dispatches/${encodeURIComponent(podId)}`,
    query: { mode },
    body,
    environment,
  })

  if (!response.ok) {
    if (environment === 'test') {
      console.warn(
        `[cofeplus] test ${mode} dispatch failed (${response.status}); falling back to simulation`,
        response.body.slice(0, 200)
      )
      return createSimulatedPickupDispatch(input)
    }
    return {
      ok: false,
      environment,
      error: `CofePlus dispatch failed (${response.status})`,
      status: response.status,
      body: response.body,
    }
  }

  try {
    const dispatch = parseCreateDispatch(response.body)
    if (
      mode === 'pickup' &&
      (!dispatch.pickupCode || dispatch.pickupCode === '(none)')
    ) {
      return {
        ok: false,
        environment,
        error: 'CofePlus dispatch missing pickupCode',
        status: response.status,
        body: response.body,
      }
    }

    return {
      ok: true,
      environment,
      dispatch,
      item: loaded.item,
    }
  } catch (err) {
    return {
      ok: false,
      environment,
      error:
        err instanceof Error
          ? err.message
          : 'Failed to parse create dispatch response',
      status: response.status,
      body: response.body,
    }
  }
}

export async function listLiveDispatches(
  podId: string,
  environment: CofeplusEnvironment
): Promise<DispatchSnapshot[]> {
  const response = await executeCofeplusRequest({
    method: 'GET',
    path: `/partner/v1/dispatches/${encodeURIComponent(podId)}`,
    environment,
  })
  if (!response.ok) return []
  try {
    const data = JSON.parse(response.body) as unknown
    if (!Array.isArray(data)) return []
    return data
      .map((entry) => {
        try {
          return parseDispatchSnapshot(JSON.stringify(entry))
        } catch {
          return null
        }
      })
      .filter((entry): entry is DispatchSnapshot => entry !== null)
  } catch {
    return []
  }
}

function completedSnapshot(
  dispatchId: string,
  partial?: Partial<DispatchSnapshot>
): DispatchSnapshot {
  const rawState = partial?.state
  const state =
    rawState === 'failed'
      ? 'failed'
      : !rawState || rawState === 'unknown' || rawState === 'ready'
        ? 'done'
        : rawState

  return {
    id: partial?.id || dispatchId,
    state,
    orderNumber: partial?.orderNumber || '',
    pickupCode: partial?.pickupCode || '',
    archived: true,
    itemCount: partial?.itemCount ?? 0,
    lineItemCodes: partial?.lineItemCodes || [],
  }
}

async function fetchArchivedOrderSnapshot(
  podId: string,
  dispatchId: string,
  environment: CofeplusEnvironment
): Promise<DispatchSnapshot | null> {
  const archived = await executeCofeplusRequest({
    method: 'GET',
    path: `/partner/v1/pods/${encodeURIComponent(podId)}/orders/${encodeURIComponent(dispatchId)}`,
    environment,
  })
  if (!archived.ok) {
    return null
  }
  try {
    return completedSnapshot(
      dispatchId,
      parseDispatchSnapshot(archived.body, dispatchId)
    )
  } catch {
    return completedSnapshot(dispatchId)
  }
}

export async function fetchDispatchSnapshot(
  podId: string,
  dispatchId: string,
  environment: CofeplusEnvironment
): Promise<
  | { ok: true; snapshot: DispatchSnapshot }
  | { ok: false; error: string; status?: number; body?: string }
> {
  const response = await executeCofeplusRequest({
    method: 'GET',
    path: `/partner/v1/dispatches/${encodeURIComponent(podId)}/${encodeURIComponent(dispatchId)}`,
    environment,
  })

  if (response.ok) {
    try {
      return {
        ok: true,
        snapshot: parseDispatchSnapshot(response.body, dispatchId),
      }
    } catch (err) {
      return {
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : 'Failed to parse dispatch snapshot',
        status: response.status,
        body: response.body,
      }
    }
  }

  // Collected / finished orders leave the live dispatch API (410 DISPATCH_ARCHIVED).
  // The admin e2e tester already follows archived history; queue sync must too,
  // otherwise Kafei stays on "ready" forever and the app keeps polling.
  const explicitlyArchived =
    isDispatchArchivedError(response.status, response.body) ||
    response.status === 410
  const maybeGone = explicitlyArchived || response.status === 404

  if (maybeGone) {
    const archived = await fetchArchivedOrderSnapshot(
      podId,
      dispatchId,
      environment
    )
    if (archived) {
      return { ok: true, snapshot: archived }
    }
    if (explicitlyArchived) {
      return { ok: true, snapshot: completedSnapshot(dispatchId) }
    }
  }

  const live = await listLiveDispatches(podId, environment)
  const match = live.find((entry) => entry.id === dispatchId)
  if (match) {
    return { ok: true, snapshot: match }
  }

  return {
    ok: false,
    error: `Failed to fetch dispatch (${response.status})`,
    status: response.status,
    body: response.body,
  }
}

/** Live pod health. Test mode is always treated as available. */
export async function fetchPodAvailability(
  podId: string,
  environment: CofeplusEnvironment
): Promise<{ available: boolean; status: string }> {
  if (environment !== 'live') {
    return { available: true, status: 'test' }
  }

  const response = await executeCofeplusRequest({
    method: 'GET',
    path: `/partner/v1/pods/${encodeURIComponent(podId)}/status`,
    environment,
  })

  const raw = response.body || ''
  const status = raw.trim() || `http-${response.status}`

  if (!response.ok) {
    // Don't block the queue on a status-endpoint outage
    return { available: true, status }
  }

  const blocked = /offline|fault|error|down|unavailable|stopped|maintenance/i.test(
    status
  )
  return { available: !blocked, status }
}

/** Map CofePlus dispatch state → Kafei order status */
export function mapDispatchStateToOrderStatus(
  state: string
): 'pending' | 'brewing' | 'ready' | 'completed' | 'cancelled' {
  switch (state) {
    case 'accepted':
    case 'making':
      return 'brewing'
    case 'ready':
      return 'ready'
    case 'done':
    case 'collected':
      return 'completed'
    case 'failed':
      return 'cancelled'
    case 'pending':
    default:
      return 'pending'
  }
}

export function mapDispatchSnapshotToOrderStatus(snapshot: {
  state: string
  archived: boolean
}): 'pending' | 'brewing' | 'ready' | 'completed' | 'cancelled' {
  if (snapshot.archived) {
    return snapshot.state === 'failed' ? 'cancelled' : 'completed'
  }
  return mapDispatchStateToOrderStatus(snapshot.state)
}

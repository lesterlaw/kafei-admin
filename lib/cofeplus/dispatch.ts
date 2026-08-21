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
    let detail = `CofePlus dispatch failed (${response.status})`
    try {
      const parsed = JSON.parse(response.body) as { message?: string; error?: string }
      if (parsed.message) detail = parsed.message
      else if (parsed.error) detail = parsed.error
    } catch {
      // keep status text
    }
    return {
      ok: false,
      environment,
      error: detail,
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

export async function listLiveDispatchesResult(
  podId: string,
  environment: CofeplusEnvironment
): Promise<
  | { ok: true; items: DispatchSnapshot[] }
  | { ok: false; status?: number }
> {
  const response = await executeCofeplusRequest({
    method: 'GET',
    path: `/partner/v1/dispatches/${encodeURIComponent(podId)}`,
    environment,
  })
  if (!response.ok) {
    return { ok: false, status: response.status }
  }
  try {
    const data = JSON.parse(response.body) as unknown
    if (!Array.isArray(data)) {
      return { ok: false, status: response.status }
    }
    const items = data
      .map((entry) => {
        try {
          const record = entry as { id?: string }
          return parseDispatchSnapshot(
            JSON.stringify(entry),
            typeof record.id === 'string' ? record.id : ''
          )
        } catch {
          return null
        }
      })
      .filter((entry): entry is DispatchSnapshot => entry !== null)
    return { ok: true, items }
  } catch {
    return { ok: false, status: response.status }
  }
}

export async function listLiveDispatches(
  podId: string,
  environment: CofeplusEnvironment
): Promise<DispatchSnapshot[]> {
  const result = await listLiveDispatchesResult(podId, environment)
  return result.ok ? result.items : []
}

function completedSnapshot(
  dispatchId: string,
  partial?: Partial<DispatchSnapshot>
): DispatchSnapshot {
  const rawState = (partial?.state || '').toLowerCase()
  const state = rawState === 'failed' ? 'failed' : 'done'

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

function isTerminalDispatchState(state: string) {
  return state === 'done' || state === 'failed' || state === 'collected'
}

async function resolveArchivedSnapshot(
  podId: string,
  dispatchId: string,
  environment: CofeplusEnvironment
): Promise<DispatchSnapshot> {
  const archived = await fetchArchivedOrderSnapshot(
    podId,
    dispatchId,
    environment
  )
  return archived || completedSnapshot(dispatchId)
}

export async function fetchDispatchSnapshot(
  podId: string,
  dispatchId: string,
  environment: CofeplusEnvironment,
  options?: { completeIfMissing?: boolean }
): Promise<
  | { ok: true; snapshot: DispatchSnapshot }
  | { ok: false; error: string; status?: number; body?: string }
> {
  const completeIfMissing = options?.completeIfMissing !== false
  const response = await executeCofeplusRequest({
    method: 'GET',
    path: `/partner/v1/dispatches/${encodeURIComponent(podId)}/${encodeURIComponent(dispatchId)}`,
    environment,
  })

  // Docs: GET /partner/v1/dispatches/{podId}/{orderId} → 404 when the
  // order has left the live fulfillment table. Archived history is
  // GET /partner/v1/pods/{podId}/orders/{orderId} (state done | failed).
  // Older gate builds used 410 DISPATCH_ARCHIVED for the same case.
  const leftLiveTable =
    response.status === 404 ||
    response.status === 410 ||
    isDispatchArchivedError(response.status, response.body)

  if (leftLiveTable) {
    const archived = await fetchArchivedOrderSnapshot(
      podId,
      dispatchId,
      environment
    )
    if (archived) {
      return { ok: true, snapshot: archived }
    }

    const live = await listLiveDispatchesResult(podId, environment)
    if (live.ok) {
      const match = live.items.find((entry) => entry.id === dispatchId)
      if (match) {
        return { ok: true, snapshot: match }
      }
    }

    if (completeIfMissing) {
      console.log(
        `[cofeplus] dispatch ${dispatchId} left live table (${response.status}); marking done`
      )
      return { ok: true, snapshot: completedSnapshot(dispatchId) }
    }

    return {
      ok: false,
      error: `Dispatch is not live (${response.status})`,
      status: response.status,
      body: response.body,
    }
  }

  if (response.ok) {
    try {
      const snapshot = parseDispatchSnapshot(response.body, dispatchId)
      if (snapshot.archived || isTerminalDispatchState(snapshot.state)) {
        return { ok: true, snapshot }
      }

      // Docs: list live dispatches never includes archived orders.
      // A stale GET-by-id can still return making after collection.
      const live = await listLiveDispatchesResult(podId, environment)
      if (live.ok && !live.items.some((entry) => entry.id === dispatchId)) {
        return {
          ok: true,
          snapshot: await resolveArchivedSnapshot(podId, dispatchId, environment),
        }
      }

      return { ok: true, snapshot }
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

  const live = await listLiveDispatchesResult(podId, environment)
  if (live.ok) {
    const match = live.items.find((entry) => entry.id === dispatchId)
    if (match) {
      return { ok: true, snapshot: match }
    }
    return {
      ok: true,
      snapshot: await resolveArchivedSnapshot(podId, dispatchId, environment),
    }
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

/** Map CofePlus FetchDispatchState → Kafei order status */
export function mapDispatchStateToOrderStatus(
  state: string
): 'pending' | 'brewing' | 'ready' | 'completed' | 'cancelled' {
  switch (state.trim().toLowerCase()) {
    case 'accepted':
    case 'making':
    case 'brewing':
      return 'brewing'
    case 'ready':
      return 'ready'
    case 'done':
    case 'collected':
    case 'completed':
    case 'complete':
      return 'completed'
    case 'failed':
    case 'cancelled':
    case 'canceled':
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

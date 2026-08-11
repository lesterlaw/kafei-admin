import {
  buildDispatchBody,
  parseCreateDispatch,
  parseDispatchSnapshot,
  parsePodItems,
  parseSingleItem,
  type CreateDispatchResult,
  type DispatchSnapshot,
  type PodItemOption,
} from '@/components/api-test/cofeplus-test-shared'
import type { CofeplusEnvironment } from '@/lib/cofeplus/config'
import { executeCofeplusRequest } from '@/lib/cofeplus/proxy'

export interface CreatePickupDispatchInput {
  podId: string
  itemCode: string
  environment: CofeplusEnvironment
  displayNote?: string
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
  environment: CofeplusEnvironment
): Promise<
  | { ok: true; item: PodItemOption }
  | { ok: false; error: string; status?: number; body?: string }
> {
  const itemsResponse = await executeCofeplusRequest({
    method: 'GET',
    path: `/partner/v1/pods/${encodeURIComponent(podId)}/items`,
    environment,
  })

  if (itemsResponse.ok) {
    try {
      const items = parsePodItems(itemsResponse.body)
      const match = items.find((item) => item.itemCode === itemCode)
      if (match) {
        return { ok: true, item: match }
      }
    } catch (err) {
      return {
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : 'Failed to parse pod items response',
        status: itemsResponse.status,
        body: itemsResponse.body,
      }
    }
  }

  const itemResponse = await executeCofeplusRequest({
    method: 'GET',
    path: `/partner/v1/items/${encodeURIComponent(podId)}/${encodeURIComponent(itemCode)}`,
    environment,
  })

  if (!itemResponse.ok) {
    return {
      ok: false,
      error: `Item ${itemCode} not found on pod ${podId}`,
      status: itemResponse.status,
      body: itemResponse.body,
    }
  }

  try {
    const item = parseSingleItem(itemResponse.body)
    return { ok: true, item }
  } catch {
    return {
      ok: false,
      error: `Unable to parse item ${itemCode} for pod ${podId}`,
      status: itemResponse.status,
      body: itemResponse.body,
    }
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

  const loaded = await loadPodItem(podId, itemCode, environment)
  if (!loaded.ok) {
    return {
      ok: false,
      environment,
      error: loaded.error,
      status: loaded.status,
      body: loaded.body,
    }
  }

  const body = buildDispatchBody(loaded.item, {
    lang: 'en',
    channel: 'mobile',
    deliveryPort: 1,
    displayNote: input.displayNote || loaded.item.display,
  })

  const response = await executeCofeplusRequest({
    method: 'POST',
    path: `/partner/v1/dispatches/${encodeURIComponent(podId)}`,
    query: { mode: 'pickup' },
    body,
    environment,
  })

  if (!response.ok) {
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
    if (!dispatch.pickupCode || dispatch.pickupCode === '(none)') {
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

  if (!response.ok) {
    return {
      ok: false,
      error: `Failed to fetch dispatch (${response.status})`,
      status: response.status,
      body: response.body,
    }
  }

  try {
    return {
      ok: true,
      snapshot: parseDispatchSnapshot(response.body),
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
      return 'completed'
    case 'failed':
      return 'cancelled'
    case 'pending':
    default:
      return 'pending'
  }
}

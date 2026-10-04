import { NextRequest } from 'next/server'
import {
  authenticateRequest,
  createApiError,
  createApiResponse,
} from '@/lib/api/middleware'
import { createClient } from '@supabase/supabase-js'
import {
  fetchDispatchSnapshot,
  isLocalDispatchId,
} from '@/lib/cofeplus/dispatch'
import type { DispatchSnapshot } from '@/components/api-test/cofeplus-test-shared'
import { resolveCofeplusEnvironment } from '@/lib/cofeplus/proxy'
import {
  persistMappedDispatchStatus,
  refreshOrderQueueState,
  syntheticPodIdForKiosk,
  tryActivateNextQueuedOrder,
  type MachineOrderRow,
} from '@/lib/cofeplus/queue'

export const maxDuration = 25

const ORDER_DETAIL_SELECT = '*, kiosks(*), order_items(*, products(*))'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error('Missing Supabase credentials')
  }

  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Internal server error'
}

function kioskFromOrder(order: {
  kiosks?: { pod_id?: string | null; id?: string } | { pod_id?: string | null; id?: string }[] | null
  kiosk_id?: string
}) {
  const raw = order.kiosks
  return Array.isArray(raw) ? raw[0] : raw
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return createApiError('Unauthorized', 401)
    }

    const { id } = await context.params
    const adminClient = getAdminClient()

    const { data: order, error } = await adminClient
      .from('orders')
      .select(ORDER_DETAIL_SELECT)
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (error || !order) {
      return createApiError('Order not found', 404)
    }

    const environment = resolveCofeplusEnvironment(order.cofeplus_environment)
    const kiosk = kioskFromOrder(order)
    const kioskPod =
      typeof kiosk?.pod_id === 'string' ? kiosk.pod_id.trim() : ''
    const linkedPod =
      (typeof order.cofeplus_pod_id === 'string' && order.cofeplus_pod_id.trim()) ||
      kioskPod ||
      (environment === 'test' && order.kiosk_id
        ? syntheticPodIdForKiosk(order.kiosk_id)
        : '')

    let machineOrder = order as MachineOrderRow

    if (linkedPod && !order.cofeplus_pod_id) {
      const { data: linked } = await adminClient
        .from('orders')
        .update({
          cofeplus_pod_id: linkedPod,
          cofeplus_environment: environment,
        })
        .eq('id', order.id)
        .select(ORDER_DETAIL_SELECT)
        .single()

      if (linked) {
        machineOrder = linked as MachineOrderRow
      } else {
        machineOrder = {
          ...order,
          cofeplus_pod_id: linkedPod,
          cofeplus_environment: environment,
        } as MachineOrderRow
      }
    }

    if (!machineOrder.cofeplus_pod_id) {
      return createApiResponse({
        order,
        dispatch: null,
        queue: {
          position: null,
          aheadCount: 0,
          isYourTurn: false,
          totalWaiting: 0,
          estimatedWaitSeconds: 0,
          estimatedWaitLabel: '',
          secondsPerDrink: 0,
        },
        environment,
        message:
          'This kiosk is not linked to a CofePlus machine. Set the kiosk pod ID in admin.',
      })
    }

    const {
      order: refreshed,
      queue,
      activationError,
    } = await refreshOrderQueueState(adminClient, machineOrder)

    const { data: fullOrder } = await adminClient
      .from('orders')
      .select(ORDER_DETAIL_SELECT)
      .eq('id', refreshed.id)
      .single()

    let currentOrder = fullOrder || { ...order, ...refreshed }
    const currentEnvironment = resolveCofeplusEnvironment(
      currentOrder.cofeplus_environment
    )

    let dispatch: DispatchSnapshot | null = null
    const hasFreshPickup =
      Boolean(currentOrder.pickup_code) && currentOrder.status === 'pending'
    if (
      currentOrder.cofeplus_dispatch_id &&
      currentOrder.cofeplus_pod_id &&
      !isLocalDispatchId(currentOrder.cofeplus_dispatch_id) &&
      !hasFreshPickup
    ) {
      const snapshot = await fetchDispatchSnapshot(
        currentOrder.cofeplus_pod_id,
        currentOrder.cofeplus_dispatch_id,
        currentEnvironment,
        {
          // A brand-new pickup QR can 404 on GET-by-id. Do not treat that
          // as collected or the app hides the QR and shows a spinner.
          completeIfMissing: currentOrder.status !== 'pending',
        }
      )
      if (snapshot.ok) {
        dispatch = snapshot.snapshot
        if (
          (!dispatch.pickupCode || dispatch.pickupCode === '(none)') &&
          currentOrder.pickup_code
        ) {
          dispatch = {
            ...dispatch,
            pickupCode: currentOrder.pickup_code,
          }
        }

        const synced = await persistMappedDispatchStatus(
          adminClient,
          currentOrder as MachineOrderRow,
          dispatch
        )
        if (synced.status !== currentOrder.status) {
          const { data: written } = await adminClient
            .from('orders')
            .select(ORDER_DETAIL_SELECT)
            .eq('id', synced.id)
            .single()
          currentOrder = written || { ...currentOrder, ...synced }
          if (
            (synced.status === 'completed' || synced.status === 'cancelled') &&
            currentOrder.cofeplus_pod_id
          ) {
            await tryActivateNextQueuedOrder(
              adminClient,
              currentOrder.cofeplus_pod_id,
              currentEnvironment
            )
          }
        }
      }
    } else if (
      currentOrder.pickup_code &&
      currentOrder.cofeplus_dispatch_id
    ) {
      dispatch = {
        id: currentOrder.cofeplus_dispatch_id,
        state:
          currentOrder.status === 'brewing'
            ? 'making'
            : currentOrder.status === 'completed'
              ? 'done'
              : currentOrder.status === 'ready'
                ? 'ready'
                : 'pending',
        orderNumber: currentOrder.order_number || '',
        pickupCode: currentOrder.pickup_code,
        archived: false,
        itemCount: 1,
        lineItemCodes: [],
      }
    }

    return createApiResponse({
      order: currentOrder,
      dispatch,
      queue,
      environment: currentEnvironment,
      message: activationError,
    })
  } catch (error: unknown) {
    return createApiError(getErrorMessage(error), 500)
  }
}

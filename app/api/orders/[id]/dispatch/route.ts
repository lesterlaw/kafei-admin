import { NextRequest } from 'next/server'
import {
  authenticateRequest,
  createApiError,
  createApiResponse,
} from '@/lib/api/middleware'
import { createClient } from '@supabase/supabase-js'
import { fetchDispatchSnapshot } from '@/lib/cofeplus/dispatch'
import { resolveCofeplusEnvironment } from '@/lib/cofeplus/proxy'
import {
  refreshOrderQueueState,
  syntheticPodIdForKiosk,
  type MachineOrderRow,
} from '@/lib/cofeplus/queue'

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

    const currentOrder = fullOrder || { ...order, ...refreshed }
    const currentEnvironment = resolveCofeplusEnvironment(
      currentOrder.cofeplus_environment
    )

    let dispatch = null
    if (
      currentEnvironment === 'live' &&
      currentOrder.cofeplus_dispatch_id &&
      currentOrder.cofeplus_pod_id
    ) {
      const snapshot = await fetchDispatchSnapshot(
        currentOrder.cofeplus_pod_id,
        currentOrder.cofeplus_dispatch_id,
        currentEnvironment
      )
      if (snapshot.ok) {
        dispatch = snapshot.snapshot
      }
    } else if (
      currentEnvironment === 'test' &&
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

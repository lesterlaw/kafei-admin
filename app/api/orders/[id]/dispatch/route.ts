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
  type MachineOrderRow,
} from '@/lib/cofeplus/queue'

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
      .select('*, kiosks(*)')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (error || !order) {
      return createApiError('Order not found', 404)
    }

    if (!order.cofeplus_pod_id) {
      return createApiResponse({
        order,
        dispatch: null,
        queue: {
          position: null,
          aheadCount: 0,
          isYourTurn: false,
          totalWaiting: 0,
        },
        message: 'Order is not linked to a CofePlus machine',
      })
    }

    const { order: refreshed, queue } = await refreshOrderQueueState(
      adminClient,
      order as MachineOrderRow
    )

    // Re-fetch joined kiosk data after possible status/QR updates
    const { data: fullOrder } = await adminClient
      .from('orders')
      .select('*, kiosks(*)')
      .eq('id', refreshed.id)
      .single()

    const currentOrder = fullOrder || { ...order, ...refreshed }
    const environment = resolveCofeplusEnvironment(
      currentOrder.cofeplus_environment
    )

    let dispatch = null
    if (currentOrder.cofeplus_dispatch_id && currentOrder.cofeplus_pod_id) {
      const snapshot = await fetchDispatchSnapshot(
        currentOrder.cofeplus_pod_id,
        currentOrder.cofeplus_dispatch_id,
        environment
      )
      if (snapshot.ok) {
        dispatch = snapshot.snapshot
      }
    }

    return createApiResponse({
      order: currentOrder,
      dispatch,
      queue,
      environment,
    })
  } catch (error: unknown) {
    return createApiError(getErrorMessage(error), 500)
  }
}

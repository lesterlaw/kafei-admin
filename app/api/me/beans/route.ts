import { NextRequest } from 'next/server'
import {
  createApiResponse,
  createApiError,
  authenticateRequest,
} from '@/lib/api/middleware'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAvailableBeans, getBeanHistory } from '@/lib/product-logic'

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return createApiError('Unauthorized', 401)
    }

    const adminClient = createAdminClient()
    const [balance, history] = await Promise.all([
      getAvailableBeans(adminClient, user.id).catch(() => 0),
      getBeanHistory(adminClient, user.id).catch(() => []),
    ])

    return createApiResponse({
      balance,
      history,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return createApiError(message, 500)
  }
}

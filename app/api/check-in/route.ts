import { NextRequest } from 'next/server'
import {
  createApiResponse,
  createApiError,
  authenticateRequest,
} from '@/lib/api/middleware'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  performCheckIn,
  resolveMembership,
  canCheckInToday,
} from '@/lib/product-logic'

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return createApiError('Unauthorized', 401)
    }

    const body = await request.json().catch(() => ({}))
    const adToken =
      typeof body?.ad_token === 'string' ? body.ad_token : null

    const adminClient = createAdminClient()
    const result = await performCheckIn(adminClient, user.id, adToken)
    return createApiResponse(result)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    const status = message.includes('Already') || message.includes('ad')
      ? 400
      : 500
    return createApiError(message, status)
  }
}

/** Start check-in: ads module removed, always skip the ad gate. */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return createApiError('Unauthorized', 401)
    }

    const adminClient = createAdminClient()
    const { wallet } = await resolveMembership(adminClient, user.id)

    if (!canCheckInToday(wallet)) {
      return createApiError('Already checked in today', 400)
    }

    return createApiResponse({ requires_ad: false, token: null, house_ad: null })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return createApiError(message, 500)
  }
}

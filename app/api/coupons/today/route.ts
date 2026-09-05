import { NextRequest } from 'next/server'
import { createApiResponse, createApiError, authenticateRequest } from '@/lib/api/middleware'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOrCreateDailyCoupon, isSecondCupEligible } from '@/lib/product-logic'

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return createApiError('Unauthorized', 401)
    }

    const adminClient = createAdminClient()
    const coupon = await getOrCreateDailyCoupon(adminClient, user.id)
    const secondCupEligible = await isSecondCupEligible(adminClient, user.id)

    if (!coupon && !secondCupEligible) {
      return createApiError('No daily coupon available', 404)
    }

    return createApiResponse({
      coupon,
      second_cup_eligible: secondCupEligible,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return createApiError(message, 500)
  }
}

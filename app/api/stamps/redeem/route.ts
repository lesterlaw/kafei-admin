import { NextRequest } from 'next/server'
import {
  createApiResponse,
  createApiError,
  authenticateRequest,
} from '@/lib/api/middleware'
import { createAdminClient } from '@/lib/supabase/admin'
import { redeemStampsForCoupon } from '@/lib/product-logic'

/** Spend stamps for a Latte/Americano coupon that shows up under Promo Code at checkout. */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return createApiError('Unauthorized', 401)
    }

    const adminClient = createAdminClient()
    const result = await redeemStampsForCoupon(adminClient, user.id)

    return createApiResponse(result, 201)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return createApiError(message, 400)
  }
}

import { NextRequest } from 'next/server'
import {
  createApiResponse,
  createApiError,
  authenticateRequest,
} from '@/lib/api/middleware'
import { createAdminClient } from '@/lib/supabase/admin'
import { createRedemptionHold } from '@/lib/product-logic'

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return createApiError('Unauthorized', 401)
    }

    const body = await request.json()
    const type = body?.type
    if (
      ![
        'welcome',
        'stamp',
        'bean_drink',
        'bean_addon',
        'daily_coupon',
        'second_cup',
        'pass_coupon',
        'cash',
      ].includes(type)
    ) {
      return createApiError('Invalid redemption type', 400)
    }

    const adminClient = createAdminClient()
    const redemption = await createRedemptionHold(adminClient, {
      userId: user.id,
      type,
      productId: body?.product_id || null,
      addonId: body?.addon_id || null,
      adToken: body?.ad_token || null,
      orderId: body?.order_id || null,
    })

    return createApiResponse(redemption, 201)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return createApiError(message, 400)
  }
}

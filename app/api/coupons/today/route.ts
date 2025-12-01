import { NextRequest, NextResponse } from 'next/server'
import { createApiResponse, createApiError, authenticateRequest } from '@/lib/api/middleware'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return createApiError('Unauthorized', 401)
    }

    const supabase = await createServerSupabaseClient()
    
    // Get today's coupon
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const { data, error } = await supabase
      .from('coupons')
      .select('*')
      .eq('user_id', user.id)
      .gte('created_at', today.toISOString())
      .lt('created_at', tomorrow.toISOString())
      .eq('is_redeemed', false)
      .single()

    if (error || !data) {
      // Create new coupon for today
      const { data: subscription } = await supabase
        .from('user_subscriptions')
        .select('*, subscription_tiers(*)')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single()

      if (!subscription) {
        return createApiError('No active subscription found', 404)
      }

      const couponCode = `COUPON-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + 1)

      const { data: newCoupon, error: createError } = await supabase
        .from('coupons')
        .insert({
          user_id: user.id,
          code: couponCode,
          expires_at: expiresAt.toISOString(),
        })
        .select()
        .single()

      if (createError) {
        return createApiError(createError.message, 500)
      }

      return createApiResponse(newCoupon)
    }

    return createApiResponse(data)
  } catch (error: any) {
    return createApiError(error.message || 'Internal server error', 500)
  }
}





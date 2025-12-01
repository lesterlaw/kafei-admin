import { NextRequest, NextResponse } from 'next/server'
import { createApiResponse, createApiError } from '@/lib/api/middleware'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const { qr_data } = await request.json()

    if (!qr_data) {
      return createApiError('QR data is required', 400)
    }

    const qr = JSON.parse(qr_data)
    const supabase = await createServerSupabaseClient()

    // Verify coupon
    const { data: coupon, error } = await supabase
      .from('coupons')
      .select('*')
      .eq('id', qr.coupon_id)
      .eq('code', qr.code)
      .eq('is_redeemed', false)
      .single()

    if (error || !coupon) {
      return createApiError('Invalid or already redeemed coupon', 400)
    }

    // Check expiry
    if (new Date(coupon.expires_at) < new Date()) {
      return createApiError('Coupon has expired', 400)
    }

    // Mark as redeemed
    await supabase
      .from('coupons')
      .update({
        is_redeemed: true,
        redeemed_at: new Date().toISOString(),
      })
      .eq('id', coupon.id)

    return createApiResponse({ success: true, coupon })
  } catch (error: any) {
    return createApiError(error.message || 'Internal server error', 500)
  }
}





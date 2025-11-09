import { NextRequest, NextResponse } from 'next/server'
import { createApiResponse, createApiError, authenticateRequest } from '@/lib/api/middleware'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import QRCode from 'qrcode'

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return createApiError('Unauthorized', 401)
    }

    const { coupon_id } = await request.json()

    if (!coupon_id) {
      return createApiError('Coupon ID is required', 400)
    }

    const supabase = await createServerSupabaseClient()
    const { data: coupon, error } = await supabase
      .from('coupons')
      .select('*')
      .eq('id', coupon_id)
      .eq('user_id', user.id)
      .single()

    if (error || !coupon) {
      return createApiError('Coupon not found', 404)
    }

    // Generate QR code
    const qrData = JSON.stringify({
      coupon_id: coupon.id,
      code: coupon.code,
      user_id: user.id,
      timestamp: new Date().toISOString(),
    })

    const qrCode = await QRCode.toDataURL(qrData)

    // Update coupon with QR code
    await supabase
      .from('coupons')
      .update({ qr_code: qrCode })
      .eq('id', coupon_id)

    return createApiResponse({ qr_code: qrCode, coupon })
  } catch (error: any) {
    return createApiError(error.message || 'Internal server error', 500)
  }
}


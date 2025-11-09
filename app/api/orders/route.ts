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
    const { data, error } = await supabase
      .from('orders')
      .select('*, products(*), kiosks(*)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      return createApiError(error.message, 500)
    }

    return createApiResponse(data || [])
  } catch (error: any) {
    return createApiError(error.message || 'Internal server error', 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return createApiError('Unauthorized', 401)
    }

    const { kiosk_id, product_id, addons, coupon_id } = await request.json()

    if (!kiosk_id || !product_id) {
      return createApiError('Kiosk ID and Product ID are required', 400)
    }

    const supabase = await createServerSupabaseClient()

    // Get product price
    const { data: product } = await supabase
      .from('products')
      .select('price')
      .eq('id', product_id)
      .single()

    if (!product) {
      return createApiError('Product not found', 404)
    }

    // Calculate total
    let total = product.price

    // Generate order number
    const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`

    // Create order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        order_number: orderNumber,
        user_id: user.id,
        kiosk_id,
        coupon_id,
        total_amount: total,
        status: 'pending',
      })
      .select()
      .single()

    if (orderError) {
      return createApiError(orderError.message, 500)
    }

    return createApiResponse(order)
  } catch (error: any) {
    return createApiError(error.message || 'Internal server error', 500)
  }
}


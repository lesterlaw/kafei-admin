import { NextRequest } from 'next/server'
import { createApiResponse, createApiError, authenticateRequest } from '@/lib/api/middleware'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

const uuidSchema = z.string().uuid()

const createOrderSchema = z.object({
  kiosk_id: uuidSchema,
  product_id: uuidSchema,
  addons: z.array(uuidSchema).optional(),
  // Ignore legacy placeholder coupon ids from older mobile builds.
  coupon_id: z.preprocess((value) => {
    if (typeof value !== 'string' || value.trim() === '') {
      return undefined
    }

    return uuidSchema.safeParse(value).success ? value : undefined
  }, uuidSchema.optional()),
})

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Internal server error'
}

// Create admin client inline to ensure service role key is used
function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  if (!url || !serviceKey) {
    console.error('Missing Supabase credentials:', { url: !!url, serviceKey: !!serviceKey })
    throw new Error('Missing Supabase credentials')
  }
  
  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return createApiError('Unauthorized', 401)
    }

    const adminClient = getAdminClient()
    const { data, error } = await adminClient
      .from('orders')
      .select('*, order_items(*, products(*)), kiosks(*)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      return createApiError(error.message, 500)
    }

    return createApiResponse(data || [])
  } catch (error: unknown) {
    return createApiError(getErrorMessage(error), 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return createApiError('Unauthorized', 401)
    }

    console.log('Creating order for user:', user.id)

    const requestBody = await request.json()
    const validationResult = createOrderSchema.safeParse(requestBody)

    if (!validationResult.success) {
      return createApiError('Invalid order payload', 400)
    }

    const { kiosk_id, product_id, addons, coupon_id } = validationResult.data
    const adminClient = getAdminClient()

    // Verify user exists in users table
    const { data: userData, error: userError } = await adminClient
      .from('users')
      .select('id')
      .eq('id', user.id)
      .single()

    if (userError || !userData) {
      console.error('User not found in users table:', user.id, userError)
      return createApiError('User not found. Please complete your profile first.', 400)
    }

    // Get product price
    const { data: product, error: productError } = await adminClient
      .from('products')
      .select('price, name')
      .eq('id', product_id)
      .single()

    if (productError || !product) {
      console.error('Product not found:', product_id, productError)
      return createApiError('Product not found', 404)
    }

    // Verify kiosk exists
    const { data: kiosk, error: kioskError } = await adminClient
      .from('kiosks')
      .select('id')
      .eq('id', kiosk_id)
      .single()

    if (kioskError || !kiosk) {
      console.error('Kiosk not found:', kiosk_id, kioskError)
      return createApiError('Kiosk not found', 404)
    }

    let validatedCouponId: string | null = null

    if (coupon_id) {
      const { data: coupon, error: couponError } = await adminClient
        .from('coupons')
        .select('id, expires_at, is_redeemed')
        .eq('id', coupon_id)
        .eq('user_id', user.id)
        .single()

      if (couponError || !coupon) {
        console.error('Coupon not found for user:', coupon_id, couponError)
        return createApiError('Coupon not found', 404)
      }

      if (coupon.is_redeemed) {
        return createApiError('Coupon has already been redeemed', 400)
      }

      if (new Date(coupon.expires_at) < new Date()) {
        return createApiError('Coupon has expired', 400)
      }

      validatedCouponId = coupon.id
    }

    // Calculate total (add addon prices if provided)
    let total = Number(product.price)

    if (addons && addons.length > 0) {
      const { data: addonData } = await adminClient
        .from('add_ons')
        .select('price')
        .in('id', addons)

      if (addonData) {
        total += addonData.reduce((sum, addon) => sum + Number(addon.price), 0)
      }
    }

    // Generate order number
    const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`

    console.log('Inserting order:', { orderNumber, user_id: user.id, kiosk_id, total })

    // Create order
    const { data: order, error: orderError } = await adminClient
      .from('orders')
      .insert({
        order_number: orderNumber,
        user_id: user.id,
        kiosk_id,
        coupon_id: validatedCouponId,
        total_amount: total,
        status: 'pending',
      })
      .select()
      .single()

    if (orderError) {
      console.error('Order creation error:', orderError)
      return createApiError(orderError.message, 500)
    }

    console.log('Order created:', order.id)

    // Create order item
    const { error: itemError } = await adminClient
      .from('order_items')
      .insert({
        order_id: order.id,
        product_id,
        quantity: 1,
        price: product.price,
        addons: addons ? JSON.stringify(addons) : '[]',
      })

    if (itemError) {
      console.error('Order item creation error:', itemError)
    }

    return createApiResponse(order)
  } catch (error: unknown) {
    console.error('Order API error:', error)
    return createApiError(getErrorMessage(error), 500)
  }
}





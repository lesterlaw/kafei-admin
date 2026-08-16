import { NextRequest } from 'next/server'
import { createApiResponse, createApiError, authenticateRequest } from '@/lib/api/middleware'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { resolveCofeplusEnvironment } from '@/lib/cofeplus/proxy'
import {
  findBusyMachineOrder,
  getQueueSnapshot,
  syncBusyOrderAndAdvanceQueue,
  tryActivateNextQueuedOrder,
  syntheticPodIdForKiosk,
  type MachineOrderRow,
} from '@/lib/cofeplus/queue'

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
  cofeplus_environment: z.enum(['test', 'live']).optional(),
})

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Internal server error'
}

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

    const { kiosk_id, product_id, addons, coupon_id, cofeplus_environment } =
      validationResult.data
    const environment = resolveCofeplusEnvironment(cofeplus_environment)
    const adminClient = getAdminClient()

    const { data: userData, error: userError } = await adminClient
      .from('users')
      .select('id')
      .eq('id', user.id)
      .single()

    if (userError || !userData) {
      console.error('User not found in users table:', user.id, userError)
      return createApiError('User not found. Please complete your profile first.', 400)
    }

    const { data: product, error: productError } = await adminClient
      .from('products')
      .select('price, name, cofeplus_item_code')
      .eq('id', product_id)
      .single()

    if (productError || !product) {
      console.error('Product not found:', product_id, productError)
      return createApiError('Product not found', 404)
    }

    const { data: kiosk, error: kioskError } = await adminClient
      .from('kiosks')
      .select('id, pod_id, name, address')
      .eq('id', kiosk_id)
      .single()

    if (kioskError || !kiosk) {
      console.error('Kiosk not found:', kiosk_id, kioskError)
      return createApiError('Kiosk not found', 404)
    }

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

    let validatedCouponId: string | null = null

    if (coupon_id) {
      const { data: coupon } = await adminClient
        .from('coupons')
        .select('id, expires_at, is_redeemed')
        .eq('id', coupon_id)
        .eq('user_id', user.id)
        .maybeSingle()

      if (coupon) {
        if (coupon.is_redeemed) {
          return createApiError('Coupon has already been redeemed', 400)
        }

        if (new Date(coupon.expires_at) < new Date()) {
          return createApiError('Coupon has expired', 400)
        }

        validatedCouponId = coupon.id
      } else {
        const { data: promo } = await adminClient
          .from('promo_codes')
          .select('*')
          .eq('id', coupon_id)
          .maybeSingle()

        if (!promo || promo.is_active === false) {
          console.error('Coupon/promo not found for user:', coupon_id)
          return createApiError('Coupon not found', 404)
        }

        const now = Date.now()
        if (promo.starts_at && new Date(promo.starts_at).getTime() > now) {
          return createApiError('Promo code is not active yet', 400)
        }
        if (promo.ends_at && new Date(promo.ends_at).getTime() < now) {
          return createApiError('Promo code has expired', 400)
        }

        if (!promo.applies_to_all_users && !promo.is_system) {
          const { data: assignment } = await adminClient
            .from('promo_code_users')
            .select('promo_code_id')
            .eq('promo_code_id', promo.id)
            .eq('user_id', user.id)
            .maybeSingle()

          if (!assignment) {
            return createApiError('Coupon not found', 404)
          }
        }

        if (promo.min_amount && total < Number(promo.min_amount)) {
          return createApiError('Order does not meet the promo minimum', 400)
        }

        let discount = 0
        if (promo.type === 'fixed') {
          discount = Number(promo.discount_value) || 0
        } else if (promo.type === 'percent') {
          discount =
            Math.round(total * (Number(promo.discount_value) / 100) * 100) / 100
          if (promo.max_discount_amount != null) {
            discount = Math.min(discount, Number(promo.max_discount_amount))
          }
        } else if (promo.type === 'referral') {
          discount = total * (Number(promo.discount_value) || 1)
        }

        total = Math.max(0, Math.round((total - discount) * 100) / 100)
        validatedCouponId = promo.id
      }
    }

    const kioskPod =
      typeof kiosk.pod_id === 'string' ? kiosk.pod_id.trim() : ''
    const itemCode =
      typeof product.cofeplus_item_code === 'string'
        ? product.cofeplus_item_code.trim()
        : ''

    let cofeplusPodId: string | null = null
    let cofeplusEnv: 'test' | 'live' | null = null
    // Machine orders always join the queue first; QR unlocks only on activation
    let orderStatus: 'queued' | 'pending' = 'pending'
    let queueMeta: Awaited<ReturnType<typeof getQueueSnapshot>> | null = null

    const podId =
      kioskPod ||
      (environment === 'test' ? syntheticPodIdForKiosk(kiosk.id) : '')

    if (podId) {
      if (!itemCode && environment === 'live') {
        return createApiError(
          'This kiosk is linked to a machine, but the product has no CofePlus item code. Set cofeplus_item_code on the product in admin.',
          400
        )
      }

      cofeplusPodId = podId
      cofeplusEnv = environment
      orderStatus = 'queued'

      // Finish / advance whoever currently holds the machine before we join
      const existingBusy = await findBusyMachineOrder(
        adminClient,
        podId,
        environment
      )
      if (existingBusy) {
        await syncBusyOrderAndAdvanceQueue(adminClient, existingBusy)
      }

      console.log(
        `[orders] queueing machine order pod=${podId} item=${itemCode} env=${environment}`
      )
    }

    const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`

    console.log('Inserting order:', {
      orderNumber,
      user_id: user.id,
      kiosk_id,
      total,
      orderStatus,
    })

    const { data: order, error: orderError } = await adminClient
      .from('orders')
      .insert({
        order_number: orderNumber,
        user_id: user.id,
        kiosk_id,
        coupon_id: validatedCouponId,
        total_amount: total,
        status: orderStatus,
        pickup_code: null,
        cofeplus_dispatch_id: null,
        cofeplus_pod_id: cofeplusPodId,
        cofeplus_environment: cofeplusEnv,
      })
      .select('*, kiosks(*)')
      .single()

    if (orderError) {
      console.error('Order creation error:', orderError)
      return createApiError(orderError.message, 500)
    }

    console.log('Order created:', order.id)

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
      await adminClient.from('orders').delete().eq('id', order.id)
      return createApiError('Failed to save order items', 500)
    }

    let finalOrder = order

    if (cofeplusPodId) {
      // Activate next (may be this order) once line items exist for item code lookup
      await tryActivateNextQueuedOrder(adminClient, cofeplusPodId, environment)

      const { data: refreshed } = await adminClient
        .from('orders')
        .select('*, kiosks(*), order_items(*, products(*))')
        .eq('id', order.id)
        .single()

      if (refreshed) {
        finalOrder = refreshed
      }

      queueMeta = await getQueueSnapshot(
        adminClient,
        finalOrder as MachineOrderRow
      )
    }

    return createApiResponse({
      ...finalOrder,
      queue: queueMeta,
    })
  } catch (error: unknown) {
    console.error('Order API error:', error)
    return createApiError(getErrorMessage(error), 500)
  }
}

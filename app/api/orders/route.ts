import { NextRequest, after } from 'next/server'
import { createApiResponse, createApiError, authenticateRequest } from '@/lib/api/middleware'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { resolveCofeplusEnvironment } from '@/lib/cofeplus/proxy'
import { matchMenuItem } from '@/lib/cofeplus/product-map'
import { getActiveCofeplusEnvironment } from '@/lib/cofeplus/settings'
import {
  getQueueSnapshot,
  tryActivateNextQueuedOrder,
  syntheticPodIdForKiosk,
  type MachineOrderRow,
} from '@/lib/cofeplus/queue'
import {
  isSecondCupEligible,
  attachOrderToRedemption,
  isLatteOrAmericano,
  takeUnusedAddonCoupon,
  WELCOME_PROMO_CODE,
  hasUsedWelcomeDrink,
  hasUsedPassDrinkToday,
  isCouponReservedOnOpenOrder,
  isStampCoupon,
} from '@/lib/product-logic'
import {
  drinkSupportsLatteArt,
  ensureCatalogLatteArtLocator,
  isHostedLatteArtLocator,
  pickCatalogPreset,
} from '@/lib/cofeplus/latte-art'
import {
  handArtLocator,
  isPlainHotLatte,
  type HandLatteArtDesign,
  type LatteArtFlag,
} from '@/lib/cofeplus/latte-art-contract'

export const maxDuration = 25

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
  redemption_id: z.preprocess((value) => {
    if (typeof value !== 'string' || value.trim() === '') {
      return undefined
    }
    return uuidSchema.safeParse(value).success ? value : undefined
  }, uuidSchema.optional()),
  entitlement: z
    .enum(['daily_coupon', 'second_cup', 'welcome', 'stamp', 'bean_drink', 'cash'])
    .optional(),
  cofeplus_environment: z.enum(['test', 'live']).optional(),
  latte_art: z
    .object({
      flag: z.enum(['none', 'catalog', 'upload', 'heart', 'leaf']),
      locator: z.string().trim().optional(),
    })
    .optional(),
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

    const {
      kiosk_id,
      product_id,
      addons,
      coupon_id,
      redemption_id,
      entitlement,
      latte_art: latteArtInput,
    } = validationResult.data
    const adminClient = getAdminClient()
    const environment = resolveCofeplusEnvironment(
      await getActiveCofeplusEnvironment(adminClient)
    )

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
      .select('price, name, temperature, cofeplus_item_code, is_hidden')
      .eq('id', product_id)
      .single()

    if (productError || !product) {
      console.error('Product not found:', product_id, productError)
      return createApiError('Product not found', 404)
    }

    // Same rule as the menu list: hidden drinks cannot be ordered, even from a stale screen.
    if (product.is_hidden) {
      return createApiError('This drink is not available right now', 400)
    }

    const { data: kiosk, error: kioskError } = await adminClient
      .from('kiosks')
      .select('id, pod_id, name, address, is_active')
      .eq('id', kiosk_id)
      .single()

    if (kioskError || !kiosk) {
      console.error('Kiosk not found:', kiosk_id, kioskError)
      return createApiError('Kiosk not found', 404)
    }

    if (!kiosk.is_active) {
      return createApiError('This kiosk is not taking orders right now', 400)
    }

    let latteArtFlag: LatteArtFlag | null = null
    let latteArtLocator: string | null = null
    if (latteArtInput && latteArtInput.flag !== 'none') {
      if (!drinkSupportsLatteArt(product.name, product.temperature)) {
        return createApiError(
          'Latte art is only available on hot milk drinks like latte and cappuccino.',
          400
        )
      }

      const requestedDesign: HandLatteArtDesign | 'random' | null =
        latteArtInput.flag === 'heart' || latteArtInput.flag === 'leaf'
          ? latteArtInput.flag
          : latteArtInput.flag === 'catalog' &&
              isPlainHotLatte(product.name, product.temperature)
            ? 'random'
            : null

      if (requestedDesign) {
        if (!isPlainHotLatte(product.name, product.temperature)) {
          return createApiError(
            'Heart and leaf art are only available on a hot latte.',
            400
          )
        }
        const design: HandLatteArtDesign =
          requestedDesign === 'random' ? pickCatalogPreset() : requestedDesign
        latteArtFlag = 'catalog'
        latteArtLocator = handArtLocator(design)
      } else if (latteArtInput.flag === 'upload') {
        latteArtFlag = 'upload'
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
        const locator = latteArtInput.locator || ''
        if (!isHostedLatteArtLocator(locator, supabaseUrl)) {
          return createApiError('Upload a latte art photo first.', 400)
        }
        latteArtLocator = locator.split('?')[0]
      } else {
        latteArtFlag = 'catalog'
        try {
          latteArtLocator = await ensureCatalogLatteArtLocator(
            adminClient,
            pickCatalogPreset()
          )
        } catch (err) {
          console.error('[orders] catalog latte art failed', err)
          return createApiError('Could not prepare latte art. Try again.', 500)
        }
      }
    }

    const drinkPrice = Number(product.price)
    let addonTotal = 0
    let entitlementType: string | null = entitlement || null

    if (addons && addons.length > 0) {
      const { data: addonData } = await adminClient
        .from('add_ons')
        .select('id, price')
        .in('id', addons)
        .eq('is_hidden', false)

      // Every requested add-on must exist and be visible, otherwise it would be dropped from the price silently.
      const found = new Set((addonData || []).map((addon) => addon.id))
      if (addons.some((id) => !found.has(id))) {
        return createApiError('One of the selected add-ons is not available right now', 400)
      }

      addonTotal = (addonData || []).reduce((sum, addon) => sum + Number(addon.price), 0)
    }

    let total = drinkPrice + addonTotal

    // Free reward / bean redemptions: zero the drink, keep add-on cash unless covered
    if (redemption_id) {
      const { data: redemption } = await adminClient
        .from('redemptions')
        .select('*')
        .eq('id', redemption_id)
        .eq('user_id', user.id)
        .in('status', ['held', 'queued'])
        .maybeSingle()

      if (!redemption) {
        return createApiError('Redemption hold not found', 400)
      }

      if (
        ['welcome', 'stamp', 'bean_drink', 'daily_coupon', 'pass_coupon'].includes(
          redemption.type
        )
      ) {
        total = addonTotal
        entitlementType = redemption.type
        if (redemption.type === 'welcome') {
          if (!isLatteOrAmericano(product.name || '')) {
            return createApiError('Welcome drink must be Latte or Americano', 400)
          }
        }
      } else if (redemption.type === 'bean_addon') {
        entitlementType = 'bean_addon'
        total = drinkPrice
      } else if (redemption.type === 'second_cup') {
        total = Math.round(drinkPrice * 50) / 100 + addonTotal
        entitlementType = 'second_cup'
      }
    } else if (entitlement === 'second_cup') {
      const secondCup = await isSecondCupEligible(adminClient, user.id)
      if (!secondCup) {
        return createApiError('Second cup 50% off is not available right now', 400)
      }
      total = Math.round(drinkPrice * 50) / 100 + addonTotal
      entitlementType = 'second_cup'
    }

    let validatedCouponId: string | null = null
    let appliedAddonCouponId: string | null = null
    let dailyDrinkCouponId: string | null = null
    let stampCouponId: string | null = null

    if (coupon_id) {
      const { data: coupon } = await adminClient
        .from('coupons')
        .select('id, code, expires_at, is_redeemed, kind')
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

        const kind = String(coupon.kind || '')
        if (isStampCoupon(coupon)) {
          if (!isLatteOrAmericano(product.name || '')) {
            return createApiError('Stamp reward is for Latte or Americano only', 400)
          }
          total = Math.max(0, Math.round((total - drinkPrice) * 100) / 100)
          validatedCouponId = coupon.id
          stampCouponId = coupon.id
          entitlementType = 'stamp'
        } else if (kind === 'referral_addon') {
          total = Math.max(0, Math.round((total - addonTotal) * 100) / 100)
          appliedAddonCouponId = coupon.id
        } else if (kind === 'welcome' || kind === 'referral_drink' || kind === 'pass' || kind === 'daily_24h') {
          if (kind === 'welcome' && (await hasUsedWelcomeDrink(adminClient, user.id))) {
            return createApiError('Welcome drink already used', 400)
          }
          if (
            (kind === 'pass' || kind === 'daily_24h') &&
            (await isCouponReservedOnOpenOrder(adminClient, coupon.id, user.id))
          ) {
            return createApiError('This drink coupon is already on another order', 400)
          }
          if (
            (kind === 'pass' || kind === 'daily_24h') &&
            (await hasUsedPassDrinkToday(adminClient, user.id, coupon.id))
          ) {
            return createApiError('7-Day Pass drink coupon can only be used once per day', 400)
          }
          if (kind === 'welcome' || kind === 'referral_drink' || kind === 'pass') {
            if (!isLatteOrAmericano(product.name || '')) {
              return createApiError('This coupon is for Latte or Americano only', 400)
            }
          }
          total = Math.max(0, Math.round((total - drinkPrice) * 100) / 100)
          validatedCouponId = coupon.id
          if (kind === 'pass' || kind === 'daily_24h') {
            dailyDrinkCouponId = coupon.id
            entitlementType = entitlementType || (kind === 'pass' ? 'pass' : 'daily_coupon')
          } else {
            entitlementType = entitlementType || kind
          }
        } else {
          total = Math.max(0, Math.round((total - drinkPrice) * 100) / 100)
          validatedCouponId = coupon.id
          entitlementType = entitlementType || 'daily_coupon'
        }
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

        if (promo.type === 'referral' || promo.code === 'REF3FREE') {
          return createApiError('This promo code is no longer available', 400)
        }

        const now = Date.now()
        if (promo.starts_at && new Date(promo.starts_at).getTime() > now) {
          return createApiError('Promo code is not active yet', 400)
        }
        if (promo.ends_at && new Date(promo.ends_at).getTime() < now) {
          return createApiError('Promo code has expired', 400)
        }

        if (!promo.applies_to_all_users) {
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

        const isWelcomePromo =
          promo.code === WELCOME_PROMO_CODE ||
          String(promo.name || '')
            .toLowerCase()
            .includes('welcome drink')

        if (isWelcomePromo) {
          if (!isLatteOrAmericano(product.name || '')) {
            return createApiError('Welcome drink must be Latte or Americano', 400)
          }
          if (await hasUsedWelcomeDrink(adminClient, user.id)) {
            return createApiError('Welcome drink already used', 400)
          }
        }

        if (promo.min_amount && total < Number(promo.min_amount)) {
          return createApiError('Order does not meet the promo minimum', 400)
        }

        let discount = 0
        if (promo.type === 'fixed') {
          discount = Number(promo.discount_value) || 0
        } else if (promo.type === 'percent') {
          const base = isWelcomePromo ? drinkPrice : total
          discount =
            Math.round(base * (Number(promo.discount_value) / 100) * 100) / 100
          if (promo.max_discount_amount != null) {
            discount = Math.min(discount, Number(promo.max_discount_amount))
          }
        } else if (promo.type === 'nth_cup') {
          discount =
            Math.round(total * (Number(promo.discount_value) / 100) * 100) / 100
        }

        total = Math.max(0, Math.round((total - discount) * 100) / 100)
        validatedCouponId = promo.id
        if (isWelcomePromo) {
          // Always label welcome orders 'welcome' (never trust the client's label), so the
          // wallet flag below is cleared and reports count them correctly.
          entitlementType = 'welcome'
        }
      }
    }

    if (addonTotal > 0 && addons && addons.length > 0 && !appliedAddonCouponId) {
      const addonCoupon = await takeUnusedAddonCoupon(adminClient, user.id)
      if (addonCoupon) {
        total = Math.max(0, Math.round((total - addonTotal) * 100) / 100)
        appliedAddonCouponId = addonCoupon.id
      }
    }

    const kioskPod =
      typeof kiosk.pod_id === 'string' ? kiosk.pod_id.trim() : ''
    let itemCode =
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

    if (podId && !itemCode && product.name) {
      let menuQuery = adminClient
        .from('cofeplus_menu_items')
        .select('item_code, display')
        .eq('environment', environment)
      if (kioskPod) {
        menuQuery = menuQuery.eq('pod_id', kioskPod)
      }
      const { data: menuItems } = await menuQuery
      const match = matchMenuItem(
        product.name,
        (menuItems || []).map((row) => ({
          itemCode: row.item_code,
          display: row.display,
        }))
      )
      if (match) {
        itemCode = match.itemCode
        await adminClient
          .from('products')
          .update({ cofeplus_item_code: match.itemCode })
          .eq('id', product_id)
      }
    }

    if (podId) {
      if (!itemCode && environment === 'live') {
        return createApiError(
          'This drink is not on the machine menu for this kiosk. Map it in admin or pick another drink.',
          400
        )
      }

      cofeplusPodId = podId
      cofeplusEnv = environment
      orderStatus = 'queued'

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
        redemption_id: redemption_id || null,
        entitlement_type: entitlementType,
      })
      .select('*, kiosks(*)')
      .single()

    if (orderError) {
      console.error('Order creation error:', orderError)
      return createApiError(orderError.message, 500)
    }

    console.log('Order created:', order.id)

    if (redemption_id) {
      try {
        await attachOrderToRedemption(adminClient, redemption_id, order.id)
      } catch (err) {
        console.error('Failed to attach redemption', err)
      }
    }

    const { error: itemError } = await adminClient
      .from('order_items')
      .insert({
        order_id: order.id,
        product_id,
        quantity: 1,
        price: product.price,
        addons: addons ?? [],
        latte_art_flag: latteArtFlag,
        latte_art_locator: latteArtLocator,
      })

    if (itemError) {
      console.error('Order item creation error:', itemError)
      await adminClient.from('orders').delete().eq('id', order.id)
      return createApiError('Failed to save order items', 500)
    }

    if (entitlementType === 'welcome') {
      await adminClient
        .from('user_wallets')
        .update({
          welcome_drink_available: false,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
    }

    if (appliedAddonCouponId) {
      await adminClient
        .from('coupons')
        .update({
          is_redeemed: true,
          redeemed_at: new Date().toISOString(),
          order_id: order.id,
        })
        .eq('id', appliedAddonCouponId)
        .eq('is_redeemed', false)
    }

    const spentCouponId = dailyDrinkCouponId || stampCouponId
    if (spentCouponId) {
      await adminClient
        .from('coupons')
        .update({
          is_redeemed: true,
          redeemed_at: new Date().toISOString(),
          order_id: order.id,
        })
        .eq('id', spentCouponId)
        .eq('is_redeemed', false)
    }

    try {
      const { activateReferralOnFirstDrink } = await import(
        '@/lib/product-logic/referrals'
      )
      await activateReferralOnFirstDrink(adminClient, user.id)
    } catch (referralError) {
      console.error('[orders] referral activation failed', referralError)
    }

    let finalOrder = order

    if (cofeplusPodId) {
      const { data: withItems } = await adminClient
        .from('orders')
        .select('*, kiosks(*), order_items(*, products(*))')
        .eq('id', order.id)
        .single()

      if (withItems) {
        finalOrder = withItems
      }

      queueMeta = await getQueueSnapshot(
        adminClient,
        finalOrder as MachineOrderRow
      )

      // Checkout must return immediately after payment. Continue activation
      // after the response so Vercel does not freeze a claimed-but-empty QR.
      after(() =>
        tryActivateNextQueuedOrder(adminClient, cofeplusPodId, environment).catch(
          (error) => {
            console.error('[orders] background activate failed', error)
          }
        )
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

import type { SupabaseClient } from '@supabase/supabase-js'
import { getProductLogicSettings } from '@/lib/product-logic/settings'
import {
  deductBeans,
  getAvailableBeans,
  resolveMembership,
} from '@/lib/product-logic/wallet'

export type RedemptionType =
  | 'welcome'
  | 'stamp'
  | 'bean_drink'
  | 'bean_addon'
  | 'daily_coupon'
  | 'second_cup'
  | 'pass_coupon'
  | 'cash'

export interface CreateRedemptionInput {
  userId: string
  type: RedemptionType
  productId?: string | null
  addonId?: string | null
  adToken?: string | null
  orderId?: string | null
}

function drinkBeanCost(
  productName: string,
  settings: Awaited<ReturnType<typeof getProductLogicSettings>>
): number | null {
  const n = productName.toLowerCase()
  if (n.includes('americano')) return settings.bean_americano
  if (n.includes('latte')) return settings.bean_latte
  return null
}

export async function createRedemptionHold(
  adminClient: SupabaseClient,
  input: CreateRedemptionInput
) {
  const { membership, wallet } = await resolveMembership(
    adminClient,
    input.userId
  )
  const settings = await getProductLogicSettings(adminClient)

  let stampsReserved = 0
  let beansReserved = 0
  let productId = input.productId || null
  let addonId = input.addonId || null

  switch (input.type) {
    case 'welcome': {
      if (!wallet.welcome_drink_available) {
        throw new Error('Welcome drink already used')
      }
      if (!productId) {
        throw new Error('Select Latte or Americano for welcome drink')
      }
      const { data: product } = await adminClient
        .from('products')
        .select('id, name')
        .eq('id', productId)
        .single()
      if (!product) throw new Error('Product not found')
      const name = product.name.toLowerCase()
      if (!name.includes('latte') && !name.includes('americano')) {
        throw new Error('Welcome drink must be Latte or Americano')
      }
      break
    }
    case 'stamp': {
      if (!membership.collectsStamps) {
        throw new Error('Stamps are for Free plan only')
      }
      if (wallet.stamp_count < settings.stamp_cost) {
        throw new Error(`Need ${settings.stamp_cost} stamps to redeem`)
      }
      if (!productId) {
        throw new Error('Select Latte or Americano for stamp reward')
      }
      const { data: product } = await adminClient
        .from('products')
        .select('id, name')
        .eq('id', productId)
        .single()
      if (!product) throw new Error('Product not found')
      const name = product.name.toLowerCase()
      if (!name.includes('latte') && !name.includes('americano')) {
        throw new Error('Stamp drink must be Latte or Americano')
      }
      stampsReserved = settings.stamp_cost
      break
    }
    case 'bean_drink': {
      if (!productId) throw new Error('Product required')
      const { data: product } = await adminClient
        .from('products')
        .select('id, name')
        .eq('id', productId)
        .single()
      if (!product) throw new Error('Product not found')
      const cost = drinkBeanCost(product.name, settings)
      if (cost == null) {
        throw new Error('Bean drinks are Americano or Latte only')
      }
      if (!membership.fullBeanCatalogue) {
        // Free: Americano/Latte still allowed (basic catalogue)
      }
      const available = await getAvailableBeans(adminClient, input.userId)
      if (available < cost) {
        throw new Error('Not enough Beans')
      }
      beansReserved = cost
      break
    }
    case 'bean_addon': {
      if (!membership.fullBeanCatalogue) {
        throw new Error('Bean add-ons require Paid membership or KAFEI Pass')
      }
      if (!addonId) throw new Error('Add-on required')
      const { data: addon } = await adminClient
        .from('add_ons')
        .select('*')
        .eq('id', addonId)
        .eq('is_hidden', false)
        .single()
      if (!addon) throw new Error('Add-on not found')
      if (Number(addon.price) !== Number(settings.addon_cash_price)) {
        throw new Error(
          `Bean add-on reward is for $${settings.addon_cash_price} add-ons only`
        )
      }
      const available = await getAvailableBeans(adminClient, input.userId)
      if (available < settings.bean_addon) {
        throw new Error('Not enough Beans')
      }
      beansReserved = settings.bean_addon
      break
    }
    case 'daily_coupon':
    case 'pass_coupon':
    case 'second_cup':
    case 'cash':
      break
    default:
      throw new Error('Unknown redemption type')
  }

  const { data: redemption, error } = await adminClient
    .from('redemptions')
    .insert({
      user_id: input.userId,
      order_id: input.orderId || null,
      type: input.type,
      status: 'held',
      product_id: productId,
      addon_id: addonId,
      stamps_reserved: stampsReserved,
      beans_reserved: beansReserved,
    })
    .select('*')
    .single()

  if (error || !redemption) {
    throw new Error(error?.message || 'Failed to create redemption hold')
  }

  return redemption
}

export async function attachOrderToRedemption(
  adminClient: SupabaseClient,
  redemptionId: string,
  orderId: string
) {
  await adminClient
    .from('redemptions')
    .update({
      order_id: orderId,
      status: 'queued',
      updated_at: new Date().toISOString(),
    })
    .eq('id', redemptionId)

  await adminClient
    .from('orders')
    .update({ redemption_id: redemptionId })
    .eq('id', orderId)
}

export async function commitRedemption(
  adminClient: SupabaseClient,
  orderId: string
) {
  const { data: redemption } = await adminClient
    .from('redemptions')
    .select('*')
    .eq('order_id', orderId)
    .in('status', ['held', 'queued'])
    .maybeSingle()

  if (!redemption) {
    // Also try via orders.redemption_id
    const { data: order } = await adminClient
      .from('orders')
      .select('redemption_id, coupon_id, user_id')
      .eq('id', orderId)
      .maybeSingle()

    if (order?.coupon_id) {
      await adminClient
        .from('coupons')
        .update({
          is_redeemed: true,
          redeemed_at: new Date().toISOString(),
          order_id: orderId,
        })
        .eq('id', order.coupon_id)
        .eq('is_redeemed', false)
    }
    return null
  }

  const userId = redemption.user_id as string

  if (redemption.stamps_reserved > 0) {
    const { data: wallet } = await adminClient
      .from('user_wallets')
      .select('stamp_count')
      .eq('user_id', userId)
      .single()

    const next = Math.max(
      0,
      Number(wallet?.stamp_count || 0) - Number(redemption.stamps_reserved)
    )
    await adminClient
      .from('user_wallets')
      .update({ stamp_count: next, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
  }

  if (redemption.beans_reserved > 0) {
    const ok = await deductBeans(
      adminClient,
      userId,
      Number(redemption.beans_reserved)
    )
    if (!ok) {
      console.error(
        `[redemption] bean deduct failed for order=${orderId} amount=${redemption.beans_reserved}`
      )
    }
  }

  if (redemption.type === 'welcome') {
    await adminClient
      .from('user_wallets')
      .update({
        welcome_drink_available: false,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
  }

  if (redemption.coupon_id) {
    await adminClient
      .from('coupons')
      .update({
        is_redeemed: true,
        redeemed_at: new Date().toISOString(),
        order_id: orderId,
      })
      .eq('id', redemption.coupon_id)
      .eq('is_redeemed', false)
  } else {
    const { data: order } = await adminClient
      .from('orders')
      .select('coupon_id')
      .eq('id', orderId)
      .maybeSingle()
    if (order?.coupon_id) {
      await adminClient
        .from('coupons')
        .update({
          is_redeemed: true,
          redeemed_at: new Date().toISOString(),
          order_id: orderId,
        })
        .eq('id', order.coupon_id)
        .eq('is_redeemed', false)
    }
  }

  await adminClient
    .from('redemptions')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', redemption.id)

  if (redemption.user_id) {
    try {
      const { activateReferralOnFirstDrink } = await import(
        '@/lib/product-logic/referrals'
      )
      await activateReferralOnFirstDrink(adminClient, redemption.user_id)
    } catch (error) {
      console.error('[redemption] referral activation failed', error)
    }
  }

  return redemption
}

export async function releaseRedemption(
  adminClient: SupabaseClient,
  orderId: string
) {
  const { data: redemption } = await adminClient
    .from('redemptions')
    .select('*')
    .eq('order_id', orderId)
    .in('status', ['held', 'queued'])
    .maybeSingle()

  if (!redemption) return null

  await adminClient
    .from('redemptions')
    .update({
      status: 'released',
      released_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', redemption.id)

  return redemption
}

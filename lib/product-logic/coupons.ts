import type { SupabaseClient } from '@supabase/supabase-js'
import {
  addDaysIso,
  singaporeDateString,
  singaporeDayBounds,
} from '@/lib/product-logic/settings'
import { resolveMembership } from '@/lib/product-logic/wallet'

export function isLatteOrAmericano(productName: string): boolean {
  const name = productName.toLowerCase()
  return name.includes('latte') || name.includes('americano')
}

function couponCode(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`
}

export async function grantReferralRewardCoupons(
  adminClient: SupabaseClient,
  userId: string,
  drinkCount: number,
  addonCount: number,
  expiryDays: number
) {
  const expiresAt = addDaysIso(expiryDays)
  const grantedAt = new Date().toISOString()
  const rows: Array<{
    user_id: string
    code: string
    expires_at: string
    kind: string
    granted_at: string
  }> = []

  for (let i = 0; i < drinkCount; i += 1) {
    rows.push({
      user_id: userId,
      code: couponCode('RD'),
      expires_at: expiresAt,
      kind: 'referral_drink',
      granted_at: grantedAt,
    })
  }
  for (let i = 0; i < addonCount; i += 1) {
    rows.push({
      user_id: userId,
      code: couponCode('RA'),
      expires_at: expiresAt,
      kind: 'referral_addon',
      granted_at: grantedAt,
    })
  }

  if (rows.length === 0) return

  const { error } = await adminClient.from('coupons').insert(rows)
  if (!error) return

  const fallback = rows.map((row) => ({ ...row, kind: 'other' }))
  const retry = await adminClient.from('coupons').insert(fallback)
  if (retry.error) {
    throw new Error(retry.error.message)
  }
}

export async function getUnusedRewardCoupons(
  adminClient: SupabaseClient,
  userId: string
) {
  const now = new Date().toISOString()
  const { data } = await adminClient
    .from('coupons')
    .select('id, code, kind, expires_at, is_redeemed')
    .eq('user_id', userId)
    .eq('is_redeemed', false)
    .gt('expires_at', now)
    .in('kind', ['welcome', 'referral_drink', 'referral_addon', 'other'])
    .order('granted_at', { ascending: true })

  return (data || []).filter((coupon) => {
    const kind = String(coupon.kind || '')
    if (kind === 'welcome' || kind === 'referral_drink' || kind === 'referral_addon') {
      return true
    }
    const code = String(coupon.code || '')
    return code.startsWith('RD-') || code.startsWith('RA-')
  })
}

export async function takeUnusedAddonCoupon(
  adminClient: SupabaseClient,
  userId: string
) {
  const now = new Date().toISOString()
  const { data } = await adminClient
    .from('coupons')
    .select('id, kind')
    .eq('user_id', userId)
    .eq('is_redeemed', false)
    .gt('expires_at', now)
    .in('kind', ['referral_addon'])
    .order('granted_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  return data
}

const DAILY_DRINK_KINDS = ['daily_24h', 'pass'] as const

/** One pass/daily drink coupon per Singapore calendar day. Coupons do not stack. */
export async function hasUsedPassDrinkToday(
  adminClient: SupabaseClient,
  userId: string,
  exceptCouponId?: string
): Promise<boolean> {
  const { start, end } = singaporeDayBounds()

  const redeemedQuery = adminClient
    .from('coupons')
    .select('id')
    .eq('user_id', userId)
    .in('kind', [...DAILY_DRINK_KINDS])
    .eq('is_redeemed', true)
    .gte('redeemed_at', start.toISOString())
    .lte('redeemed_at', end.toISOString())
    .limit(1)

  const { data: redeemed } = exceptCouponId
    ? await redeemedQuery.neq('id', exceptCouponId).maybeSingle()
    : await redeemedQuery.maybeSingle()

  if (redeemed) return true

  const { data: orders } = await adminClient
    .from('orders')
    .select('id, coupon_id, entitlement_type')
    .eq('user_id', userId)
    .neq('status', 'cancelled')
    .gte('created_at', start.toISOString())
    .lte('created_at', end.toISOString())

  return (orders || []).some((order) => {
    if (exceptCouponId && order.coupon_id === exceptCouponId) return false
    const entitlement = String(order.entitlement_type || '')
    return (
      entitlement === 'daily_coupon' ||
      entitlement === 'pass' ||
      entitlement === 'pass_coupon'
    )
  })
}

export async function countDrinksToday(
  adminClient: SupabaseClient,
  userId: string
): Promise<number> {
  const { start, end } = singaporeDayBounds()
  const { count, error } = await adminClient
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .neq('status', 'cancelled')
    .gte('created_at', start.toISOString())
    .lte('created_at', end.toISOString())

  if (error) return 0
  return count || 0
}

export async function hasUsedSecondCupToday(
  adminClient: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { start, end } = singaporeDayBounds()
  const { data: order } = await adminClient
    .from('orders')
    .select('id')
    .eq('user_id', userId)
    .eq('entitlement_type', 'second_cup')
    .neq('status', 'cancelled')
    .gte('created_at', start.toISOString())
    .lte('created_at', end.toISOString())
    .limit(1)
    .maybeSingle()

  return Boolean(order)
}

export async function isCouponReservedOnOpenOrder(
  adminClient: SupabaseClient,
  couponId: string,
  userId: string
): Promise<boolean> {
  const { data } = await adminClient
    .from('orders')
    .select('id')
    .eq('user_id', userId)
    .eq('coupon_id', couponId)
    .neq('status', 'cancelled')
    .limit(1)
    .maybeSingle()

  return Boolean(data)
}

/** One All-Drinks coupon per Singapore calendar day for Paid / Pass. Does not stack. */
export async function getOrCreateDailyCoupon(
  adminClient: SupabaseClient,
  userId: string
) {
  const { membership } = await resolveMembership(adminClient, userId)

  if (!membership.isPaid && !membership.isPass) {
    return null
  }

  const kind = membership.isPass ? 'pass' : 'daily_24h'
  const now = new Date()
  const { ymd, start, end } = singaporeDayBounds(now)

  const { data: existingToday } = await adminClient
    .from('coupons')
    .select('*')
    .eq('user_id', userId)
    .in('kind', [...DAILY_DRINK_KINDS])
    .eq('is_redeemed', false)
    .gte('granted_at', start.toISOString())
    .lte('granted_at', end.toISOString())
    .order('granted_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingToday) {
    return existingToday
  }

  if (await hasUsedPassDrinkToday(adminClient, userId)) {
    return null
  }

  const { data: leftover } = await adminClient
    .from('coupons')
    .select('*')
    .eq('user_id', userId)
    .in('kind', [...DAILY_DRINK_KINDS])
    .eq('is_redeemed', false)
    .order('granted_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (leftover) {
    const grantedDay = leftover.granted_at
      ? singaporeDateString(new Date(leftover.granted_at))
      : ''
    if (grantedDay === ymd) {
      return leftover
    }
    await adminClient
      .from('coupons')
      .update({
        expires_at: now.toISOString(),
      })
      .eq('id', leftover.id)
      .eq('is_redeemed', false)
  }

  const code = `COUPON-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`

  const { data: created, error } = await adminClient
    .from('coupons')
    .insert({
      user_id: userId,
      code,
      expires_at: end.toISOString(),
      kind,
      granted_at: now.toISOString(),
    })
    .select('*')
    .single()

  if (error) {
    const { data: raced } = await adminClient
      .from('coupons')
      .select('*')
      .eq('user_id', userId)
      .in('kind', [...DAILY_DRINK_KINDS])
      .eq('is_redeemed', false)
      .gte('granted_at', start.toISOString())
      .order('granted_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (raced) return raced
    throw new Error(error.message)
  }
  return created
}

/** Whether Paid/Pass user is eligible for 50% second cup (daily coupon already used today). */
export async function isSecondCupEligible(
  adminClient: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { membership } = await resolveMembership(adminClient, userId)
  if (!membership.isPaid && !membership.isPass) return false

  if (!(await hasUsedPassDrinkToday(adminClient, userId))) return false
  if (await hasUsedSecondCupToday(adminClient, userId)) return false
  if ((await countDrinksToday(adminClient, userId)) !== 1) return false

  const open = await getOrCreateDailyCoupon(adminClient, userId)
  return open == null
}

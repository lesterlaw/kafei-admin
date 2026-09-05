import type { SupabaseClient } from '@supabase/supabase-js'
import { addDaysIso } from '@/lib/product-logic/settings'
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

/** Rolling 24h All-Drinks coupon for Paid / Pass. Does not stack. */
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
  const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000)

  const { data: existing } = await adminClient
    .from('coupons')
    .select('*')
    .eq('user_id', userId)
    .eq('kind', kind)
    .eq('is_redeemed', false)
    .gte('granted_at', windowStart.toISOString())
    .order('granted_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing) {
    return existing
  }

  // Do not grant another while an unredeemed one exists outside window? Spec: coupons do not stack.
  const { data: anyOpen } = await adminClient
    .from('coupons')
    .select('*')
    .eq('user_id', userId)
    .in('kind', ['daily_24h', 'pass'])
    .eq('is_redeemed', false)
    .gt('expires_at', now.toISOString())
    .order('granted_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (anyOpen) {
    return anyOpen
  }

  // Only grant if last redeemed/granted window has ended
  const { data: last } = await adminClient
    .from('coupons')
    .select('*')
    .eq('user_id', userId)
    .in('kind', ['daily_24h', 'pass'])
    .order('granted_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (last) {
    const lastGranted = new Date(last.granted_at || last.created_at).getTime()
    if (now.getTime() - lastGranted < 24 * 60 * 60 * 1000 && !last.is_redeemed) {
      return last
    }
    if (
      last.is_redeemed &&
      last.redeemed_at &&
      now.getTime() - new Date(last.redeemed_at).getTime() < 24 * 60 * 60 * 1000
    ) {
      // Within 24h of last redemption — no new coupon (second cup is 50% instead)
      return null
    }
    if (
      !last.is_redeemed &&
      now.getTime() - lastGranted < 24 * 60 * 60 * 1000
    ) {
      return last
    }
    // If last was redeemed and 24h passed, grant new
    if (!last.is_redeemed) {
      // Expired unused — mark and grant new
      if (new Date(last.expires_at) < now) {
        // fall through to create
      } else {
        return last
      }
    }
  }

  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const code = `COUPON-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`

  const { data: created, error } = await adminClient
    .from('coupons')
    .insert({
      user_id: userId,
      code,
      expires_at: expiresAt.toISOString(),
      kind,
      granted_at: now.toISOString(),
    })
    .select('*')
    .single()

  if (error) {
    throw new Error(error.message)
  }
  return created
}

/** Whether Paid/Pass user is eligible for 50% second cup (daily coupon already used in last 24h). */
export async function isSecondCupEligible(
  adminClient: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { membership } = await resolveMembership(adminClient, userId)
  if (!membership.isPaid && !membership.isPass) return false

  const now = new Date()
  const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000)

  const { data: redeemed } = await adminClient
    .from('coupons')
    .select('id')
    .eq('user_id', userId)
    .in('kind', ['daily_24h', 'pass'])
    .eq('is_redeemed', true)
    .gte('redeemed_at', windowStart.toISOString())
    .limit(1)
    .maybeSingle()

  if (!redeemed) return false

  const open = await getOrCreateDailyCoupon(adminClient, userId)
  return open == null
}

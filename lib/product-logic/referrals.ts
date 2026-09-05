import type { SupabaseClient } from '@supabase/supabase-js'
import {
  addDaysIso,
  getProductLogicSettings,
} from '@/lib/product-logic/settings'
import {
  grantBeans,
  resolveMembership,
  ensureWallet,
} from '@/lib/product-logic/wallet'
import { grantReferralRewardCoupons } from '@/lib/product-logic/coupons'

export function normalizeReferralCode(value: string): string {
  return value.trim().toUpperCase()
}

export async function recordReferralAtSignup(
  adminClient: SupabaseClient,
  referredUserId: string,
  rawCode: string
) {
  const code = normalizeReferralCode(rawCode)
  if (!code) return null

  const { data: referrer } = await adminClient
    .from('users')
    .select('id, referral_code')
    .ilike('referral_code', code)
    .maybeSingle()

  if (!referrer || referrer.id === referredUserId) {
    return null
  }

  const { data: existing } = await adminClient
    .from('referrals')
    .select('id')
    .eq('referrer_id', referrer.id)
    .eq('referred_id', referredUserId)
    .maybeSingle()

  if (existing) {
    return existing
  }

  const { data, error } = await adminClient
    .from('referrals')
    .insert({
      referrer_id: referrer.id,
      referred_id: referredUserId,
      referral_code: referrer.referral_code || code,
      status: 'pending',
      reward_issued: false,
    })
    .select('id')
    .maybeSingle()

  if (error) {
    console.error('[referrals] failed to record signup referral', error)
    return null
  }

  return data
}

const FIRST_DRINK_STATUSES = [
  'completed',
  'queued',
  'brewing',
  'ready',
  'dispatched',
  'preparing',
]

export async function userHasFirstDrink(
  adminClient: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data } = await adminClient
    .from('orders')
    .select('id')
    .eq('user_id', userId)
    .in('status', FIRST_DRINK_STATUSES)
    .limit(1)
    .maybeSingle()

  return Boolean(data)
}

/**
 * Activate a referral after the referred user's first successful drink.
 * Paid referral upgrade happens separately after subscription payment.
 */
export async function activateReferralOnFirstDrink(
  adminClient: SupabaseClient,
  referredUserId: string
) {
  const { data: referral } = await adminClient
    .from('referrals')
    .select('*')
    .eq('referred_id', referredUserId)
    .eq('status', 'pending')
    .maybeSingle()

  if (!referral) return null

  const now = new Date().toISOString()
  await adminClient
    .from('referrals')
    .update({
      status: 'activated_free',
      activated_at: now,
    })
    .eq('id', referral.id)

  await issueReferrerRewards(adminClient, referral.referrer_id, 'activated_free')
  return referral
}

/** If the referred user already bought a drink, activate a leftover pending row. */
export async function syncReferralActivationForUser(
  adminClient: SupabaseClient,
  userId: string
) {
  try {
    if (await userHasFirstDrink(adminClient, userId)) {
      await activateReferralOnFirstDrink(adminClient, userId)
    }

    const { data: pendingAsReferrer } = await adminClient
      .from('referrals')
      .select('referred_id')
      .eq('referrer_id', userId)
      .eq('status', 'pending')

    for (const row of pendingAsReferrer || []) {
      if (await userHasFirstDrink(adminClient, row.referred_id)) {
        await activateReferralOnFirstDrink(adminClient, row.referred_id)
      }
    }
  } catch (error) {
    console.error('[referrals] sync activation failed', error)
  }
}

export async function activateReferralOnPaidSubscribe(
  adminClient: SupabaseClient,
  referredUserId: string
) {
  const { data: referral } = await adminClient
    .from('referrals')
    .select('*')
    .eq('referred_id', referredUserId)
    .in('status', ['pending', 'activated_free'])
    .maybeSingle()

  if (!referral) return null

  // Must already have first drink for pending → paid path
  if (referral.status === 'pending') {
    // Treat paid subscribe without first drink as still pending until drink
    return null
  }

  if (referral.status === 'activated_paid') {
    return referral
  }

  const now = new Date().toISOString()
  await adminClient
    .from('referrals')
    .update({
      status: 'activated_paid',
      activated_at: referral.activated_at || now,
    })
    .eq('id', referral.id)

  await issueReferrerRewards(adminClient, referral.referrer_id, 'activated_paid')
  return referral
}

async function issueReferrerRewards(
  adminClient: SupabaseClient,
  referrerId: string,
  event: 'activated_free' | 'activated_paid'
) {
  const settings = await getProductLogicSettings(adminClient)
  const { membership } = await resolveMembership(adminClient, referrerId)

  if (membership.kind === 'free') {
    if (event !== 'activated_free') return

    const { count } = await adminClient
      .from('referrals')
      .select('*', { count: 'exact', head: true })
      .eq('referrer_id', referrerId)
      .in('status', ['activated_free', 'activated_paid'])

    const activated = count || 0
    if (activated > 0 && activated % settings.free_referral_threshold === 0) {
      await grantKafeiPass(adminClient, referrerId)
    }
    return
  }

  // Paid referrer
  if (event === 'activated_free') {
    await grantBeans(
      adminClient,
      referrerId,
      settings.paid_free_referral_beans,
      'referral_free',
      false
    )
    return
  }

  if (event === 'activated_paid') {
    await grantBeans(
      adminClient,
      referrerId,
      settings.paid_paid_referral_beans,
      'referral_paid',
      false
    )

    const { count } = await adminClient
      .from('referrals')
      .select('*', { count: 'exact', head: true })
      .eq('referrer_id', referrerId)
      .eq('status', 'activated_paid')

    const paidCount = count || 0
    if (
      paidCount > 0 &&
      paidCount % settings.paid_referral_credit_threshold === 0
    ) {
      await grantReferralRewardCoupons(
        adminClient,
        referrerId,
        settings.paid_referral_drink_coupons,
        settings.paid_referral_addon_coupons,
        settings.paid_referral_coupon_expiry_days
      )

      const { data: unpaid } = await adminClient
        .from('referrals')
        .select('id')
        .eq('referrer_id', referrerId)
        .eq('status', 'activated_paid')
        .eq('credit_issued', false)
        .order('activated_at', { ascending: true })
        .limit(settings.paid_referral_credit_threshold)

      if (unpaid?.length) {
        await adminClient
          .from('referrals')
          .update({ credit_issued: true })
          .in(
            'id',
            unpaid.map((r) => r.id)
          )
      }
    }
  }
}

export async function grantKafeiPass(
  adminClient: SupabaseClient,
  userId: string
) {
  const settings = await getProductLogicSettings(adminClient)
  const wallet = await ensureWallet(adminClient, userId)

  if (wallet.passes_earned_count >= settings.free_pass_max) {
    return { granted: false, reason: 'Pass campaign cap reached' as const }
  }

  const now = Date.now()
  const durationMs = settings.pass_duration_days * 24 * 60 * 60 * 1000
  const activeUntil = wallet.pass_active_until
    ? new Date(wallet.pass_active_until).getTime()
    : 0

  if (activeUntil > now) {
    // Already have active — queue pending if empty
    if (wallet.pass_pending_until) {
      return { granted: false, reason: 'Already have active + pending Pass' as const }
    }
    const pendingUntil = new Date(
      activeUntil + durationMs
    ).toISOString()
    await adminClient
      .from('user_wallets')
      .update({
        pass_pending_until: pendingUntil,
        passes_earned_count: wallet.passes_earned_count + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
    return { granted: true, pending: true, pass_pending_until: pendingUntil }
  }

  const until = addDaysIso(settings.pass_duration_days)
  await adminClient
    .from('user_wallets')
    .update({
      pass_active_until: until,
      passes_earned_count: wallet.passes_earned_count + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)

  return { granted: true, pending: false, pass_active_until: until }
}

export async function getReferralProgress(
  adminClient: SupabaseClient,
  userId: string
) {
  await syncReferralActivationForUser(adminClient, userId)

  const settings = await getProductLogicSettings(adminClient)
  const { membership, wallet } = await resolveMembership(adminClient, userId)

  const { data: referrals } = await adminClient
    .from('referrals')
    .select(
      '*, referred:users!referrals_referred_id_fkey(id, email, full_name, created_at)'
    )
    .eq('referrer_id', userId)
    .order('created_at', { ascending: false })

  const list = referrals || []
  const activatedFree = list.filter((r) =>
    ['activated_free', 'activated_paid'].includes(r.status)
  ).length
  const activatedPaid = list.filter((r) => r.status === 'activated_paid').length

  return {
    referral_code: (
      await adminClient
        .from('users')
        .select('referral_code')
        .eq('id', userId)
        .single()
    ).data?.referral_code,
    referrals: list,
    membership_kind: membership.kind,
    free: {
      activated_count: activatedFree,
      threshold: settings.free_referral_threshold,
      progress: activatedFree % settings.free_referral_threshold,
      passes_earned: wallet.passes_earned_count,
      passes_max: settings.free_pass_max,
      pass_active_until: wallet.pass_active_until,
      pass_pending_until: wallet.pass_pending_until,
    },
    paid: {
      activated_free_count: list.filter((r) => r.status === 'activated_free')
        .length,
      activated_paid_count: activatedPaid,
      credit_threshold: settings.paid_referral_credit_threshold,
      credit_progress: activatedPaid % settings.paid_referral_credit_threshold,
      beans_per_free: settings.paid_free_referral_beans,
      beans_per_paid: settings.paid_paid_referral_beans,
      membership_credit_cents: wallet.membership_credit_cents,
      drink_coupons: settings.paid_referral_drink_coupons,
      addon_coupons: settings.paid_referral_addon_coupons,
      coupon_expiry_days: settings.paid_referral_coupon_expiry_days,
    },
  }
}

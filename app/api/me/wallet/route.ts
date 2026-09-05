import { NextRequest } from 'next/server'
import {
  createApiResponse,
  createApiError,
  authenticateRequest,
} from '@/lib/api/middleware'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getProductLogicSettings,
  resolveMembership,
  getAvailableBeans,
  grantWelcomeIfNeeded,
  canCheckInToday,
  getOrCreateDailyCoupon,
  isSecondCupEligible,
  getReferralProgress,
} from '@/lib/product-logic'

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return createApiError('Unauthorized', 401)
    }

    const adminClient = createAdminClient()
    try {
      await grantWelcomeIfNeeded(adminClient, user.id)
    } catch (error) {
      console.error('Welcome grant skipped:', error)
    }

    const settings = await getProductLogicSettings(adminClient)
    const { membership, wallet } = await resolveMembership(adminClient, user.id)
    const beans = await getAvailableBeans(adminClient, user.id).catch(() => 0)
    const dailyCoupon = await getOrCreateDailyCoupon(adminClient, user.id).catch(
      () => null
    )
    const secondCup = await isSecondCupEligible(adminClient, user.id).catch(
      () => false
    )
    const referral = await getReferralProgress(adminClient, user.id).catch(() => ({
      free: {
        activated_count: 0,
        threshold: settings.free_referral_threshold,
        progress: 0,
        passes_earned: wallet.passes_earned_count,
        passes_max: settings.free_pass_max,
        pass_active_until: wallet.pass_active_until,
        pass_pending_until: wallet.pass_pending_until,
      },
      paid: {
        activated_free_count: 0,
        activated_paid_count: 0,
        credit_threshold: settings.paid_referral_credit_threshold,
        credit_progress: 0,
        beans_per_free: settings.paid_free_referral_beans,
        beans_per_paid: settings.paid_paid_referral_beans,
        membership_credit_cents: settings.membership_credit_cents,
        drink_coupons: settings.paid_referral_drink_coupons,
        addon_coupons: settings.paid_referral_addon_coupons,
        coupon_expiry_days: settings.paid_referral_coupon_expiry_days,
      },
    }))

    const rewardCatalogue = [
      {
        id: 'americano',
        type: 'bean_drink' as const,
        name: 'Americano',
        beans: settings.bean_americano,
        free_eligible: true,
        paid_eligible: true,
      },
      {
        id: 'latte',
        type: 'bean_drink' as const,
        name: 'Latte',
        beans: settings.bean_latte,
        free_eligible: true,
        paid_eligible: true,
      },
      {
        id: 'addon_any',
        type: 'bean_addon' as const,
        name: 'Any $1 Add-on',
        beans: settings.bean_addon,
        free_eligible: false,
        paid_eligible: true,
        cash_price: settings.addon_cash_price,
      },
    ].filter((item) =>
      membership.fullBeanCatalogue ? item.paid_eligible : item.free_eligible
    )

    return createApiResponse({
      membership,
      wallet: {
        stamp_count: wallet.stamp_count,
        stamp_cost: settings.stamp_cost,
        stamp_max: settings.stamp_max,
        welcome_drink_available: wallet.welcome_drink_available,
        last_checkin_on: wallet.last_checkin_on,
        can_checkin: canCheckInToday(wallet),
        membership_credit_cents: wallet.membership_credit_cents,
        pass_active_until: wallet.pass_active_until,
        pass_pending_until: wallet.pass_pending_until,
        passes_earned_count: wallet.passes_earned_count,
        passes_max: settings.free_pass_max,
      },
      beans,
      daily_coupon: dailyCoupon,
      second_cup_eligible: secondCup,
      reward_catalogue: rewardCatalogue,
      settings: {
        scan_window_seconds: settings.scan_window_seconds,
        checkin_beans: settings.checkin_beans,
        free_bean_expiry_days: settings.free_bean_expiry_days,
      },
      referral: {
        free: referral.free,
        paid: referral.paid,
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return createApiError(message, 500)
  }
}

import { NextRequest } from 'next/server'
import {
  createApiResponse,
  createApiError,
  authenticateRequest,
} from '@/lib/api/middleware'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getUnusedRewardCoupons,
  WELCOME_PROMO_CODE,
  getOrCreateDailyCoupon,
  isSecondCupEligible,
} from '@/lib/product-logic'

function couponTitle(kind: string, code: string) {
  if (kind === 'welcome') return 'Welcome drink - Latte/Americano'
  if (kind === 'referral_drink') return 'Referral drink coupon - Latte/Americano'
  if (kind === 'referral_addon') return 'Referral add-on coupon'
  if (kind === 'pass') return '7-Day Pass drink - Latte/Americano'
  if (kind === 'daily_24h') return 'Daily All-Drinks coupon'
  if (code.startsWith('RD-')) return 'Referral drink coupon - Latte/Americano'
  if (code.startsWith('RA-')) return 'Referral add-on coupon'
  return 'Reward coupon'
}

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return createApiError('Unauthorized', 401)
    }

    const supabase = createAdminClient()
    const now = Date.now()

    const { data: allActive, error } = await supabase
      .from('promo_codes')
      .select('*')
      .eq('is_active', true)
      .order('is_system', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) {
      return createApiError(error.message, 500)
    }

    const { data: userAssignments } = await supabase
      .from('promo_code_users')
      .select('promo_code_id')
      .eq('user_id', user.id)

    const assignedIds = new Set(
      (userAssignments || []).map((row) => row.promo_code_id)
    )

    const { data: wallet } = await supabase
      .from('user_wallets')
      .select('welcome_drink_available')
      .eq('user_id', user.id)
      .maybeSingle()

    const applicable = (allActive || []).filter((promo) => {
      if (promo.type === 'referral' || promo.code === 'REF3FREE') {
        return false
      }
      if (promo.starts_at && new Date(promo.starts_at).getTime() > now) {
        return false
      }
      if (promo.ends_at && new Date(promo.ends_at).getTime() < now) {
        return false
      }
      if (promo.code === WELCOME_PROMO_CODE) {
        return (
          assignedIds.has(promo.id) && wallet?.welcome_drink_available !== false
        )
      }
      if (promo.applies_to_all_users) return true
      return assignedIds.has(promo.id)
    })

    const rewardCoupons = await getUnusedRewardCoupons(supabase, user.id)
    const asPromos: Array<{
      id: string
      name: string
      code: string
      type: 'percent' | 'fixed'
      discount_value: number
      is_system: boolean
      is_active: boolean
      kind: string
    }> = rewardCoupons.map((coupon) => ({
      id: coupon.id,
      name: couponTitle(String(coupon.kind || ''), coupon.code),
      code: coupon.code,
      type: coupon.kind === 'referral_addon' ? 'fixed' : 'percent',
      discount_value: coupon.kind === 'referral_addon' ? 1 : 100,
      is_system: true,
      is_active: true,
      kind: String(coupon.kind || 'other'),
    }))

    const dailyCoupon = await getOrCreateDailyCoupon(supabase, user.id).catch(
      (error) => {
        console.error('[promo-codes] daily coupon', error)
        return null
      }
    )
    const secondCupEligible = await isSecondCupEligible(supabase, user.id).catch(
      () => false
    )

    if (dailyCoupon) {
      asPromos.unshift({
        id: dailyCoupon.id,
        name: couponTitle(String(dailyCoupon.kind || ''), dailyCoupon.code),
        code: dailyCoupon.code,
        type: 'percent',
        discount_value: 100,
        is_system: true,
        is_active: true,
        kind: String(dailyCoupon.kind || 'daily_24h'),
      })
    } else if (secondCupEligible) {
      asPromos.unshift({
        id: 'second-cup',
        name: 'Second drink 50% off',
        code: 'SECOND50',
        type: 'percent',
        discount_value: 50,
        is_system: true,
        is_active: true,
        kind: 'second_cup',
      })
    }

    return createApiResponse([...asPromos, ...applicable])
  } catch (error: any) {
    return createApiError(error.message || 'Internal server error', 500)
  }
}

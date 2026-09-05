import type { SupabaseClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'
import {
  getProductLogicSettings,
  singaporeDateString,
} from '@/lib/product-logic/settings'
import {
  canCheckInToday,
  ensureWallet,
  grantBeans,
  resolveMembership,
  type UserWalletRow,
} from '@/lib/product-logic/wallet'

export async function createAdViewToken(
  adminClient: SupabaseClient,
  userId: string,
  purpose: 'checkin' | 'redemption',
  houseAdId?: string | null
): Promise<{ token: string; expires_at: string; house_ad: unknown | null }> {
  const { data: ads } = await adminClient
    .from('house_ads')
    .select('*')
    .eq('is_active', true)
    .or(
      purpose === 'checkin'
        ? 'placement.eq.checkin,placement.eq.both'
        : 'placement.eq.redemption,placement.eq.both'
    )
    .order('sort_order', { ascending: true })
    .limit(1)

  const houseAd = ads?.[0] || null
  const adId = houseAdId || houseAd?.id || null
  const token = randomBytes(24).toString('hex')
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()

  const { error } = await adminClient.from('ad_view_tokens').insert({
    user_id: userId,
    house_ad_id: adId,
    purpose,
    token,
    expires_at: expiresAt,
  })

  if (error) {
    throw new Error(error.message)
  }

  return { token, expires_at: expiresAt, house_ad: houseAd }
}

export async function consumeAdViewToken(
  adminClient: SupabaseClient,
  userId: string,
  token: string,
  purpose: 'checkin' | 'redemption'
): Promise<boolean> {
  const now = new Date().toISOString()
  const { data } = await adminClient
    .from('ad_view_tokens')
    .select('*')
    .eq('token', token)
    .eq('user_id', userId)
    .eq('purpose', purpose)
    .is('consumed_at', null)
    .gt('expires_at', now)
    .maybeSingle()

  if (!data) return false

  const { error } = await adminClient
    .from('ad_view_tokens')
    .update({ consumed_at: now })
    .eq('id', data.id)
    .is('consumed_at', null)

  return !error
}

export async function performCheckIn(
  adminClient: SupabaseClient,
  userId: string,
  _adToken?: string | null
): Promise<{
  wallet: UserWalletRow
  beans_awarded: number
  stamp_awarded: number
  stamp_count: number
}> {
  const { membership, wallet } = await resolveMembership(adminClient, userId)

  if (!canCheckInToday(wallet)) {
    throw new Error('Already checked in today')
  }

  const settings = await getProductLogicSettings(adminClient)

  let stampAwarded = 0
  let nextStamps = wallet.stamp_count

  if (membership.collectsStamps) {
    if (wallet.stamp_count >= settings.stamp_max) {
      // Still award beans, but no stamp
      stampAwarded = 0
    } else {
      stampAwarded = 1
      nextStamps = wallet.stamp_count + 1
    }
  }

  await grantBeans(
    adminClient,
    userId,
    settings.checkin_beans,
    'checkin',
    membership.freeBeanExpiry
  )

  const today = singaporeDateString()
  const { data: updated, error } = await adminClient
    .from('user_wallets')
    .update({
      stamp_count: nextStamps,
      last_checkin_on: today,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .select('*')
    .single()

  if (error || !updated) {
    throw new Error(error?.message || 'Failed to update wallet after check-in')
  }

  return {
    wallet: updated as UserWalletRow,
    beans_awarded: settings.checkin_beans,
    stamp_awarded: stampAwarded,
    stamp_count: nextStamps,
  }
}

export async function getActiveHouseAds(
  adminClient: SupabaseClient,
  placement?: 'checkin' | 'redemption'
) {
  let query = adminClient
    .from('house_ads')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (placement) {
    query = query.or(`placement.eq.${placement},placement.eq.both`)
  }

  const { data } = await query
  return data || []
}

export { ensureWallet }

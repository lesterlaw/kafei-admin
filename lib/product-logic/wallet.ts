import type { SupabaseClient } from '@supabase/supabase-js'
import {
  addDaysIso,
  getProductLogicSettings,
  singaporeDateString,
} from '@/lib/product-logic/settings'

export type MembershipKind = 'free' | 'monthly' | 'annual' | 'pass'

export interface MembershipState {
  kind: MembershipKind
  isPaid: boolean
  isPass: boolean
  seesAds: boolean
  collectsStamps: boolean
  fullBeanCatalogue: boolean
  freeBeanExpiry: boolean
  subscriptionId: string | null
  tierId: string | null
  tierPeriod: 'free' | 'monthly' | 'annual' | null
  passActiveUntil: string | null
}

export interface UserWalletRow {
  user_id: string
  stamp_count: number
  welcome_drink_available: boolean
  welcome_beans_granted: boolean
  last_checkin_on: string | null
  membership_credit_cents: number
  pass_active_until: string | null
  pass_pending_until: string | null
  passes_earned_count: number
  created_at: string
  updated_at: string
}

export async function ensureWallet(
  adminClient: SupabaseClient,
  userId: string
): Promise<UserWalletRow> {
  const { data: existing } = await adminClient
    .from('user_wallets')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (existing) {
    return existing as UserWalletRow
  }

  const { data: created, error } = await adminClient
    .from('user_wallets')
    .insert({
      user_id: userId,
      welcome_drink_available: true,
      welcome_beans_granted: false,
    })
    .select('*')
    .single()

  if (error || !created) {
    throw new Error(error?.message || 'Failed to create wallet')
  }

  return created as UserWalletRow
}

export async function resolveMembership(
  adminClient: SupabaseClient,
  userId: string
): Promise<{ membership: MembershipState; wallet: UserWalletRow }> {
  const wallet = await ensureWallet(adminClient, userId)
  const now = Date.now()

  // Activate pending pass if active expired
  let passActiveUntil = wallet.pass_active_until
  let passPendingUntil = wallet.pass_pending_until

  if (passActiveUntil && new Date(passActiveUntil).getTime() <= now) {
    if (passPendingUntil && new Date(passPendingUntil).getTime() > now) {
      const pendingEnd = passPendingUntil
      await adminClient
        .from('user_wallets')
        .update({
          pass_active_until: pendingEnd,
          pass_pending_until: null,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
      passActiveUntil = pendingEnd
      passPendingUntil = null
      wallet.pass_active_until = pendingEnd
      wallet.pass_pending_until = null
    } else {
      await adminClient
        .from('user_wallets')
        .update({
          pass_active_until: null,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
      passActiveUntil = null
      wallet.pass_active_until = null
    }
  }

  const isPass = Boolean(
    passActiveUntil && new Date(passActiveUntil).getTime() > now
  )

  const { data: subscription } = await adminClient
    .from('user_subscriptions')
    .select('id, tier_id, status, subscription_tiers(id, period, is_hidden)')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle()

  const tier = subscription?.subscription_tiers as
    | { id: string; period: string; is_hidden?: boolean }
    | { id: string; period: string; is_hidden?: boolean }[]
    | null
    | undefined

  const tierRow = Array.isArray(tier) ? tier[0] : tier
  const period =
    tierRow?.period === 'monthly' || tierRow?.period === 'annual'
      ? tierRow.period
      : tierRow?.period === 'free'
        ? 'free'
        : null

  const isPaid = period === 'monthly' || period === 'annual'

  if (isPaid) {
    return {
      wallet,
      membership: {
        kind: period!,
        isPaid: true,
        isPass: false,
        seesAds: false,
        collectsStamps: false,
        fullBeanCatalogue: true,
        freeBeanExpiry: false,
        subscriptionId: subscription?.id ?? null,
        tierId: tierRow?.id ?? null,
        tierPeriod: period,
        passActiveUntil: null,
      },
    }
  }

  if (isPass) {
    return {
      wallet,
      membership: {
        kind: 'pass',
        isPaid: false,
        isPass: true,
        seesAds: false,
        collectsStamps: true,
        fullBeanCatalogue: true,
        freeBeanExpiry: false,
        subscriptionId: null,
        tierId: null,
        tierPeriod: null,
        passActiveUntil,
      },
    }
  }

  return {
    wallet,
    membership: {
      kind: 'free',
      isPaid: false,
      isPass: false,
      seesAds: false,
      collectsStamps: true,
      fullBeanCatalogue: false,
      freeBeanExpiry: true,
      subscriptionId: null,
      tierId: null,
      tierPeriod: 'free',
      passActiveUntil: null,
    },
  }
}

export async function grantBeans(
  adminClient: SupabaseClient,
  userId: string,
  amount: number,
  source: 'welcome' | 'checkin' | 'referral_free' | 'referral_paid' | 'admin' | 'other',
  withFreeExpiry: boolean
) {
  if (amount <= 0) return null

  const settings = await getProductLogicSettings(adminClient)
  const expiresAt = withFreeExpiry
    ? addDaysIso(settings.free_bean_expiry_days)
    : null

  const { data, error } = await adminClient
    .from('bean_lots')
    .insert({
      user_id: userId,
      amount,
      remaining: amount,
      expires_at: expiresAt,
      source,
    })
    .select('*')
    .single()

  if (error) {
    throw new Error(error.message)
  }
  return data
}

export async function getAvailableBeans(
  adminClient: SupabaseClient,
  userId: string
): Promise<number> {
  const now = new Date().toISOString()
  const { data } = await adminClient
    .from('bean_lots')
    .select('remaining, expires_at')
    .eq('user_id', userId)
    .gt('remaining', 0)

  if (!data) return 0

  return data.reduce((sum, lot) => {
    if (lot.expires_at && lot.expires_at < now) return sum
    return sum + Number(lot.remaining)
  }, 0)
}

/** FIFO deduct from non-expired lots. Returns false if insufficient. */
export async function deductBeans(
  adminClient: SupabaseClient,
  userId: string,
  amount: number
): Promise<boolean> {
  if (amount <= 0) return true

  const now = new Date().toISOString()
  const { data: lots } = await adminClient
    .from('bean_lots')
    .select('id, remaining, expires_at')
    .eq('user_id', userId)
    .gt('remaining', 0)
    .order('expires_at', { ascending: true, nullsFirst: false })
    .order('earned_at', { ascending: true })

  const usable = (lots || []).filter(
    (lot) => !lot.expires_at || lot.expires_at >= now
  )

  const total = usable.reduce((sum, lot) => sum + Number(lot.remaining), 0)
  if (total < amount) return false

  let left = amount
  for (const lot of usable) {
    if (left <= 0) break
    const take = Math.min(Number(lot.remaining), left)
    const next = Number(lot.remaining) - take
    const { error } = await adminClient
      .from('bean_lots')
      .update({ remaining: next })
      .eq('id', lot.id)
      .eq('remaining', lot.remaining)
    if (error) {
      throw new Error(error.message)
    }
    left -= take
  }

  return left === 0
}

export async function grantWelcomeIfNeeded(
  adminClient: SupabaseClient,
  userId: string
) {
  const wallet = await ensureWallet(adminClient, userId)
  if (wallet.welcome_beans_granted) {
    return wallet
  }

  const settings = await getProductLogicSettings(adminClient)
  await grantBeans(
    adminClient,
    userId,
    settings.welcome_beans,
    'welcome',
    true
  )

  await assignWelcomeDrinkPromo(adminClient, userId)

  const { data } = await adminClient
    .from('user_wallets')
    .update({
      welcome_beans_granted: true,
      welcome_drink_available: true,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .select('*')
    .single()

  return (data as UserWalletRow) || wallet
}

export const WELCOME_PROMO_CODE = 'WELCOME1'

async function assignWelcomeDrinkPromo(
  adminClient: SupabaseClient,
  userId: string
) {
  const { data: existing } = await adminClient
    .from('promo_codes')
    .select('id')
    .eq('code', WELCOME_PROMO_CODE)
    .maybeSingle()

  let promoId = existing?.id as string | undefined
  if (!promoId) {
    const { data: created } = await adminClient
      .from('promo_codes')
      .insert({
        name: 'Welcome drink - Latte/Americano',
        code: WELCOME_PROMO_CODE,
        type: 'percent',
        discount_value: 100,
        is_system: true,
        is_active: true,
        applies_to_all_users: false,
        max_redemptions_per_user: 1,
      })
      .select('id')
      .maybeSingle()
    promoId = created?.id
  }

  if (!promoId) return

  await adminClient.from('promo_code_users').upsert(
    { promo_code_id: promoId, user_id: userId },
    { onConflict: 'promo_code_id,user_id' }
  )
}

function toSingaporeDate(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value.slice(0, 10)
  }
  return singaporeDateString(parsed)
}

export function canCheckInToday(wallet: UserWalletRow): boolean {
  if (!wallet.last_checkin_on) {
    return true
  }
  return toSingaporeDate(String(wallet.last_checkin_on)) !== singaporeDateString()
}

export type BeanHistoryKind = 'earned' | 'used' | 'expired'

export interface BeanHistoryEntry {
  id: string
  kind: BeanHistoryKind
  title: string
  amount: number
  at: string
  source: string
}

function lotTitle(source: string) {
  switch (source) {
    case 'welcome':
      return 'Welcome bonus'
    case 'checkin':
      return 'Daily check-in'
    case 'referral_free':
    case 'referral_paid':
      return 'Referral reward'
    case 'admin':
      return 'Admin adjustment'
    default:
      return 'Beans earned'
  }
}

function redemptionTitle(type: string) {
  switch (type) {
    case 'bean_drink':
      return 'Redeemed drink'
    case 'bean_addon':
      return 'Redeemed add-on'
    default:
      return 'Redeemed reward'
  }
}

export async function getBeanHistory(
  adminClient: SupabaseClient,
  userId: string
): Promise<BeanHistoryEntry[]> {
  const now = new Date().toISOString()
  const entries: BeanHistoryEntry[] = []

  const { data: lots } = await adminClient
    .from('bean_lots')
    .select('id, amount, remaining, earned_at, expires_at, source')
    .eq('user_id', userId)
    .order('earned_at', { ascending: false })

  for (const lot of lots || []) {
    entries.push({
      id: `${lot.id}-earn`,
      kind: 'earned',
      title: lotTitle(String(lot.source || 'other')),
      amount: Number(lot.amount) || 0,
      at: lot.earned_at,
      source: String(lot.source || 'other'),
    })
    if (lot.expires_at && lot.expires_at < now && Number(lot.remaining) > 0) {
      entries.push({
        id: `${lot.id}-expire`,
        kind: 'expired',
        title: 'Beans expired',
        amount: -Number(lot.remaining),
        at: lot.expires_at,
        source: 'expired',
      })
    }
  }

  const { data: redemptions } = await adminClient
    .from('redemptions')
    .select('id, type, beans_reserved, completed_at, updated_at, created_at')
    .eq('user_id', userId)
    .eq('status', 'completed')
    .gt('beans_reserved', 0)

  for (const row of redemptions || []) {
    entries.push({
      id: `${row.id}-use`,
      kind: 'used',
      title: redemptionTitle(String(row.type || 'bean_drink')),
      amount: -Number(row.beans_reserved) || 0,
      at: row.completed_at || row.updated_at || row.created_at,
      source: String(row.type || 'used'),
    })
  }

  return entries.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
}

import type { SupabaseClient } from '@supabase/supabase-js'

export interface ProductLogicSettings {
  id: number
  stamp_cost: number
  stamp_max: number
  checkin_beans: number
  welcome_beans: number
  free_bean_expiry_days: number
  scan_window_seconds: number
  robot_max_orders: number
  bean_americano: number
  bean_latte: number
  bean_addon: number
  addon_cash_price: number
  free_referral_threshold: number
  free_pass_max: number
  pass_duration_days: number
  paid_free_referral_beans: number
  paid_paid_referral_beans: number
  paid_referral_credit_threshold: number
  membership_credit_cents: number
  paid_referral_drink_coupons: number
  paid_referral_addon_coupons: number
  paid_referral_coupon_expiry_days: number
  updated_at: string
}

const DEFAULTS: Omit<ProductLogicSettings, 'id' | 'updated_at'> = {
  stamp_cost: 7,
  stamp_max: 13,
  checkin_beans: 5,
  welcome_beans: 5,
  free_bean_expiry_days: 60,
  scan_window_seconds: 80,
  robot_max_orders: 2,
  bean_americano: 250,
  bean_latte: 300,
  bean_addon: 75,
  addon_cash_price: 1,
  free_referral_threshold: 3,
  free_pass_max: 2,
  pass_duration_days: 7,
  paid_free_referral_beans: 0,
  paid_paid_referral_beans: 0,
  paid_referral_credit_threshold: 3,
  membership_credit_cents: 2900,
  paid_referral_drink_coupons: 10,
  paid_referral_addon_coupons: 10,
  paid_referral_coupon_expiry_days: 90,
}

let cachedSettings: ProductLogicSettings | null = null
let cachedAt = 0
const CACHE_MS = 30_000

export async function getProductLogicSettings(
  adminClient: SupabaseClient
): Promise<ProductLogicSettings> {
  if (cachedSettings && Date.now() - cachedAt < CACHE_MS) {
    return cachedSettings
  }

  const { data, error } = await adminClient
    .from('product_logic_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle()

  if (error || !data) {
    const fallback: ProductLogicSettings = {
      id: 1,
      ...DEFAULTS,
      updated_at: new Date().toISOString(),
    }
    return fallback
  }

  cachedSettings = {
    id: 1,
    ...DEFAULTS,
    ...(data as Partial<ProductLogicSettings>),
    updated_at:
      (data as { updated_at?: string }).updated_at || new Date().toISOString(),
  }
  cachedAt = Date.now()
  return cachedSettings
}

export function invalidateProductLogicSettingsCache() {
  cachedSettings = null
  cachedAt = 0
}

/** Asia/Singapore calendar date as YYYY-MM-DD */
export function singaporeDateString(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Singapore',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export function addDaysIso(days: number, from = new Date()): string {
  const d = new Date(from)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString()
}

/** Singapore calendar day as YYYY-MM-DD from an ISO timestamp. */
export function singaporeDateFromIso(value: string | Date): string {
  return singaporeDateString(value instanceof Date ? value : new Date(value))
}

/** Start/end of the Singapore calendar day containing `from`. */
export function singaporeDayBounds(from = new Date()): {
  ymd: string
  start: Date
  end: Date
} {
  const ymd = singaporeDateString(from)
  return {
    ymd,
    start: new Date(`${ymd}T00:00:00.000+08:00`),
    end: new Date(`${ymd}T23:59:59.999+08:00`),
  }
}

/**
 * Inclusive Singapore calendar window.
 * 7 days starting 7 Sept ends 13 Sept 23:59:59.999 SGT.
 */
export function addInclusiveSingaporeDaysEndIso(
  days: number,
  from = new Date()
): string {
  const startYmd = singaporeDateString(from)
  const [year, month, day] = startYmd.split('-').map(Number)
  const inclusiveOffset = Math.max(1, days) - 1
  const end = new Date(Date.UTC(year, month - 1, day + inclusiveOffset))
  const yyyy = end.getUTCFullYear()
  const mm = String(end.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(end.getUTCDate()).padStart(2, '0')
  return new Date(`${yyyy}-${mm}-${dd}T23:59:59.999+08:00`).toISOString()
}

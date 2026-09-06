'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { invalidateProductLogicSettingsCache } from '@/lib/product-logic/settings'

export async function getProductLogicSettingsAction() {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('product_logic_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle()

  if (error) {
    return { success: false as const, error: error.message, data: null }
  }
  return { success: true as const, data, error: null }
}

export async function updateProductLogicSettingsAction(formData: FormData) {
  const supabase = createAdminClient()
  const num = (key: string, fallback: number) => {
    const raw = formData.get(key)
    const n = Number(raw)
    return Number.isFinite(n) ? n : fallback
  }

  const payload = {
    stamp_cost: num('stamp_cost', 7),
    stamp_max: num('stamp_max', 13),
    checkin_beans: num('checkin_beans', 5),
    welcome_beans: num('welcome_beans', 5),
    free_bean_expiry_days: num('free_bean_expiry_days', 60),
    scan_window_seconds: num('scan_window_seconds', 80),
    robot_max_orders: num('robot_max_orders', 2),
    bean_americano: num('bean_americano', 250),
    bean_latte: num('bean_latte', 300),
    bean_addon: num('bean_addon', 75),
    addon_cash_price: num('addon_cash_price', 1),
    free_referral_threshold: num('free_referral_threshold', 3),
    free_pass_max: num('free_pass_max', 2),
    pass_duration_days: num('pass_duration_days', 7),
    paid_free_referral_beans: num('paid_free_referral_beans', 0),
    paid_paid_referral_beans: num('paid_paid_referral_beans', 0),
    paid_referral_credit_threshold: num('paid_referral_credit_threshold', 3),
    membership_credit_cents: num('membership_credit_cents', 2900),
    paid_referral_drink_coupons: num('paid_referral_drink_coupons', 10),
    paid_referral_addon_coupons: num('paid_referral_addon_coupons', 10),
    paid_referral_coupon_expiry_days: num('paid_referral_coupon_expiry_days', 90),
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase
    .from('product_logic_settings')
    .upsert({ id: 1, ...payload })

  if (error) {
    return { success: false as const, error: error.message }
  }

  invalidateProductLogicSettingsCache()
  revalidatePath('/dashboard/product-logic')
  revalidatePath('/dashboard/rewards-referrals')
  revalidatePath('/dashboard/referrals')
  return { success: true as const, error: null }
}

export async function updateProductLogicSettingsFormAction(formData: FormData) {
  await updateProductLogicSettingsAction(formData)
}

export async function listHouseAdsAction() {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('house_ads')
    .select('*')
    .order('sort_order', { ascending: true })

  if (error) {
    return { success: false as const, error: error.message, data: [] }
  }
  return { success: true as const, data: data || [], error: null }
}

export async function createHouseAdAction(formData: FormData) {
  const supabase = createAdminClient()
  const title = String(formData.get('title') || '').trim()
  const media_url = String(formData.get('media_url') || '').trim()
  const media_type = String(formData.get('media_type') || 'image')
  const placement = String(formData.get('placement') || 'both')
  const duration_seconds = Number(formData.get('duration_seconds') || 5)
  const sort_order = Number(formData.get('sort_order') || 0)
  const is_active = formData.get('is_active') === 'on'

  if (!title || !media_url) {
    return { success: false as const, error: 'Title and media URL required' }
  }

  const { error } = await supabase.from('house_ads').insert({
    title,
    media_url,
    media_type: media_type === 'video' ? 'video' : 'image',
    placement:
      placement === 'checkin' || placement === 'redemption' ? placement : 'both',
    duration_seconds: Number.isFinite(duration_seconds) ? duration_seconds : 5,
    sort_order: Number.isFinite(sort_order) ? sort_order : 0,
    is_active,
  })

  if (error) {
    return { success: false as const, error: error.message }
  }

  revalidatePath('/dashboard/house-ads')
  return { success: true as const, error: null }
}

export async function updateHouseAdAction(id: string, formData: FormData) {
  const supabase = createAdminClient()
  const title = String(formData.get('title') || '').trim()
  const media_url = String(formData.get('media_url') || '').trim()
  const media_type = String(formData.get('media_type') || 'image')
  const placement = String(formData.get('placement') || 'both')
  const duration_seconds = Number(formData.get('duration_seconds') || 5)
  const sort_order = Number(formData.get('sort_order') || 0)
  const is_active = formData.get('is_active') === 'on'

  const { error } = await supabase
    .from('house_ads')
    .update({
      title,
      media_url,
      media_type: media_type === 'video' ? 'video' : 'image',
      placement:
        placement === 'checkin' || placement === 'redemption'
          ? placement
          : 'both',
      duration_seconds: Number.isFinite(duration_seconds) ? duration_seconds : 5,
      sort_order: Number.isFinite(sort_order) ? sort_order : 0,
      is_active,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) {
    return { success: false as const, error: error.message }
  }

  revalidatePath('/dashboard/house-ads')
  return { success: true as const, error: null }
}

export async function deleteHouseAdAction(id: string) {
  const supabase = createAdminClient()
  const { error } = await supabase.from('house_ads').delete().eq('id', id)
  if (error) {
    return { success: false as const, error: error.message }
  }
  revalidatePath('/dashboard/house-ads')
  return { success: true as const, error: null }
}

export async function createHouseAdFormAction(formData: FormData) {
  await createHouseAdAction(formData)
}

export async function deleteHouseAdFormAction(formData: FormData) {
  const id = String(formData.get('id') || '')
  if (!id) return
  await deleteHouseAdAction(id)
}

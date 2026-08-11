'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { PromoCodeType } from '@/types/database'

async function verifyAdmin() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Not authenticated')
  }

  const { data: admin } = await supabase
    .from('admins')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!admin) {
    throw new Error('Admin access required')
  }

  return admin
}

function parseOptionalNumber(value: FormDataEntryValue | null): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isNaN(n) ? null : n
}

function parseOptionalInt(value: FormDataEntryValue | null): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = parseInt(String(value), 10)
  return Number.isNaN(n) ? null : n
}

function parseOptionalDatetime(value: FormDataEntryValue | null): string | null {
  if (value === null || value === undefined || String(value).trim() === '') {
    return null
  }
  const d = new Date(String(value))
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

function parseUserIds(raw: string | null): string[] {
  if (!raw?.trim()) return []
  return raw
    .split(/[,\s]+/)
    .map((id) => id.trim())
    .filter(Boolean)
}

export async function getPromoCodes() {
  await verifyAdmin()
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('promo_codes')
    .select('*')
    .order('is_system', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return data || []
}

export async function createPromoCode(formData: FormData) {
  await verifyAdmin()
  const supabase = createAdminClient()

  const name = (formData.get('name') as string)?.trim()
  const codeRaw = ((formData.get('code') as string) || '').trim()
  const code = codeRaw ? codeRaw.toUpperCase() : null
  const type = formData.get('type') as PromoCodeType
  const discountValue = parseOptionalNumber(formData.get('discount_value'))
  const nthCup = parseOptionalInt(formData.get('nth_cup'))
  const referralThreshold = parseOptionalInt(formData.get('referral_threshold'))
  const validityDays = parseOptionalInt(formData.get('validity_days'))
  const minAmount = parseOptionalNumber(formData.get('min_amount')) ?? 0
  const maxDiscountAmount = parseOptionalNumber(
    formData.get('max_discount_amount')
  )
  const maxRedemptionsTotal = parseOptionalInt(
    formData.get('max_redemptions_total')
  )
  const maxRedemptionsPerUser = parseOptionalInt(
    formData.get('max_redemptions_per_user')
  )
  const startsAt = parseOptionalDatetime(formData.get('starts_at'))
  const endsAt = parseOptionalDatetime(formData.get('ends_at'))
  const appliesToAllUsers = formData.get('applies_to_all_users') !== 'false'
  const isActive = formData.get('is_active') !== 'false'
  const userIds = parseUserIds(formData.get('user_ids') as string | null)

  if (!name) {
    return { error: 'Name is required' }
  }
  if (!type || !['percent', 'fixed', 'nth_cup', 'referral'].includes(type)) {
    return { error: 'Valid type is required' }
  }
  if (discountValue === null) {
    return { error: 'Discount value is required' }
  }

  const { data: promo, error } = await supabase
    .from('promo_codes')
    .insert({
      name,
      code,
      type,
      discount_value: discountValue,
      nth_cup: type === 'nth_cup' ? nthCup : null,
      referral_threshold: type === 'referral' ? referralThreshold : null,
      validity_days: validityDays,
      min_amount: minAmount,
      max_discount_amount: maxDiscountAmount,
      max_redemptions_total: maxRedemptionsTotal,
      max_redemptions_per_user: maxRedemptionsPerUser,
      starts_at: startsAt,
      ends_at: endsAt,
      applies_to_all_users: appliesToAllUsers,
      is_system: false,
      is_active: isActive,
    })
    .select('id')
    .single()

  if (error) {
    return { error: error.message }
  }

  if (!appliesToAllUsers && userIds.length > 0 && promo?.id) {
    const { error: usersError } = await supabase.from('promo_code_users').insert(
      userIds.map((user_id) => ({
        promo_code_id: promo.id,
        user_id,
      }))
    )
    if (usersError) {
      return { error: usersError.message }
    }
  }

  revalidatePath('/dashboard/promo-codes')
  return { success: true }
}

export async function updatePromoCode(id: string, formData: FormData) {
  await verifyAdmin()
  const supabase = createAdminClient()

  const { data: existing, error: fetchError } = await supabase
    .from('promo_codes')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchError || !existing) {
    return { error: fetchError?.message || 'Promo code not found' }
  }

  if (existing.is_system) {
    const discountValue = parseOptionalNumber(formData.get('discount_value'))
    const nthCup = parseOptionalInt(formData.get('nth_cup'))
    const referralThreshold = parseOptionalInt(
      formData.get('referral_threshold')
    )
    const validityDays = parseOptionalInt(formData.get('validity_days'))
    const isActive = formData.get('is_active') === 'true'

    if (discountValue === null) {
      return { error: 'Discount value is required' }
    }

    const updatePayload: Record<string, unknown> = {
      discount_value: discountValue,
      validity_days: validityDays,
      is_active: isActive,
      updated_at: new Date().toISOString(),
    }

    if (existing.type === 'nth_cup') {
      updatePayload.nth_cup = nthCup
    }
    if (existing.type === 'referral') {
      updatePayload.referral_threshold = referralThreshold
    }

    const { error } = await supabase
      .from('promo_codes')
      .update(updatePayload)
      .eq('id', id)

    if (error) {
      return { error: error.message }
    }

    revalidatePath('/dashboard/promo-codes')
    return { success: true }
  }

  const name = (formData.get('name') as string)?.trim()
  const codeRaw = ((formData.get('code') as string) || '').trim()
  const code = codeRaw ? codeRaw.toUpperCase() : null
  const type = formData.get('type') as PromoCodeType
  const discountValue = parseOptionalNumber(formData.get('discount_value'))
  const nthCup = parseOptionalInt(formData.get('nth_cup'))
  const referralThreshold = parseOptionalInt(formData.get('referral_threshold'))
  const validityDays = parseOptionalInt(formData.get('validity_days'))
  const minAmount = parseOptionalNumber(formData.get('min_amount')) ?? 0
  const maxDiscountAmount = parseOptionalNumber(
    formData.get('max_discount_amount')
  )
  const maxRedemptionsTotal = parseOptionalInt(
    formData.get('max_redemptions_total')
  )
  const maxRedemptionsPerUser = parseOptionalInt(
    formData.get('max_redemptions_per_user')
  )
  const startsAt = parseOptionalDatetime(formData.get('starts_at'))
  const endsAt = parseOptionalDatetime(formData.get('ends_at'))
  const appliesToAllUsers = formData.get('applies_to_all_users') !== 'false'
  const isActive = formData.get('is_active') !== 'false'
  const userIdsRaw = formData.get('user_ids') as string | null
  const hasUserIdsField = formData.has('user_ids')
  const userIds = parseUserIds(userIdsRaw)

  if (!name) {
    return { error: 'Name is required' }
  }
  if (!type || !['percent', 'fixed', 'nth_cup', 'referral'].includes(type)) {
    return { error: 'Valid type is required' }
  }
  if (discountValue === null) {
    return { error: 'Discount value is required' }
  }

  const { error } = await supabase
    .from('promo_codes')
    .update({
      name,
      code,
      type,
      discount_value: discountValue,
      nth_cup: type === 'nth_cup' ? nthCup : null,
      referral_threshold: type === 'referral' ? referralThreshold : null,
      validity_days: validityDays,
      min_amount: minAmount,
      max_discount_amount: maxDiscountAmount,
      max_redemptions_total: maxRedemptionsTotal,
      max_redemptions_per_user: maxRedemptionsPerUser,
      starts_at: startsAt,
      ends_at: endsAt,
      applies_to_all_users: appliesToAllUsers,
      is_active: isActive,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) {
    return { error: error.message }
  }

  if (hasUserIdsField) {
    await supabase.from('promo_code_users').delete().eq('promo_code_id', id)
    if (!appliesToAllUsers && userIds.length > 0) {
      const { error: usersError } = await supabase
        .from('promo_code_users')
        .insert(
          userIds.map((user_id) => ({
            promo_code_id: id,
            user_id,
          }))
        )
      if (usersError) {
        return { error: usersError.message }
      }
    }
  }

  revalidatePath('/dashboard/promo-codes')
  return { success: true }
}

export async function deletePromoCode(id: string) {
  await verifyAdmin()
  const supabase = createAdminClient()

  const { data: existing, error: fetchError } = await supabase
    .from('promo_codes')
    .select('id, is_system')
    .eq('id', id)
    .single()

  if (fetchError || !existing) {
    return { error: fetchError?.message || 'Promo code not found' }
  }

  if (existing.is_system) {
    return { error: 'System promo codes cannot be deleted' }
  }

  const { error } = await supabase.from('promo_codes').delete().eq('id', id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/dashboard/promo-codes')
  return { success: true }
}

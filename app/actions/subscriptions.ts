'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

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

export async function getSubscriptionTiers() {
  await verifyAdmin()
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('subscription_tiers')
    .select('*')
    .order('price', { ascending: true })

  if (error) {
    throw new Error(error.message)
  }

  return data || []
}

export async function getSubscriptionTierById(id: string) {
  await verifyAdmin()
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('subscription_tiers')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return data
}

export async function createSubscriptionTier(formData: FormData) {
  await verifyAdmin()
  const supabase = createAdminClient()

  const { count } = await supabase
    .from('subscription_tiers')
    .select('*', { count: 'exact', head: true })

  if (count && count >= 3) {
    return { error: 'Maximum of 3 subscription tiers allowed' }
  }

  const name = formData.get('name') as string
  const description = formData.get('description') as string
  const price = parseFloat(formData.get('price') as string)
  const period = formData.get('period') as string
  const couponPerDay = parseInt(formData.get('coupon_per_day') as string)

  const { error } = await supabase.from('subscription_tiers').insert({
    name,
    description,
    price,
    period,
    coupon_per_day: couponPerDay,
  })

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/dashboard/subscriptions')
  return { success: true }
}

export async function updateSubscriptionTier(id: string, formData: FormData) {
  await verifyAdmin()
  const supabase = createAdminClient()

  const name = formData.get('name') as string
  const description = formData.get('description') as string
  const price = parseFloat(formData.get('price') as string)
  const period = formData.get('period') as string
  const couponPerDay = parseInt(formData.get('coupon_per_day') as string)

  const { error } = await supabase
    .from('subscription_tiers')
    .update({
      name,
      description,
      price,
      period,
      coupon_per_day: couponPerDay,
    })
    .eq('id', id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/dashboard/subscriptions')
  return { success: true }
}

export async function deleteSubscriptionTier(id: string) {
  await verifyAdmin()
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('subscription_tiers')
    .delete()
    .eq('id', id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/dashboard/subscriptions')
  return { success: true }
}

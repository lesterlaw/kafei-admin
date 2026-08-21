'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'

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

export async function getProducts() {
  await verifyAdmin()
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return data || []
}

export async function getAddOns() {
  await verifyAdmin()
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('add_ons')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return data || []
}

export async function getOrders() {
  try {
    await verifyAdmin()
    const supabase = createAdminClient()
    const embedded = await supabase
      .from('orders')
      .select('*, users(email, full_name, phone), kiosks(name, location, address)')
      .order('created_at', { ascending: false })

    if (!embedded.error) {
      return embedded.data || []
    }

    console.error('getOrders embed failed, falling back:', embedded.error.message)
    const fallback = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })

    if (fallback.error) {
      console.error('getOrders:', fallback.error.message)
      return []
    }

    return fallback.data || []
  } catch (error) {
    console.error('getOrders:', error)
    return []
  }
}

export async function getKiosks() {
  await verifyAdmin()
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('kiosks')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return data || []
}

export async function getTransactions() {
  await verifyAdmin()
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('transactions')
    .select('*, users(email, full_name)')
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return data || []
}

export async function getCoupons() {
  await verifyAdmin()
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('coupons')
    .select('*, users(email, full_name)')
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return data || []
}

export async function getBanners() {
  await verifyAdmin()
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('banners')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })

    if (error) {
      console.error('getBanners:', error.message)
      return []
    }

    return data || []
  } catch (error) {
    console.error('getBanners:', error)
    return []
  }
}

export async function getPromoCodes() {
  await verifyAdmin()
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('promo_codes')
      .select('*')
      .order('is_system', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) {
      console.error('getPromoCodes:', error.message)
      return []
    }

    return data || []
  } catch (error) {
    console.error('getPromoCodes:', error)
    return []
  }
}

export async function getSupportTickets() {
  try {
    await verifyAdmin()
    const supabase = createAdminClient()
    const embedded = await supabase
      .from('support_tickets')
      .select('*, users(email, full_name, phone)')
      .order('created_at', { ascending: false })

    if (!embedded.error) {
      return embedded.data || []
    }

    console.error(
      'getSupportTickets embed failed, falling back:',
      embedded.error.message
    )
    const fallback = await supabase
      .from('support_tickets')
      .select('*')
      .order('created_at', { ascending: false })

    if (fallback.error) {
      console.error('getSupportTickets:', fallback.error.message)
      return []
    }

    return fallback.data || []
  } catch (error) {
    console.error('getSupportTickets:', error)
    return []
  }
}

export async function getReferrals() {
  await verifyAdmin()
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('referrals')
    .select('*, referrer:users!referrals_referrer_id_fkey(email, full_name), referred:users!referrals_referred_id_fkey(email, full_name)')
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return data || []
}


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

export async function getOrderById(id: string) {
  await verifyAdmin()
  try {
    const supabase = createAdminClient()
    const embedded = await supabase
      .from('orders')
      .select('*, users(*), kiosks(*), order_items(*, products(*))')
      .eq('id', id)
      .maybeSingle()

    if (!embedded.error && embedded.data) {
      return embedded.data
    }

    if (embedded.error && embedded.error.code !== 'PGRST116') {
      console.error('getOrderById embed failed, falling back:', embedded.error.message)
    }

    const fallback = await supabase
      .from('orders')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (fallback.error || !fallback.data) {
      return null
    }

    const order = fallback.data as Record<string, unknown>
    const [{ data: user }, { data: kiosk }, { data: items }] = await Promise.all([
      order.user_id
        ? supabase.from('users').select('*').eq('id', order.user_id).maybeSingle()
        : Promise.resolve({ data: null }),
      order.kiosk_id
        ? supabase.from('kiosks').select('*').eq('id', order.kiosk_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from('order_items')
        .select('*, products(*)')
        .eq('order_id', id),
    ])

    return {
      ...order,
      users: user || null,
      kiosks: kiosk || null,
      order_items: items || [],
    }
  } catch (error) {
    console.error('getOrderById:', error)
    return null
  }
}

export async function updateOrderStatus(id: string, status: string) {
  await verifyAdmin()
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('orders')
    .update({ status })
    .eq('id', id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/dashboard/orders')
  revalidatePath(`/dashboard/orders/${id}`)
  return { success: true }
}

export async function deleteOrder(id: string) {
  await verifyAdmin()
  const supabase = createAdminClient()
  const { error } = await supabase.from('orders').delete().eq('id', id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/dashboard/orders')
  return { success: true }
}





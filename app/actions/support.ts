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

export async function getSupportTicketById(id: string) {
  await verifyAdmin()
  try {
    const supabase = createAdminClient()
    const embedded = await supabase
      .from('support_tickets')
      .select('*, users(*)')
      .eq('id', id)
      .maybeSingle()

    if (!embedded.error && embedded.data) {
      return embedded.data
    }

    const fallback = await supabase
      .from('support_tickets')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (fallback.error || !fallback.data) {
      return null
    }

    let user = null
    if (fallback.data.user_id) {
      const { data } = await supabase
        .from('users')
        .select('*')
        .eq('id', fallback.data.user_id)
        .maybeSingle()
      user = data
    }

    return { ...fallback.data, users: user }
  } catch (error) {
    console.error('getSupportTicketById:', error)
    return null
  }
}

export async function updateTicketStatus(id: string, status: string) {
  await verifyAdmin()
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('support_tickets')
    .update({ status })
    .eq('id', id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/dashboard/support')
  revalidatePath(`/dashboard/support/${id}`)
  return { success: true }
}

export async function deleteTicket(id: string) {
  await verifyAdmin()
  const supabase = createAdminClient()
  const { error } = await supabase.from('support_tickets').delete().eq('id', id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/dashboard/support')
  return { success: true }
}





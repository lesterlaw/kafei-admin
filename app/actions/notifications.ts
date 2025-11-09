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

export async function getNotifications() {
  await verifyAdmin()
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return data || []
}

export async function getNotificationById(id: string) {
  await verifyAdmin()
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return data
}

export async function createNotification(formData: FormData) {
  await verifyAdmin()
  const supabase = createAdminClient()

  const { count } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })

  if (count && count >= 5) {
    return { error: 'Maximum of 5 notification templates allowed' }
  }

  const title = formData.get('title') as string
  const message = formData.get('message') as string
  const triggerEvent = formData.get('trigger_event') as string
  const isActive = formData.get('is_active') === 'true'

  const { error } = await supabase.from('notifications').insert({
    title,
    message,
    trigger_event: triggerEvent,
    is_active: isActive,
  })

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/dashboard/notifications')
  return { success: true }
}

export async function updateNotification(id: string, formData: FormData) {
  await verifyAdmin()
  const supabase = createAdminClient()

  const title = formData.get('title') as string
  const message = formData.get('message') as string
  const triggerEvent = formData.get('trigger_event') as string
  const isActive = formData.get('is_active') === 'true'

  const { error } = await supabase
    .from('notifications')
    .update({
      title,
      message,
      trigger_event: triggerEvent,
      is_active: isActive,
    })
    .eq('id', id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/dashboard/notifications')
  return { success: true }
}

export async function deleteNotification(id: string) {
  await verifyAdmin()
  const supabase = createAdminClient()
  const { error } = await supabase.from('notifications').delete().eq('id', id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/dashboard/notifications')
  return { success: true }
}


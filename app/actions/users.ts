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

export async function getUsers() {
  await verifyAdmin()
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return data || []
}

export async function getUserById(id: string) {
  await verifyAdmin()
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return data
}

export async function createUser(formData: FormData) {
  await verifyAdmin()
  const supabase = createAdminClient()

  const email = formData.get('email') as string
  const fullName = formData.get('full_name') as string
  const phone = formData.get('phone') as string
  const password = formData.get('password') as string

  // Generate referral code
  const referralCode = Math.random().toString(36).substring(2, 9).toUpperCase()

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (authError || !authData.user) {
    return { error: authError?.message || 'Failed to create user' }
  }

  const { error: userError } = await supabase.from('users').insert({
    id: authData.user.id,
    email,
    full_name: fullName,
    phone,
    referral_code: referralCode,
  })

  if (userError) {
    return { error: userError.message }
  }

  revalidatePath('/dashboard/users')
  return { success: true }
}

export async function updateUser(id: string, formData: FormData) {
  await verifyAdmin()
  const supabase = createAdminClient()

  const fullName = formData.get('full_name') as string
  const phone = formData.get('phone') as string
  const email = formData.get('email') as string

  const { error } = await supabase
    .from('users')
    .update({ full_name: fullName, phone, email })
    .eq('id', id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/dashboard/users')
  return { success: true }
}

export async function updateUserStatus(id: string, isBlocked: boolean) {
  await verifyAdmin()
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('users')
    .update({ is_blocked: isBlocked })
    .eq('id', id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/dashboard/users')
  return { success: true }
}

export async function deleteUser(id: string) {
  await verifyAdmin()
  const supabase = createAdminClient()
  const { error } = await supabase.from('users').delete().eq('id', id)

  if (error) {
    return { error: error.message }
  }

  await supabase.auth.admin.deleteUser(id)
  revalidatePath('/dashboard/users')
  return { success: true }
}

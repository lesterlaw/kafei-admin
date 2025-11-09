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

export async function getAdmins() {
  await verifyAdmin()
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('admins')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return data || []
}

export async function getAdminById(id: string) {
  await verifyAdmin()
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('admins')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return data
}

export async function createAdmin(formData: FormData) {
  await verifyAdmin()
  const supabase = createAdminClient()

  const { count } = await supabase
    .from('admins')
    .select('*', { count: 'exact', head: true })

  if (count && count >= 3) {
    return { error: 'Maximum of 3 admins allowed' }
  }

  const email = formData.get('email') as string
  const fullName = formData.get('full_name') as string
  const password = formData.get('password') as string

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (authError || !authData.user) {
    return { error: authError?.message || 'Failed to create admin' }
  }

  const { error: adminError } = await supabase.from('admins').insert({
    id: authData.user.id,
    email,
    full_name: fullName,
  })

  if (adminError) {
    return { error: adminError.message }
  }

  revalidatePath('/dashboard/admin-management')
  return { success: true }
}

export async function updateAdmin(id: string, formData: FormData) {
  await verifyAdmin()
  const supabase = createAdminClient()

  const fullName = formData.get('full_name') as string
  const email = formData.get('email') as string

  const { error } = await supabase
    .from('admins')
    .update({ full_name: fullName, email })
    .eq('id', id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/dashboard/admin-management')
  return { success: true }
}

export async function deleteAdmin(id: string) {
  await verifyAdmin()
  const supabase = createAdminClient()

  const { count } = await supabase
    .from('admins')
    .select('*', { count: 'exact', head: true })

  if (count && count <= 1) {
    return { error: 'Cannot delete the last admin' }
  }

  const { error } = await supabase.from('admins').delete().eq('id', id)

  if (error) {
    return { error: error.message }
  }

  await supabase.auth.admin.deleteUser(id)
  revalidatePath('/dashboard/admin-management')
  return { success: true }
}

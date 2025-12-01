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

export async function getSubpages() {
  await verifyAdmin()
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('subpages')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return data || []
}

export async function getSubpageById(id: string) {
  await verifyAdmin()
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('subpages')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return data
}

export async function getSubpageBySlug(slug: string) {
  await verifyAdmin()
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('subpages')
    .select('*')
    .eq('slug', slug)
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return data
}

export async function createSubpage(formData: FormData) {
  await verifyAdmin()
  const supabase = createAdminClient()

  const { count } = await supabase
    .from('subpages')
    .select('*', { count: 'exact', head: true })

  if (count && count >= 5) {
    return { error: 'Maximum of 5 subpages allowed' }
  }

  const title = formData.get('title') as string
  const slug = formData.get('slug') as string
  const content = formData.get('content') as string

  const { error } = await supabase.from('subpages').insert({
    title,
    slug,
    content,
  })

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/dashboard/subpages')
  return { success: true }
}

export async function updateSubpage(id: string, formData: FormData) {
  await verifyAdmin()
  const supabase = createAdminClient()

  const title = formData.get('title') as string
  const slug = formData.get('slug') as string
  const content = formData.get('content') as string

  const { error } = await supabase
    .from('subpages')
    .update({
      title,
      slug,
      content,
    })
    .eq('id', id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/dashboard/subpages')
  return { success: true }
}

export async function deleteSubpage(id: string) {
  await verifyAdmin()
  const supabase = createAdminClient()
  const { error } = await supabase.from('subpages').delete().eq('id', id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/dashboard/subpages')
  return { success: true }
}





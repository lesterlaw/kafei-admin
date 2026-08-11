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

export async function getBanners() {
  await verifyAdmin()
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('banners')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return data || []
}

export async function createBanner(formData: FormData) {
  await verifyAdmin()
  const supabase = createAdminClient()

  const imageUrl = (formData.get('image_url') as string)?.trim()
  const title = ((formData.get('title') as string) || '').trim() || null
  const linkUrl = ((formData.get('link_url') as string) || '').trim() || null
  const sortOrderRaw = formData.get('sort_order') as string
  const sortOrder = sortOrderRaw ? parseInt(sortOrderRaw, 10) : 0
  const isActive = formData.get('is_active') === 'true'

  if (!imageUrl) {
    return { error: 'Image URL is required' }
  }

  const { error } = await supabase.from('banners').insert({
    image_url: imageUrl,
    title,
    link_url: linkUrl,
    sort_order: Number.isNaN(sortOrder) ? 0 : sortOrder,
    is_active: isActive,
  })

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/dashboard/banners')
  return { success: true }
}

export async function updateBanner(id: string, formData: FormData) {
  await verifyAdmin()
  const supabase = createAdminClient()

  const imageUrl = (formData.get('image_url') as string)?.trim()
  const title = ((formData.get('title') as string) || '').trim() || null
  const linkUrl = ((formData.get('link_url') as string) || '').trim() || null
  const sortOrderRaw = formData.get('sort_order') as string
  const sortOrder = sortOrderRaw ? parseInt(sortOrderRaw, 10) : 0
  const isActive = formData.get('is_active') === 'true'

  if (!imageUrl) {
    return { error: 'Image URL is required' }
  }

  const { error } = await supabase
    .from('banners')
    .update({
      image_url: imageUrl,
      title,
      link_url: linkUrl,
      sort_order: Number.isNaN(sortOrder) ? 0 : sortOrder,
      is_active: isActive,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/dashboard/banners')
  return { success: true }
}

export async function deleteBanner(id: string) {
  await verifyAdmin()
  const supabase = createAdminClient()
  const { error } = await supabase.from('banners').delete().eq('id', id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/dashboard/banners')
  return { success: true }
}

export async function reorderBanners(
  items: { id: string; sort_order: number }[]
) {
  await verifyAdmin()
  const supabase = createAdminClient()

  if (!items?.length) {
    return { error: 'No sort order provided' }
  }

  const now = new Date().toISOString()
  const results = await Promise.all(
    items.map((item) =>
      supabase
        .from('banners')
        .update({ sort_order: item.sort_order, updated_at: now })
        .eq('id', item.id)
    )
  )

  const failed = results.find((r) => r.error)
  if (failed?.error) {
    return { error: failed.error.message }
  }

  revalidatePath('/dashboard/banners')
  return { success: true }
}

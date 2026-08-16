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

async function resolveBannerImageUrl(
  supabase: ReturnType<typeof createAdminClient>,
  formData: FormData,
  existingUrl?: string | null
) {
  const file = formData.get('image')
  const urlField = ((formData.get('image_url') as string) || '').trim()

  if (file instanceof File && file.size > 0) {
    await supabase.storage.createBucket('product-images', { public: true }).then(
      () => undefined,
      () => undefined
    )

    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const path = `banners/${crypto.randomUUID()}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())
    const { error } = await supabase.storage.from('product-images').upload(path, buffer, {
      contentType: file.type || 'image/jpeg',
      upsert: false,
    })

    if (error) {
      throw new Error(
        `Image upload failed: ${error.message}. You can also paste an image URL instead.`
      )
    }

    const { data } = supabase.storage.from('product-images').getPublicUrl(path)
    return data.publicUrl
  }

  if (urlField) {
    return urlField
  }

  return existingUrl || null
}

export async function createBanner(formData: FormData) {
  await verifyAdmin()
  const supabase = createAdminClient()

  const title = ((formData.get('title') as string) || '').trim() || null
  const linkUrl = ((formData.get('link_url') as string) || '').trim() || null
  const sortOrderRaw = formData.get('sort_order') as string
  const sortOrder = sortOrderRaw ? parseInt(sortOrderRaw, 10) : 0
  const isActive = formData.get('is_active') === 'true'

  let imageUrl: string | null = null
  try {
    imageUrl = await resolveBannerImageUrl(supabase, formData)
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Image upload failed' }
  }

  if (!imageUrl) {
    return { error: 'Upload an image or paste an image URL' }
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

  const title = ((formData.get('title') as string) || '').trim() || null
  const linkUrl = ((formData.get('link_url') as string) || '').trim() || null
  const sortOrderRaw = formData.get('sort_order') as string
  const sortOrder = sortOrderRaw ? parseInt(sortOrderRaw, 10) : 0
  const isActive = formData.get('is_active') === 'true'

  const { data: existing } = await supabase
    .from('banners')
    .select('image_url')
    .eq('id', id)
    .maybeSingle()

  let imageUrl: string | null = null
  try {
    imageUrl = await resolveBannerImageUrl(
      supabase,
      formData,
      existing?.image_url || null
    )
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Image upload failed' }
  }

  if (!imageUrl) {
    return { error: 'Upload an image or paste an image URL' }
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

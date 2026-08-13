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

export async function getProductById(id: string) {
  await verifyAdmin()
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return data
}

async function resolveProductImageUrl(
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
    const path = `${crypto.randomUUID()}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())
    const { error } = await supabase.storage
      .from('product-images')
      .upload(path, buffer, {
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

export async function createProduct(formData: FormData) {
  await verifyAdmin()
  const supabase = createAdminClient()

  const name = formData.get('name') as string
  const description = formData.get('description') as string
  const price = parseFloat(formData.get('price') as string)
  const temperature = formData.get('temperature') as 'hot' | 'cold' | 'both' | null
  const isHidden = formData.get('is_hidden') === 'true'
  const itemCodeRaw =
    (formData.get('cofeplus_item_code') as string | null)?.trim() || ''
  const cofeplusItemCode = itemCodeRaw || null

  let imageUrl: string | null = null
  try {
    imageUrl = await resolveProductImageUrl(supabase, formData)
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Image upload failed' }
  }

  const { error } = await supabase.from('products').insert({
    name,
    description,
    price,
    temperature: temperature || null,
    is_hidden: isHidden,
    cofeplus_item_code: cofeplusItemCode,
    image_url: imageUrl,
  })

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/dashboard/products')
  return { success: true }
}

export async function updateProduct(id: string, formData: FormData) {
  await verifyAdmin()
  const supabase = createAdminClient()

  const name = formData.get('name') as string
  const description = formData.get('description') as string
  const price = parseFloat(formData.get('price') as string)
  const temperature = formData.get('temperature') as 'hot' | 'cold' | 'both' | null
  const isHidden = formData.get('is_hidden') === 'true'
  const itemCodeRaw =
    (formData.get('cofeplus_item_code') as string | null)?.trim() || ''
  const cofeplusItemCode = itemCodeRaw || null

  let imageUrl: string | null = null
  try {
    const { data: existing } = await supabase
      .from('products')
      .select('image_url')
      .eq('id', id)
      .single()
    imageUrl = await resolveProductImageUrl(
      supabase,
      formData,
      existing?.image_url || null
    )
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Image upload failed' }
  }

  const { error } = await supabase
    .from('products')
    .update({
      name,
      description,
      price,
      temperature: temperature || null,
      is_hidden: isHidden,
      cofeplus_item_code: cofeplusItemCode,
      image_url: imageUrl,
    })
    .eq('id', id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/dashboard/products')
  return { success: true }
}

export async function deleteProduct(id: string) {
  await verifyAdmin()
  const supabase = createAdminClient()
  const { error } = await supabase.from('products').delete().eq('id', id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/dashboard/products')
  return { success: true }
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

export async function createAddOn(formData: FormData) {
  await verifyAdmin()
  const supabase = createAdminClient()

  const name = formData.get('name') as string
  const description = formData.get('description') as string
  const price = parseFloat(formData.get('price') as string)
  const temperature = formData.get('temperature') as 'hot' | 'cold' | 'both' | null
  const isHidden = formData.get('is_hidden') === 'true'

  const { error } = await supabase.from('add_ons').insert({
    name,
    description,
    price,
    temperature: temperature || null,
    is_hidden: isHidden,
  })

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/dashboard/products/add-ons')
  return { success: true }
}

export async function updateAddOn(id: string, formData: FormData) {
  await verifyAdmin()
  const supabase = createAdminClient()

  const name = formData.get('name') as string
  const description = formData.get('description') as string
  const price = parseFloat(formData.get('price') as string)
  const temperature = formData.get('temperature') as 'hot' | 'cold' | 'both' | null
  const isHidden = formData.get('is_hidden') === 'true'

  const { error } = await supabase
    .from('add_ons')
    .update({
      name,
      description,
      price,
      temperature: temperature || null,
      is_hidden: isHidden,
    })
    .eq('id', id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/dashboard/products/add-ons')
  return { success: true }
}

export async function deleteAddOn(id: string) {
  await verifyAdmin()
  const supabase = createAdminClient()
  const { error } = await supabase.from('add_ons').delete().eq('id', id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/dashboard/products/add-ons')
  return { success: true }
}





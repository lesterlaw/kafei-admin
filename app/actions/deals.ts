'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import {
  dealDescriptionText,
  normalizeDealImages,
  sanitizeDealDescription,
} from '@/lib/deals'
import type { Deal } from '@/types/database'

export interface DealInput {
  title: string
  description: string
  image_urls: string[]
  link_url: string
  sort_order: number
  is_active: boolean
}

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

function toRow(input: DealInput) {
  const title = (input.title || '').trim()
  if (!title) {
    return { error: 'Title is required' as const }
  }

  const linkUrl = (input.link_url || '').trim()
  if (linkUrl && !/^https?:\/\//i.test(linkUrl)) {
    return { error: 'URL must start with http:// or https://' as const }
  }

  const description = sanitizeDealDescription(input.description || '')
  if (!dealDescriptionText(description)) {
    return { error: 'Description is required' as const }
  }

  const sortOrder = Number(input.sort_order)

  return {
    row: {
      title,
      description,
      image_urls: normalizeDealImages(input.image_urls),
      link_url: linkUrl || null,
      sort_order: Number.isFinite(sortOrder) ? Math.trunc(sortOrder) : 0,
      is_active: Boolean(input.is_active),
    },
  }
}

export async function getDeals(): Promise<Deal[]> {
  await verifyAdmin()
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('deals')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })

    if (error) {
      console.error('getDeals:', error.message)
      return []
    }

    return (data || []) as Deal[]
  } catch (error) {
    console.error('getDeals:', error)
    return []
  }
}

export async function getDealById(id: string): Promise<Deal | null> {
  await verifyAdmin()
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('deals')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  return (data as Deal | null) || null
}

export async function createDeal(input: DealInput) {
  await verifyAdmin()
  const parsed = toRow(input)
  if ('error' in parsed) {
    return { error: parsed.error }
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('deals')
    .insert(parsed.row)
    .select('id')
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/dashboard/deals')
  return { success: true, id: data.id as string }
}

export async function updateDeal(id: string, input: DealInput) {
  await verifyAdmin()
  const parsed = toRow(input)
  if ('error' in parsed) {
    return { error: parsed.error }
  }

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('deals')
    .update({ ...parsed.row, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/dashboard/deals')
  revalidatePath(`/dashboard/deals/${id}`)
  return { success: true, id }
}

export async function deleteDeal(id: string) {
  await verifyAdmin()
  const supabase = createAdminClient()
  const { error } = await supabase.from('deals').delete().eq('id', id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/dashboard/deals')
  return { success: true }
}

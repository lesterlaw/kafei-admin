'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getKioskDevice, issueKioskDeviceToken } from '@/lib/kiosk/device'
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

export async function getKiosks() {
  await verifyAdmin()
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('kiosks')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return data || []
}

export async function getKioskById(id: string) {
  await verifyAdmin()
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('kiosks')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    throw new Error(error.message)
  }

  const device = await getKioskDevice(id)
  return {
    ...data,
    has_device_token: Boolean(device?.device_token),
    device_token: device?.device_token || null,
    device_last_seen_at: device?.last_seen_at || null,
  }
}

export async function regenerateKioskDeviceToken(kioskId: string) {
  await verifyAdmin()
  const result = await issueKioskDeviceToken(kioskId)
  if (!result.ok) {
    return { error: result.error }
  }
  revalidatePath('/dashboard/kiosks')
  revalidatePath(`/dashboard/kiosks/${kioskId}`)
  return { success: true, token: result.token }
}

export async function createKiosk(formData: FormData) {
  await verifyAdmin()
  const supabase = createAdminClient()

  const name = formData.get('name') as string
  const location = formData.get('location') as string
  const address = formData.get('address') as string
  const detailsRaw = (formData.get('details') as string | null)?.trim() || ''
  const details = detailsRaw || null
  const latitude = formData.get('latitude') ? parseFloat(formData.get('latitude') as string) : null
  const longitude = formData.get('longitude') ? parseFloat(formData.get('longitude') as string) : null
  const isActive = formData.get('is_active') !== 'false'
  const podIdRaw = (formData.get('pod_id') as string | null)?.trim() || ''
  const podId = podIdRaw || null

  const { error } = await supabase.from('kiosks').insert({
    name,
    location,
    address,
    details,
    latitude,
    longitude,
    is_active: isActive,
    pod_id: podId,
  })

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/dashboard/kiosks')
  return { success: true }
}

export async function updateKiosk(id: string, formData: FormData) {
  await verifyAdmin()
  const supabase = createAdminClient()

  const name = formData.get('name') as string
  const location = formData.get('location') as string
  const address = formData.get('address') as string
  const detailsRaw = (formData.get('details') as string | null)?.trim() || ''
  const details = detailsRaw || null
  const latitude = formData.get('latitude') ? parseFloat(formData.get('latitude') as string) : null
  const longitude = formData.get('longitude') ? parseFloat(formData.get('longitude') as string) : null
  const isActive = formData.get('is_active') !== 'false'
  const podIdRaw = (formData.get('pod_id') as string | null)?.trim() || ''
  const podId = podIdRaw || null

  const { error } = await supabase
    .from('kiosks')
    .update({
      name,
      location,
      address,
      details,
      latitude,
      longitude,
      is_active: isActive,
      pod_id: podId,
    })
    .eq('id', id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/dashboard/kiosks')
  return { success: true }
}

export async function updateKioskStatus(id: string, isActive: boolean) {
  await verifyAdmin()
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('kiosks')
    .update({ is_active: isActive })
    .eq('id', id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/dashboard/kiosks')
  revalidatePath(`/dashboard/kiosks/${id}`)
  return { success: true }
}

export async function deleteKiosk(id: string) {
  await verifyAdmin()
  const supabase = createAdminClient()
  const { error } = await supabase.from('kiosks').delete().eq('id', id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/dashboard/kiosks')
  return { success: true }
}





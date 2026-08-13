'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { CofeplusEnvironment } from '@/lib/cofeplus/config'
import { syncCofeplusCatalog } from '@/lib/cofeplus/sync'
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

export async function runCofeplusCatalogSync(input: {
  environment: CofeplusEnvironment
  podId?: string
  upsertKafeiRecords?: boolean
}) {
  await verifyAdmin()
  const adminClient = createAdminClient()

  const result = await syncCofeplusCatalog(adminClient, {
    environment: input.environment === 'live' ? 'live' : 'test',
    podId: input.podId,
    upsertKafeiRecords: input.upsertKafeiRecords !== false,
  })

  if (result.ok) {
    revalidatePath('/dashboard/kiosks')
    revalidatePath('/dashboard/products')
    revalidatePath('/dashboard/api-test')
  }

  return result
}

export async function getLatestCofeplusSyncRun(
  environment: CofeplusEnvironment = 'test'
) {
  await verifyAdmin()
  const adminClient = createAdminClient()

  const { data, error } = await adminClient
    .from('cofeplus_sync_runs')
    .select('*')
    .eq('environment', environment === 'live' ? 'live' : 'test')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return data
}

export async function getSyncedCofeplusPods(
  environment: CofeplusEnvironment = 'test'
) {
  await verifyAdmin()
  const adminClient = createAdminClient()

  const { data, error } = await adminClient
    .from('cofeplus_pods')
    .select('*')
    .eq('environment', environment === 'live' ? 'live' : 'test')
    .order('pod_id', { ascending: true })

  if (error) {
    throw new Error(error.message)
  }

  return data || []
}

export async function getSyncedCofeplusMenuItems(input: {
  environment?: CofeplusEnvironment
  podId?: string
}) {
  await verifyAdmin()
  const adminClient = createAdminClient()
  const environment = input.environment === 'live' ? 'live' : 'test'

  let query = adminClient
    .from('cofeplus_menu_items')
    .select('*')
    .eq('environment', environment)
    .order('display', { ascending: true })

  if (input.podId?.trim()) {
    query = query.eq('pod_id', input.podId.trim())
  }

  const { data, error } = await query

  if (error) {
    throw new Error(error.message)
  }

  return data || []
}

export async function getOrSyncCofeplusMenu(input: {
  environment: CofeplusEnvironment
  podId?: string
}) {
  await verifyAdmin()
  const adminClient = createAdminClient()
  const environment = input.environment === 'live' ? 'live' : 'test'
  const podId = input.podId?.trim() || ''

  const load = async () => {
    const [pods, items] = await Promise.all([
      adminClient
        .from('cofeplus_pods')
        .select('pod_id, display, synced_at')
        .eq('environment', environment)
        .order('pod_id', { ascending: true }),
      adminClient
        .from('cofeplus_menu_items')
        .select(
          'item_code, display, category, price, out_of_stock, modifiers, raw, pod_id'
        )
        .eq('environment', environment)
        .order('display', { ascending: true }),
    ])

    if (pods.error) throw new Error(pods.error.message)
    if (items.error) throw new Error(items.error.message)

    const allItems = items.data || []
    return {
      pods: pods.data || [],
      items: podId ? allItems.filter((item) => item.pod_id === podId) : allItems,
    }
  }

  let cached = await load()
  let ranSync = false

  if (cached.pods.length === 0 || (podId && cached.items.length === 0)) {
    const result = await syncCofeplusCatalog(adminClient, {
      environment,
      podId: podId || undefined,
      upsertKafeiRecords: true,
    })
    if (!result.ok) {
      throw new Error(result.error || 'Sync failed')
    }
    ranSync = true
    cached = await load()
    revalidatePath('/dashboard/kiosks')
    revalidatePath('/dashboard/products')
    revalidatePath('/dashboard/api-test')
  }

  return {
    ...cached,
    ranSync,
    environment,
  }
}

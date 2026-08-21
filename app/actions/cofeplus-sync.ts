'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import {
  podAccessHint,
  type CofeplusEnvironment,
} from '@/lib/cofeplus/config'
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
  force?: boolean
}) {
  await verifyAdmin()
  const adminClient = createAdminClient()
  const environment = input.environment === 'live' ? 'live' : 'test'
  const podId = input.podId?.trim() || ''

  const load = async (filterPodId = podId) => {
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
      items: filterPodId
        ? allItems.filter((item) => item.pod_id === filterPodId)
        : allItems,
    }
  }

  try {
    let cached = await load()
    let ranSync = false
    const availablePodIds = () => cached.pods.map((pod) => pod.pod_id)
    const podKnown = !podId || cached.pods.some((pod) => pod.pod_id === podId)

    if (podId && cached.pods.length > 0 && !podKnown) {
      return {
        ok: false,
        pods: cached.pods,
        items: cached.items,
        ranSync,
        environment,
        error: podAccessHint(environment, podId, availablePodIds()),
      }
    }

    if (
      input.force ||
      cached.pods.length === 0 ||
      (podId && cached.items.length === 0 && podKnown)
    ) {
      const result = await syncCofeplusCatalog(adminClient, {
        environment,
        // Empty cache: list every pod this env can access. Never force a
        // Test pod onto Live (or the reverse) — that returns POD_ACCESS_DENIED.
        podId: cached.pods.length > 0 && podKnown && podId ? podId : undefined,
        upsertKafeiRecords: true,
      })
      ranSync = true
      cached = await load()
      revalidatePath('/dashboard/kiosks')
      revalidatePath('/dashboard/products')
      revalidatePath('/dashboard/api-test')

      if (!result.ok) {
        return {
          ok: false,
          pods: cached.pods,
          items: cached.items,
          ranSync,
          environment,
          error: result.error || 'Sync failed',
        }
      }
    }

    if (podId && cached.items.length === 0) {
      return {
        ok: false,
        pods: cached.pods,
        items: cached.items,
        ranSync,
        environment,
        error: cached.pods.some((pod) => pod.pod_id === podId)
          ? `No sellable items in the synced menu for ${podId}`
          : podAccessHint(environment, podId, availablePodIds()),
      }
    }

    return {
      ok: true,
      pods: cached.pods,
      items: cached.items,
      ranSync,
      environment,
    }
  } catch (err) {
    return {
      ok: false,
      pods: [],
      items: [],
      ranSync: false,
      environment,
      error: err instanceof Error ? err.message : 'Failed to load menu',
    }
  }
}

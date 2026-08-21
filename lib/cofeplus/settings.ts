import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  defaultPodForEnvironment,
  suggestPodForEnvironment,
  type CofeplusEnvironment,
} from '@/lib/cofeplus/config'

export const COFEPLUS_ENV_SETTING_KEY = 'cofeplus_environment'

export function asCofeplusEnvironment(
  value: string | null | undefined
): CofeplusEnvironment {
  return value === 'live' ? 'live' : 'test'
}

export async function getActiveCofeplusEnvironment(
  adminClient?: SupabaseClient
): Promise<CofeplusEnvironment> {
  const client = adminClient ?? createAdminClient()
  const { data, error } = await client
    .from('app_settings')
    .select('value')
    .eq('key', COFEPLUS_ENV_SETTING_KEY)
    .maybeSingle()

  if (error) {
    console.warn('[cofeplus] read active environment failed', error.message)
    return 'test'
  }

  return asCofeplusEnvironment(data?.value)
}

export async function setActiveCofeplusEnvironment(
  environment: CofeplusEnvironment,
  adminClient?: SupabaseClient
): Promise<CofeplusEnvironment> {
  const client = adminClient ?? createAdminClient()
  const next = asCofeplusEnvironment(environment)
  const { error } = await client.from('app_settings').upsert(
    {
      key: COFEPLUS_ENV_SETTING_KEY,
      value: next,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' }
  )

  if (error) {
    throw new Error(`Failed to save CofePlus environment: ${error.message}`)
  }

  await applyEnvironmentToKiosks(client, next)
  return next
}

/** Keep kiosk pod IDs on the machine that this environment can actually access. */
async function applyEnvironmentToKiosks(
  adminClient: SupabaseClient,
  environment: CofeplusEnvironment
) {
  const fallback = defaultPodForEnvironment(environment)
  const { data: kiosks, error } = await adminClient
    .from('kiosks')
    .select('id, pod_id')

  if (error || !kiosks?.length) {
    return
  }

  for (const kiosk of kiosks) {
    const current = typeof kiosk.pod_id === 'string' ? kiosk.pod_id.trim() : ''
    const next = current
      ? suggestPodForEnvironment(environment, current)
      : fallback
    if (!next || next === current) continue
    await adminClient.from('kiosks').update({ pod_id: next }).eq('id', kiosk.id)
  }
}

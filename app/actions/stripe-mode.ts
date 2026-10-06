'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import {
  asStripeMode,
  getActiveStripeMode,
  isStripeModeConfigured,
  setActiveStripeMode,
  stripeKeysForMode,
  type StripeMode,
} from '@/lib/stripe/mode'

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

export interface StripeModeStatus {
  mode: StripeMode
  test: { configured: boolean; webhook: boolean }
  live: { configured: boolean; webhook: boolean }
}

function modeInfo(mode: StripeMode) {
  return {
    configured: isStripeModeConfigured(mode),
    webhook: Boolean(stripeKeysForMode(mode).webhookSecret),
  }
}

export async function getStripeModeStatus(): Promise<StripeModeStatus> {
  await verifyAdmin()
  return {
    mode: await getActiveStripeMode(createAdminClient()),
    test: modeInfo('test'),
    live: modeInfo('live'),
  }
}

export async function saveStripeMode(mode: StripeMode) {
  await verifyAdmin()
  try {
    const saved = await setActiveStripeMode(asStripeMode(mode), createAdminClient())
    revalidatePath('/dashboard/payments')
    return { success: true as const, mode: saved }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Failed to save Stripe mode',
    }
  }
}

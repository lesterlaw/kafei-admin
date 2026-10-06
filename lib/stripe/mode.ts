import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

export type StripeMode = 'test' | 'live'

export const STRIPE_MODE_SETTING_KEY = 'stripe_mode'

export function asStripeMode(value: string | null | undefined): StripeMode {
  return value === 'live' ? 'live' : 'test'
}

export interface StripeModeKeys {
  secretKey: string | null
  publishableKey: string | null
  webhookSecret: string | null
}

function env(name: string): string | null {
  return process.env[name]?.trim() || null
}

/**
 * Keys per mode. Test falls back to the original single-mode variables
 * (STRIPE_SECRET_KEY etc.) so existing deployments keep working.
 */
export function stripeKeysForMode(mode: StripeMode): StripeModeKeys {
  if (mode === 'live') {
    return {
      secretKey: env('STRIPE_LIVE_SECRET_KEY'),
      publishableKey: env('STRIPE_LIVE_PUBLISHABLE_KEY'),
      webhookSecret: env('STRIPE_LIVE_WEBHOOK_SECRET'),
    }
  }
  return {
    secretKey: env('STRIPE_TEST_SECRET_KEY') || env('STRIPE_SECRET_KEY'),
    publishableKey:
      env('STRIPE_TEST_PUBLISHABLE_KEY') ||
      env('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'),
    webhookSecret:
      env('STRIPE_TEST_WEBHOOK_SECRET') || env('STRIPE_WEBHOOK_SECRET'),
  }
}

/** A mode can take payments once it has both a secret and a publishable key. */
export function isStripeModeConfigured(mode: StripeMode): boolean {
  const keys = stripeKeysForMode(mode)
  return Boolean(keys.secretKey && keys.publishableKey)
}

export async function getActiveStripeMode(
  adminClient?: SupabaseClient
): Promise<StripeMode> {
  const client = adminClient ?? createAdminClient()
  const { data, error } = await client
    .from('app_settings')
    .select('value')
    .eq('key', STRIPE_MODE_SETTING_KEY)
    .maybeSingle()

  if (error) {
    console.warn('[stripe] read active mode failed', error.message)
    return 'test'
  }

  const mode = asStripeMode(data?.value)
  // Never serve live without its keys: fall back to test rather than fail every payment
  return mode === 'live' && !isStripeModeConfigured('live') ? 'test' : mode
}

export async function setActiveStripeMode(
  mode: StripeMode,
  adminClient?: SupabaseClient
): Promise<StripeMode> {
  const next = asStripeMode(mode)
  if (!isStripeModeConfigured(next)) {
    throw new Error(
      `Stripe ${next} keys are not set on the server. Add them before switching.`
    )
  }

  const client = adminClient ?? createAdminClient()
  const { error } = await client.from('app_settings').upsert(
    {
      key: STRIPE_MODE_SETTING_KEY,
      value: next,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' }
  )

  if (error) {
    throw new Error(`Failed to save Stripe mode: ${error.message}`)
  }

  return next
}

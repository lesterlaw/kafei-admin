import Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  getActiveStripeMode,
  stripeKeysForMode,
  type StripeMode,
} from '@/lib/stripe/mode'

const API_VERSION = '2025-10-29.clover'

export function getStripeForMode(mode: StripeMode): Stripe {
  const { secretKey } = stripeKeysForMode(mode)
  if (!secretKey) {
    throw new Error(`Missing Stripe ${mode} secret key`)
  }
  return new Stripe(secretKey, { apiVersion: API_VERSION })
}

/** Stripe client for whichever mode (test or live) the admin has switched on. */
export async function getActiveStripe(adminClient?: SupabaseClient): Promise<{
  stripe: Stripe
  mode: StripeMode
  publishableKey: string | null
}> {
  const mode = await getActiveStripeMode(adminClient)
  return {
    stripe: getStripeForMode(mode),
    mode,
    publishableKey: stripeKeysForMode(mode).publishableKey,
  }
}

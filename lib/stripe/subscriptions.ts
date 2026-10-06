import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { StripeMode } from '@/lib/stripe/mode'

export type PaidPeriod = 'monthly' | 'annual'

// KAFEI membership products in Stripe test mode. Live products have different
// ids: set STRIPE_LIVE_MONTHLY_PRODUCT_ID / STRIPE_LIVE_ANNUAL_PRODUCT_ID, or
// leave them unset to use the account's only price for that billing interval.
const TEST_PRODUCT_IDS: Record<PaidPeriod, string> = {
  monthly: 'prod_VOBGjOAUI0K532',
  annual: 'prod_VOBGUyNZYktmcs',
}

export function stripeProductIdForPeriod(
  period: PaidPeriod,
  mode: StripeMode
): string | null {
  const suffix = period === 'annual' ? 'ANNUAL_PRODUCT_ID' : 'MONTHLY_PRODUCT_ID'
  if (mode === 'live') {
    return process.env[`STRIPE_LIVE_${suffix}`]?.trim() || null
  }
  return process.env[`STRIPE_${suffix}`]?.trim() || TEST_PRODUCT_IDS[period]
}

/** Active recurring price for the plan that bills once per month / year. */
export async function findRecurringPrice(
  stripe: Stripe,
  period: PaidPeriod,
  mode: StripeMode
): Promise<Stripe.Price> {
  const product = stripeProductIdForPeriod(period, mode)
  const interval = period === 'annual' ? 'year' : 'month'

  const prices = await stripe.prices.list({
    ...(product ? { product } : {}),
    active: true,
    type: 'recurring',
    limit: 100,
  })

  const matches = prices.data
    .filter(
      (price) =>
        price.recurring?.interval === interval &&
        (price.recurring?.interval_count ?? 1) === 1
    )
    .sort((a, b) => b.created - a.created)

  if (matches.length === 0) {
    throw new Error(
      product
        ? `Stripe product ${product} has no active ${period} price. Add one in the Stripe dashboard.`
        : `No active ${period} price found in Stripe ${mode} mode. Create the plan in the Stripe dashboard.`
    )
  }

  // Without a configured product, guessing between several prices could charge the wrong amount
  if (!product && matches.length > 1) {
    throw new Error(
      `Stripe ${mode} mode has several ${period} prices. Set the ${period} product id on the server.`
    )
  }

  return matches[0]
}

export async function ensureStripeCustomer(
  stripe: Stripe,
  adminClient: SupabaseClient,
  user: { id: string; email?: string | null }
): Promise<string> {
  const { data: row } = await adminClient
    .from('users')
    .select('stripe_customer_id, email, full_name')
    .eq('id', user.id)
    .maybeSingle()

  if (row?.stripe_customer_id) {
    try {
      const existing = await stripe.customers.retrieve(row.stripe_customer_id)
      if (!existing.deleted) return existing.id
    } catch {
      // Customer belongs to another Stripe account (keys were rotated): create a new one
    }
  }

  const customer = await stripe.customers.create({
    email: row?.email || user.email || undefined,
    name: row?.full_name || undefined,
    metadata: { user_id: user.id },
  })

  await adminClient
    .from('users')
    .update({ stripe_customer_id: customer.id })
    .eq('id', user.id)

  return customer.id
}

/** Client secret looks like pi_123_secret_abc; the PaymentIntent id is the part before _secret_. */
export function paymentIntentIdFromClientSecret(
  clientSecret: string | null | undefined
): string | null {
  if (!clientSecret || !clientSecret.startsWith('pi_')) return null
  return clientSecret.split('_secret_')[0] || null
}

export function subscriptionPeriodEnd(
  subscription: Stripe.Subscription
): Date | null {
  const end = subscription.items.data[0]?.current_period_end
  return typeof end === 'number' ? new Date(end * 1000) : null
}

export function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const subscription = invoice.parent?.subscription_details?.subscription
  if (!subscription) return null
  return typeof subscription === 'string' ? subscription : subscription.id
}

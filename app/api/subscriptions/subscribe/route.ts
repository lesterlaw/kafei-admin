import { NextRequest } from 'next/server'
import type Stripe from 'stripe'
import { createApiResponse, createApiError, authenticateRequest } from '@/lib/api/middleware'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActiveStripe } from '@/lib/stripe/server'
import {
  ensureStripeCustomer,
  findRecurringPrice,
  paymentIntentIdFromClientSecret,
} from '@/lib/stripe/subscriptions'
import { ensureWallet } from '@/lib/product-logic'

/** Start a recurring Stripe subscription for the Monthly or Annual plan. */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return createApiError('Unauthorized', 401)
    }

    const { tier_id } = await request.json()

    if (!tier_id) {
      return createApiError('Tier ID is required', 400)
    }

    const adminClient = createAdminClient()
    const { data: tier, error: tierError } = await adminClient
      .from('subscription_tiers')
      .select('*')
      .eq('id', tier_id)
      .single()

    if (tierError || !tier) {
      return createApiError('Invalid subscription tier', 404)
    }

    if (tier.period === 'free' || Number(tier.price) <= 0) {
      return createApiError('Free plan does not require payment', 400)
    }

    if (tier.period !== 'monthly' && tier.period !== 'annual') {
      return createApiError('Only Monthly or Annual can be purchased', 400)
    }

    const { stripe, mode, publishableKey } = await getActiveStripe(adminClient)
    const price = await findRecurringPrice(stripe, tier.period, mode)

    const wallet = await ensureWallet(adminClient, user.id)
    const priceCents = price.unit_amount ?? Math.round(Number(tier.price) * 100)
    const credit = Math.min(wallet.membership_credit_cents || 0, priceCents)
    const chargeCents = Math.max(0, priceCents - credit)

    if (chargeCents === 0) {
      return createApiResponse({
        client_secret: null,
        payment_intent_id: null,
        stripe_subscription_id: null,
        amount_cents: 0,
        currency: price.currency,
        credit_cents: credit,
        requires_payment: false,
        tier_id: tier.id,
      })
    }

    const customerId = await ensureStripeCustomer(stripe, adminClient, user)

    // Membership credit comes off the first invoice only
    let discounts: Stripe.SubscriptionCreateParams.Discount[] | undefined
    if (credit > 0) {
      const coupon = await stripe.coupons.create({
        amount_off: credit,
        currency: price.currency,
        duration: 'once',
        max_redemptions: 1,
        name: 'KAFEI membership credit',
      })
      discounts = [{ coupon: coupon.id }]
    }

    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: price.id }],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      discounts,
      metadata: {
        user_id: user.id,
        tier_id: tier.id,
        credit_cents: String(credit),
      },
      expand: ['latest_invoice.confirmation_secret'],
    })

    const invoice = subscription.latest_invoice as Stripe.Invoice | null
    const clientSecret = invoice?.confirmation_secret?.client_secret || null

    if (!clientSecret) {
      return createApiError('Stripe did not return a payment for this plan', 502)
    }

    return createApiResponse({
      client_secret: clientSecret,
      payment_intent_id: paymentIntentIdFromClientSecret(clientSecret),
      stripe_subscription_id: subscription.id,
      amount_cents: invoice?.amount_due ?? chargeCents,
      currency: price.currency,
      credit_cents: credit,
      requires_payment: true,
      tier_id: tier.id,
      publishable_key: publishableKey,
      stripe_mode: mode,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return createApiError(message, 500)
  }
}

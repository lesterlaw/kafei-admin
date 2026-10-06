import { NextRequest } from 'next/server'
import {
  createApiResponse,
  createApiError,
  authenticateRequest,
} from '@/lib/api/middleware'
import { createAdminClient } from '@/lib/supabase/admin'
import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getActiveStripe } from '@/lib/stripe/server'
import { subscriptionPeriodEnd } from '@/lib/stripe/subscriptions'
import {
  ensureWallet,
  activateReferralOnPaidSubscribe,
  getProductLogicSettings,
} from '@/lib/product-logic'

function periodEnd(period: 'monthly' | 'annual', from = new Date()): Date {
  const d = new Date(from)
  if (period === 'annual') {
    d.setFullYear(d.getFullYear() + 1)
  } else {
    d.setMonth(d.getMonth() + 1)
  }
  return d
}

/** Stop billing on any earlier Stripe subscription when the user switches plan. */
async function cancelPreviousStripeSubscriptions(
  stripe: Stripe,
  adminClient: SupabaseClient,
  userId: string,
  keepSubscriptionId: string
) {
  const { data: previous } = await adminClient
    .from('user_subscriptions')
    .select('stripe_subscription_id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .not('stripe_subscription_id', 'is', null)

  for (const row of previous || []) {
    const id = row.stripe_subscription_id as string | null
    if (!id || id === keepSubscriptionId) continue
    try {
      await stripe.subscriptions.cancel(id)
    } catch (err) {
      console.error('[subscribe/confirm] cancel previous subscription failed', err)
    }
  }
}

/** Confirm the Stripe payment and activate the subscription. */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return createApiError('Unauthorized', 401)
    }

    const { payment_intent_id, tier_id, stripe_subscription_id } =
      await request.json()
    if (!tier_id) {
      return createApiError('tier_id is required', 400)
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

    if (tier.period !== 'monthly' && tier.period !== 'annual') {
      return createApiError('Only Monthly or Annual can be purchased', 400)
    }

    const wallet = await ensureWallet(adminClient, user.id)
    const settings = await getProductLogicSettings(adminClient)
    const priceCents = Math.round(Number(tier.price) * 100)
    let creditApplied = Math.min(wallet.membership_credit_cents || 0, priceCents)
    let chargeCents = Math.max(0, priceCents - creditApplied)
    let currency = 'usd'
    let stripeSubscriptionId: string | null = null
    let stripePeriodEnd: Date | null = null

    if (stripe_subscription_id) {
      const { stripe } = await getActiveStripe(adminClient)
      const stripeSubscription = await stripe.subscriptions.retrieve(
        stripe_subscription_id,
        { expand: ['latest_invoice'] }
      )

      if (stripeSubscription.metadata?.user_id !== user.id) {
        return createApiError('Subscription does not belong to this user', 403)
      }
      if (stripeSubscription.metadata?.tier_id !== tier.id) {
        return createApiError('Subscription does not match this plan', 400)
      }

      const invoice = stripeSubscription.latest_invoice as Stripe.Invoice | null
      const paid =
        stripeSubscription.status === 'active' ||
        stripeSubscription.status === 'trialing' ||
        invoice?.status === 'paid'

      if (!paid) {
        return createApiError(
          `Payment not completed (status: ${stripeSubscription.status})`,
          400
        )
      }

      // Same subscription confirmed twice (retry after a dropped response)
      const { data: already } = await adminClient
        .from('user_subscriptions')
        .select('*, subscription_tiers(*)')
        .eq('stripe_subscription_id', stripeSubscription.id)
        .maybeSingle()
      if (already) {
        return createApiResponse({ subscription: already, credit_applied_cents: 0 })
      }

      await cancelPreviousStripeSubscriptions(
        stripe,
        adminClient,
        user.id,
        stripeSubscription.id
      )

      creditApplied = Math.min(
        wallet.membership_credit_cents || 0,
        Number(stripeSubscription.metadata?.credit_cents || 0)
      )
      chargeCents = invoice?.amount_paid ?? chargeCents
      currency = invoice?.currency || stripeSubscription.currency || currency
      stripeSubscriptionId = stripeSubscription.id
      stripePeriodEnd = subscriptionPeriodEnd(stripeSubscription)
    } else if (chargeCents > 0) {
      if (!payment_intent_id || payment_intent_id === 'credit-only') {
        return createApiError('payment_intent_id is required', 400)
      }

      const { stripe } = await getActiveStripe(adminClient)
      const intent = await stripe.paymentIntents.retrieve(payment_intent_id)

      if (intent.status !== 'succeeded') {
        return createApiError(
          `Payment not completed (status: ${intent.status})`,
          400
        )
      }

      if (intent.metadata?.user_id && intent.metadata.user_id !== user.id) {
        return createApiError('Payment does not belong to this user', 403)
      }
    }

    if (creditApplied > 0) {
      await adminClient
        .from('user_wallets')
        .update({
          membership_credit_cents:
            wallet.membership_credit_cents - creditApplied,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
    }

    // Cancel existing active subscriptions
    await adminClient
      .from('user_subscriptions')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('status', 'active')

    const start = new Date()
    const end = stripePeriodEnd || periodEnd(tier.period, start)

    const { data: subscription, error: subError } = await adminClient
      .from('user_subscriptions')
      .insert({
        user_id: user.id,
        tier_id: tier.id,
        status: 'active',
        start_date: start.toISOString(),
        end_date: end.toISOString(),
        renews_at: end.toISOString(),
        ...(stripeSubscriptionId
          ? { stripe_subscription_id: stripeSubscriptionId }
          : {}),
      })
      .select('*, subscription_tiers(*)')
      .single()

    if (subError || !subscription) {
      return createApiError(subError?.message || 'Failed to create subscription', 500)
    }

    await adminClient.from('transactions').insert({
      user_id: user.id,
      subscription_id: subscription.id,
      amount: chargeCents / 100,
      currency,
      status: 'success',
      payment_method: chargeCents > 0 ? 'stripe' : 'credit',
      stripe_payment_intent_id:
        chargeCents > 0 ? payment_intent_id : null,
    })

    try {
      await activateReferralOnPaidSubscribe(adminClient, user.id)
    } catch (err) {
      console.error('[subscribe/confirm] referral activation failed', err)
    }

    return createApiResponse({
      subscription,
      credit_applied_cents: creditApplied,
      settings_note: settings.membership_credit_cents,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return createApiError(message, 500)
  }
}

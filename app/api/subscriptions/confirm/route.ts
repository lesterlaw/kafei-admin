import { NextRequest } from 'next/server'
import {
  createApiResponse,
  createApiError,
  authenticateRequest,
} from '@/lib/api/middleware'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getStripeServer,
} from '@/lib/stripe/server'
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

/** Confirm a Stripe PaymentIntent and activate the subscription. */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return createApiError('Unauthorized', 401)
    }

    const { payment_intent_id, tier_id } = await request.json()
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
    const chargeCents = Math.max(0, priceCents - creditApplied)

    if (chargeCents > 0) {
      if (!payment_intent_id || payment_intent_id === 'credit-only') {
        return createApiError('payment_intent_id is required', 400)
      }

      const stripe = getStripeServer()
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
    const end = periodEnd(tier.period, start)

    const { data: subscription, error: subError } = await adminClient
      .from('user_subscriptions')
      .insert({
        user_id: user.id,
        tier_id: tier.id,
        status: 'active',
        start_date: start.toISOString(),
        end_date: end.toISOString(),
        renews_at: end.toISOString(),
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
      currency: 'usd',
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

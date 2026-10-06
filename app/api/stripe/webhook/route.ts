import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStripeForMode } from '@/lib/stripe/server'
import { stripeKeysForMode, type StripeMode } from '@/lib/stripe/mode'
import {
  invoiceSubscriptionId,
  subscriptionPeriodEnd,
} from '@/lib/stripe/subscriptions'

/**
 * Stripe Billing events for recurring plans.
 * - invoice.paid: extend the plan after each renewal charge
 * - customer.subscription.deleted: end the plan when Stripe stops billing
 */
export async function POST(request: NextRequest) {
  const signature = request.headers.get('stripe-signature')
  const modes = (['test', 'live'] as StripeMode[]).filter((mode) => {
    const keys = stripeKeysForMode(mode)
    return Boolean(keys.secretKey && keys.webhookSecret)
  })
  if (!signature || modes.length === 0) {
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 400 })
  }

  // Test and live each have their own endpoint secret: the one that verifies tells us the mode
  const payload = await request.text()
  let event: Stripe.Event | null = null
  let stripe: Stripe | null = null
  for (const mode of modes) {
    const candidate = getStripeForMode(mode)
    try {
      event = candidate.webhooks.constructEvent(
        payload,
        signature,
        stripeKeysForMode(mode).webhookSecret!
      )
      stripe = candidate
      break
    } catch {
      // Try the next mode's secret
    }
  }
  if (!event || !stripe) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const adminClient = createAdminClient()

  try {
    if (event.type === 'invoice.paid') {
      const invoice = event.data.object
      const stripeSubscriptionId = invoiceSubscriptionId(invoice)
      // The first invoice is recorded by /api/subscriptions/confirm
      if (stripeSubscriptionId && invoice.billing_reason === 'subscription_cycle') {
        const { data: row } = await adminClient
          .from('user_subscriptions')
          .select('id, user_id')
          .eq('stripe_subscription_id', stripeSubscriptionId)
          .maybeSingle()

        if (row) {
          const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId)
          const end = subscriptionPeriodEnd(subscription)
          if (end) {
            await adminClient
              .from('user_subscriptions')
              .update({
                status: 'active',
                end_date: end.toISOString(),
                renews_at: subscription.cancel_at_period_end ? null : end.toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq('id', row.id)
          }

          await adminClient.from('transactions').insert({
            user_id: row.user_id,
            subscription_id: row.id,
            amount: invoice.amount_paid / 100,
            currency: invoice.currency,
            status: 'success',
            payment_method: 'stripe',
            stripe_payment_intent_id: null,
          })
        }
      }
    } else if (event.type === 'customer.subscription.deleted') {
      await adminClient
        .from('user_subscriptions')
        .update({
          status: 'expired',
          renews_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('stripe_subscription_id', event.data.object.id)
        .eq('status', 'active')
    }
  } catch (error) {
    console.error('[stripe/webhook] handler failed', event.type, error)
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}

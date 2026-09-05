import { NextRequest } from 'next/server'
import { createApiResponse, createApiError, authenticateRequest } from '@/lib/api/middleware'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStripeServer } from '@/lib/stripe/server'
import { ensureWallet } from '@/lib/product-logic'

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

    const wallet = await ensureWallet(adminClient, user.id)
    const priceCents = Math.round(Number(tier.price) * 100)
    const credit = Math.min(wallet.membership_credit_cents || 0, priceCents)
    const chargeCents = Math.max(0, priceCents - credit)

    if (chargeCents === 0) {
      return createApiResponse({
        client_secret: null,
        payment_intent_id: null,
        amount_cents: 0,
        credit_cents: credit,
        requires_payment: false,
        tier_id: tier.id,
      })
    }

    const stripe = getStripeServer()
    const paymentIntent = await stripe.paymentIntents.create({
      amount: chargeCents,
      currency: 'usd',
      metadata: {
        user_id: user.id,
        tier_id: tier_id,
        credit_cents: String(credit),
      },
    })

    return createApiResponse({
      client_secret: paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id,
      amount_cents: chargeCents,
      credit_cents: credit,
      requires_payment: true,
      tier_id: tier.id,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return createApiError(message, 500)
  }
}

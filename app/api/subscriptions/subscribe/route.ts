import { NextRequest, NextResponse } from 'next/server'
import { createApiResponse, createApiError, authenticateRequest } from '@/lib/api/middleware'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getStripeServer } from '@/lib/stripe/server'

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

    const supabase = await createServerSupabaseClient()
    
    // Get tier details
    const { data: tier, error: tierError } = await supabase
      .from('subscription_tiers')
      .select('*')
      .eq('id', tier_id)
      .single()

    if (tierError || !tier) {
      return createApiError('Invalid subscription tier', 404)
    }

    // Create Stripe payment intent
    const stripe = getStripeServer()
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(tier.price * 100),
      currency: 'usd',
      metadata: {
        user_id: user.id,
        tier_id: tier_id,
      },
    })

    return createApiResponse({
      client_secret: paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id,
    })
  } catch (error: any) {
    return createApiError(error.message || 'Internal server error', 500)
  }
}





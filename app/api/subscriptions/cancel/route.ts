import { NextRequest } from 'next/server'
import { createApiResponse, createApiError, authenticateRequest } from '@/lib/api/middleware'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStripeServer } from '@/lib/stripe/server'

/** Turn off auto-renew. The plan stays active until the end of the paid period. */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return createApiError('Unauthorized', 401)
    }

    const adminClient = createAdminClient()
    const { data: subscription } = await adminClient
      .from('user_subscriptions')
      .select('*, subscription_tiers(*)')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle()

    if (!subscription) {
      return createApiError('No active subscription', 404)
    }

    if (!subscription.stripe_subscription_id) {
      return createApiError('This plan does not auto-renew', 400)
    }

    const stripe = getStripeServer()
    await stripe.subscriptions.update(subscription.stripe_subscription_id, {
      cancel_at_period_end: true,
    })

    const { data: updated, error } = await adminClient
      .from('user_subscriptions')
      .update({ renews_at: null, updated_at: new Date().toISOString() })
      .eq('id', subscription.id)
      .select('*, subscription_tiers(*)')
      .single()

    if (error) {
      return createApiError(error.message, 500)
    }

    return createApiResponse(updated)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return createApiError(message, 500)
  }
}

import { NextRequest } from 'next/server'
import { createApiResponse, createApiError, authenticateRequest } from '@/lib/api/middleware'
import { createAdminClient } from '@/lib/supabase/admin'

// The app signs in with a Bearer token, not a cookie, so the cookie client is
// anonymous here and RLS hides the row. Read with the admin client, scoped to the user.
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return createApiError('Unauthorized', 401)
    }

    const adminClient = createAdminClient()
    const { data, error } = await adminClient
      .from('user_subscriptions')
      .select('*, subscription_tiers(*)')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      return createApiError(error.message, 500)
    }

    if (!data) {
      return createApiResponse(null)
    }

    // The app reads the joined plan as `tier`
    return createApiResponse({ ...data, tier: data.subscription_tiers ?? null })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return createApiError(message, 500)
  }
}

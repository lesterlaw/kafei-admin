import { NextRequest } from 'next/server'
import { createApiResponse, createApiError, authenticateRequest } from '@/lib/api/middleware'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return createApiError('Unauthorized', 401)
    }

    const adminClient = createAdminClient()
    const { data, error } = await adminClient
      .from('subscription_tiers')
      .select('*')
      .eq('is_hidden', false)
      .order('price', { ascending: true })

    const rows = error
      ? (
          await adminClient
            .from('subscription_tiers')
            .select('*')
            .order('price', { ascending: true })
        ).data
      : data

    if (error && !rows) {
      return createApiError(error.message, 500)
    }

    const visible = (rows || []).filter((tier) => {
      const period = String(tier.period || '')
      const name = String(tier.name || '')
      if (period !== 'free' && period !== 'monthly' && period !== 'annual') {
        return false
      }
      if (tier.is_hidden) {
        return false
      }
      if (name.toLowerCase().includes('legacy') || name.toLowerCase().includes('3-year')) {
        return false
      }
      return true
    })

    return createApiResponse(visible)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return createApiError(message, 500)
  }
}

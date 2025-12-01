import { NextRequest, NextResponse } from 'next/server'
import { createApiResponse, createApiError } from '@/lib/api/middleware'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  try {
    const { refresh_token } = await request.json()

    if (!refresh_token) {
      return createApiError('Refresh token is required', 400)
    }

    const supabase = createAdminClient()
    const { data, error } = await supabase.auth.refreshSession({
      refresh_token,
    })

    if (error) {
      return createApiError(error.message, 401)
    }

    if (!data.session) {
      return createApiError('Failed to refresh session', 401)
    }

    return createApiResponse({
      user: data.user,
      session: data.session,
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    })
  } catch (error: any) {
    return createApiError(error.message || 'Internal server error', 500)
  }
}


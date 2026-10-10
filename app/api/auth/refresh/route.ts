import { NextRequest, NextResponse } from 'next/server'
import { createApiResponse, createApiError } from '@/lib/api/middleware'
import { createAdminClient } from '@/lib/supabase/admin'
import { isDevTokenFormat, signDevToken, verifyDevToken } from '@/lib/auth/dev-otp'

export async function POST(request: NextRequest) {
  try {
    const { refresh_token } = await request.json()

    if (!refresh_token) {
      return createApiError('Refresh token is required', 400)
    }

    const supabase = createAdminClient()

    // Test-session refresh tokens (lib/auth/dev-otp.ts)
    if (isDevTokenFormat(refresh_token)) {
      const userId = verifyDevToken(refresh_token, 'refresh')
      if (!userId) {
        return createApiError('Session expired', 401)
      }
      const { data: userData } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single()
      if (!userData || userData.is_blocked) {
        return createApiError('Session expired', 401)
      }
      return createApiResponse({
        user: userData,
        session: null,
        access_token: signDevToken(userId, 'access'),
        refresh_token: signDevToken(userId, 'refresh'),
      })
    }

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



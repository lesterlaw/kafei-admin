import { NextRequest, NextResponse } from 'next/server'
import { createApiResponse, createApiError, authenticateRequest } from '@/lib/api/middleware'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const { code, email } = await request.json()

    if (!code) {
      return createApiError('OTP code is required', 400)
    }

    if (!email) {
      return createApiError('Email is required', 400)
    }

    const supabase = await createServerSupabaseClient()
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: 'email',
    })

    if (error) {
      return createApiError(error.message, 400)
    }

    return createApiResponse({
      user: data.user,
      session: data.session,
    })
  } catch (error: any) {
    return createApiError(error.message || 'Internal server error', 500)
  }
}


import { NextRequest, NextResponse } from 'next/server'
import { createApiResponse, createApiError, authenticateRequest } from '@/lib/api/middleware'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { isDevOtpAllowed } from '@/lib/auth/dev-otp'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password, phone } = body

    const supabase = await createServerSupabaseClient()

    // Phone OTP login (for mobile app)
    if (phone) {
      // Allowlisted testers use the test code instead of an SMS (see lib/auth/dev-otp.ts).
      // Never reveal the code in the response.
      if (isDevOtpAllowed(phone)) {
        return createApiResponse({
          message: 'OTP sent to phone',
          phone,
        })
      }

      const { data, error } = await supabase.auth.signInWithOtp({
        phone,
      })

      if (error) {
        return createApiError(error.message, 400)
      }

      return createApiResponse({
        message: 'OTP sent to phone',
        phone,
      })
    }

    // Email/password login (for web admin)
    if (!email || !password) {
      return createApiError('Email and password are required', 400)
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      return createApiError(error.message, 401)
    }

    return createApiResponse({
      user: data.user,
      session: data.session,
      access_token: data.session?.access_token,
      refresh_token: data.session?.refresh_token,
    })
  } catch (error: any) {
    return createApiError(error.message || 'Internal server error', 500)
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return createApiError('Unauthorized', 401)
    }

    const supabase = await createServerSupabaseClient()
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single()

    if (error) {
      return createApiError(error.message, 404)
    }

    return createApiResponse(data)
  } catch (error: any) {
    return createApiError(error.message || 'Internal server error', 500)
  }
}





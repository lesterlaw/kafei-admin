import { NextRequest, NextResponse } from 'next/server'
import { createApiResponse, createApiError, authenticateRequest } from '@/lib/api/middleware'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { isDevOtpAllowed } from '@/lib/auth/dev-otp'
import { isSmsOtpConfigured, sendSmsOtp } from '@/lib/auth/sms-otp'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password, phone } = body

    const supabase = await createServerSupabaseClient()

    // Phone OTP login (for mobile app)
    if (phone) {
      // SMS codes through OneWaySMS (lib/auth/sms-otp.ts). Allowlisted testers get the
      // SMS too; the test code (lib/auth/dev-otp.ts) still works for them as a fallback.
      if (isSmsOtpConfigured()) {
        const result = await sendSmsOtp(phone)
        if (!result.ok && !isDevOtpAllowed(phone)) {
          return createApiError(result.message, result.status)
        }
        return createApiResponse({
          message: 'OTP sent to phone',
          phone,
        })
      }

      // No SMS provider: allowlisted testers use the test code. Never reveal it in the response.
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
        // No SMS provider configured in Supabase, or the provider rejected the send
        if (/unsupported phone provider|sms|twilio|messagebird|vonage/i.test(error.message)) {
          console.error('[auth/login] SMS OTP send failed', error.message)
          return createApiError(
            "We couldn't send your sign-in code right now. Please try again later or email hello@kafei.sg.",
            503
          )
        }
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





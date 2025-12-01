import { NextRequest, NextResponse } from 'next/server'
import { createApiResponse, createApiError } from '@/lib/api/middleware'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const { email, password, full_name, phone } = await request.json()

    if (!email || !password) {
      return createApiError('Email and password are required', 400)
    }

    const supabase = await createServerSupabaseClient()
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    })

    if (error) {
      return createApiError(error.message, 400)
    }

    if (data.user) {
      // Generate referral code
      const referralCode = Math.random().toString(36).substring(2, 9).toUpperCase()

      // Create user profile
      await supabase.from('users').insert({
        id: data.user.id,
        email,
        full_name,
        phone,
        referral_code: referralCode,
      })
    }

    return createApiResponse({
      user: data.user,
      session: data.session,
    })
  } catch (error: any) {
    return createApiError(error.message || 'Internal server error', 500)
  }
}





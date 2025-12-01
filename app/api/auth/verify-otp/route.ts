import { NextRequest, NextResponse } from 'next/server'
import { createApiResponse, createApiError, authenticateRequest } from '@/lib/api/middleware'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { randomUUID } from 'crypto'

// Default OTP for development - TODO: Remove in production
const DEV_OTP = '000000'

export async function POST(request: NextRequest) {
  try {
    const { code, email, phone } = await request.json()

    if (!code) {
      return createApiError('OTP code is required', 400)
    }

    if (!email && !phone) {
      return createApiError('Email or phone is required', 400)
    }

    const adminClient = createAdminClient()

    // Development bypass: Accept 000000 as valid OTP
    if (code === DEV_OTP) {
      let userId: string
      let userData: any
      
      if (phone) {
        // Check if user exists by phone in users table
        const { data: existingUser } = await adminClient
          .from('users')
          .select('*')
          .eq('phone', phone)
          .single()
        
        if (existingUser) {
          userId = existingUser.id
          userData = existingUser
        } else {
          // Use placeholder email for phone signups
          const placeholderEmail = `${phone.replace(/\+/g, '')}@phone.kafei.local`
          
          // First, create user in Supabase Auth (required due to foreign key)
          const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
            email: placeholderEmail,
            phone: phone,
            email_confirm: true,
            phone_confirm: true,
          })
          
          if (authError || !authData.user) {
            console.error('Failed to create auth user:', authError)
            return createApiError('Failed to create user: ' + (authError?.message || 'Unknown error'), 500)
          }
          
          userId = authData.user.id
          
          // Now create in users table with the auth user's ID
          const newUser = {
            id: userId,
            phone: phone,
            email: placeholderEmail,
            full_name: null,
            is_blocked: false,
            referral_code: generateReferralCode(),
          }
          
          const { data: insertedUser, error: insertError } = await adminClient
            .from('users')
            .insert(newUser)
            .select()
            .single()
          
          if (insertError) {
            console.error('Failed to create user record:', insertError)
            return createApiError('Failed to create user: ' + insertError.message, 500)
          }
          
          userData = insertedUser
        }
      } else {
        // Email flow
        const { data: existingUser } = await adminClient
          .from('users')
          .select('*')
          .eq('email', email)
          .single()
        
        if (existingUser) {
          userId = existingUser.id
          userData = existingUser
        } else {
          // First, create user in Supabase Auth
          const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
            email: email!,
            email_confirm: true,
          })
          
          if (authError || !authData.user) {
            console.error('Failed to create auth user:', authError)
            return createApiError('Failed to create user: ' + (authError?.message || 'Unknown error'), 500)
          }
          
          userId = authData.user.id
          
          const newUser = {
            id: userId,
            phone: '',
            email: email,
            full_name: null,
            is_blocked: false,
            referral_code: generateReferralCode(),
          }
          
          const { data: insertedUser, error: insertError } = await adminClient
            .from('users')
            .insert(newUser)
            .select()
            .single()
          
          if (insertError) {
            console.error('Failed to create user record:', insertError)
            return createApiError('Failed to create user: ' + insertError.message, 500)
          }
          
          userData = insertedUser
        }
      }
      
      // Return dev tokens
      const accessToken = `dev_token_${userId}_${Date.now()}`
      const refreshToken = `dev_refresh_${userId}_${Date.now()}`
      
      console.log('Dev mode: Created/found user:', userId)
      console.log('Dev mode: Access token:', accessToken)
      
      return createApiResponse({
        user: userData,
        session: null,
        access_token: accessToken,
        refresh_token: refreshToken,
        dev_mode: true,
      })
    }

    const supabase = await createServerSupabaseClient()

    // Phone OTP verification (for mobile app)
    if (phone) {
      const { data, error } = await supabase.auth.verifyOtp({
        phone,
        token: code,
        type: 'sms',
      })

      if (error) {
        return createApiError(error.message, 400)
      }

      // Check if user exists in users table, if not create them
      const { data: existingUser } = await adminClient
        .from('users')
        .select('*')
        .eq('id', data.user?.id)
        .single()

      if (!existingUser && data.user) {
        await adminClient.from('users').insert({
          id: data.user.id,
          phone: phone,
          email: data.user.email || null,
          is_blocked: false,
          referral_code: generateReferralCode(),
        })
      }

      return createApiResponse({
        user: data.user,
        session: data.session,
        access_token: data.session?.access_token,
        refresh_token: data.session?.refresh_token,
      })
    }

    // Email OTP verification
    const { data, error } = await supabase.auth.verifyOtp({
      email: email!,
      token: code,
      type: 'email',
    })

    if (error) {
      return createApiError(error.message, 400)
    }

    return createApiResponse({
      user: data.user,
      session: data.session,
      access_token: data.session?.access_token,
      refresh_token: data.session?.refresh_token,
    })
  } catch (error: any) {
    console.error('Verify OTP error:', error)
    return createApiError(error.message || 'Internal server error', 500)
  }
}

function generateReferralCode(): string {
  return Math.random().toString(36).substring(2, 10).toUpperCase()
}


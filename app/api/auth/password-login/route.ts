import { NextRequest } from 'next/server'
import { createApiResponse, createApiError } from '@/lib/api/middleware'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkPassword } from '@/lib/auth/password'
import { createPhoneUserSession } from '@/lib/auth/phone-session'
import { findUserByPhone } from '@/lib/auth/phone-user'

// Phone and password sign-in for the app (SLP-1723). The SMS code is only for
// sign-up and password resets (api/auth/login, then api/auth/verify-otp).
export async function POST(request: NextRequest) {
  try {
    const { phone, password } = await request.json()

    if (typeof phone !== 'string' || !phone.trim()) {
      return createApiError('Please enter your phone number', 400)
    }
    if (typeof password !== 'string' || !password) {
      return createApiError('Please enter your password', 400)
    }

    const adminClient = createAdminClient()
    const userData = await findUserByPhone(adminClient, phone.trim())

    if (!userData) {
      return createApiError(
        'No KAFEI account uses this number yet. Tap Create account to sign up.',
        404,
        'NO_ACCOUNT'
      )
    }
    if (userData.is_blocked) {
      return createApiError('This account is blocked. Please email hello@kafei.sg.', 403)
    }

    const check = await checkPassword(adminClient, userData.id, password)
    if (!check.ok) {
      if (check.reason === 'not_set') {
        // Accounts from before passwords: verify the phone once and set one
        return createApiError(
          "Your account doesn't have a password yet. We'll text you a code to set one.",
          409,
          'PASSWORD_NOT_SET'
        )
      }
      if (check.reason === 'locked') {
        return createApiError(
          `Too many wrong passwords. Try again in ${check.minutes} minutes, or reset your password.`,
          429,
          'LOCKED'
        )
      }
      return createApiError('Wrong phone number or password.', 401, 'WRONG_PASSWORD')
    }

    const { data: authData, error: authError } = await adminClient.auth.admin.getUserById(userData.id)
    if (authError || !authData.user) {
      console.error('[auth/password-login] load auth user failed', authError)
      return createApiError('Failed to sign in. Please try again.', 500)
    }

    const session = await createPhoneUserSession(adminClient, authData.user, phone.trim())
    return createApiResponse({
      user: userData,
      session,
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    })
  } catch (error: any) {
    console.error('[auth/password-login]', error)
    return createApiError('Failed to sign in. Please try again.', 500)
  }
}

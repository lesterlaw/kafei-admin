import { NextRequest } from 'next/server'
import { createApiResponse, createApiError, authenticateRequest } from '@/lib/api/middleware'
import { createAdminClient } from '@/lib/supabase/admin'
import { passwordProblem, setPassword } from '@/lib/auth/password'

// PUT - Set or change the signed-in customer's app password. The session comes from
// an SMS code (sign-up, reset) or a password sign-in, so the phone is already proven.
export async function PUT(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return createApiError('Unauthorized', 401)
    }

    const { password } = await request.json()
    const problem = passwordProblem(password)
    if (problem) {
      return createApiError(problem, 400)
    }

    await setPassword(createAdminClient(), user.id, password)
    return createApiResponse({ has_password: true })
  } catch (error: any) {
    console.error('[auth/password]', error)
    return createApiError('Failed to save your password. Please try again.', 500)
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { createApiResponse, createApiError, authenticateRequest } from '@/lib/api/middleware'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return createApiError('Unauthorized', 401)
    }

    const supabase = await createServerSupabaseClient()
    await supabase.auth.signOut()

    return createApiResponse({ message: 'Logged out successfully' })
  } catch (error: any) {
    return createApiError(error.message || 'Internal server error', 500)
  }
}


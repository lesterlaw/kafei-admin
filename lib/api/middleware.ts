import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isDevTokenFormat, verifyDevToken } from '@/lib/auth/dev-otp'

export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export const createApiResponse = <T>(
  data: T,
  status: number = 200
): NextResponse<ApiResponse<T>> => {
  return NextResponse.json(
    {
      success: true,
      data,
    },
    { status }
  )
}

export const createApiError = (
  error: string,
  status: number = 400
): NextResponse<ApiResponse> => {
  return NextResponse.json(
    {
      success: false,
      error,
    },
    { status }
  )
}

export const authenticateRequest = async (request: NextRequest) => {
  // Check for Bearer token in Authorization header (mobile app)
  const authHeader = request.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7)
    
    // Signed test-session tokens (lib/auth/dev-otp.ts). Only valid while test sign-in is enabled.
    if (isDevTokenFormat(token)) {
      const userId = verifyDevToken(token, 'access')
      if (!userId) return null
      const adminClient = createAdminClient()

      const { data: userData } = await adminClient
        .from('users')
        .select('id, email, phone, created_at, updated_at, is_blocked')
        .eq('id', userId)
        .single()

      if (!userData || userData.is_blocked) return null
      return {
        id: userData.id,
        email: userData.email,
        phone: userData.phone,
        created_at: userData.created_at,
        updated_at: userData.updated_at,
      } as any
    }
    
    // Try to validate as a real Supabase token
    const adminClient = createAdminClient()
    const { data: { user }, error } = await adminClient.auth.getUser(token)
    
    if (!error && user) {
      // Blocked customers lose access straight away, not when their token expires.
      const { data: profile } = await adminClient
        .from('users')
        .select('is_blocked')
        .eq('id', user.id)
        .maybeSingle()
      if (profile?.is_blocked) return null
      return user
    }
  }

  // Fall back to cookie-based authentication (web admin)
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    return null
  }

  return user
}

export const authenticateAdminRequest = async (request: NextRequest) => {
  const user = await authenticateRequest(request)
  if (!user) {
    return null
  }

  const supabase = await createServerSupabaseClient()
  const { data: admin } = await supabase
    .from('admins')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!admin) {
    return null
  }

  return { user, admin }
}





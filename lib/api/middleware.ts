import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

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
    
    // Handle dev tokens (format: dev_token_${userId}_${timestamp})
    if (token.startsWith('dev_token_')) {
      const parts = token.split('_')
      if (parts.length >= 3) {
        const userId = parts[2]
        const adminClient = createAdminClient()
        
        // Get user from database
        const { data: userData } = await adminClient
          .from('users')
          .select('*')
          .eq('id', userId)
          .single()
        
        if (userData) {
          // Return a user-like object for dev mode
          return {
            id: userData.id,
            email: userData.email,
            phone: userData.phone,
            created_at: userData.created_at,
            updated_at: userData.updated_at,
          } as any
        }
      }
    }
    
    // Try to validate as a real Supabase token
    const adminClient = createAdminClient()
    const { data: { user }, error } = await adminClient.auth.getUser(token)
    
    if (!error && user) {
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





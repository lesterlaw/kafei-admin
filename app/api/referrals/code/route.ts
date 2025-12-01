import { NextRequest, NextResponse } from 'next/server'
import { createApiResponse, createApiError, authenticateRequest } from '@/lib/api/middleware'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return createApiError('Unauthorized', 401)
    }

    const supabase = await createServerSupabaseClient()
    const { data: userData } = await supabase
      .from('users')
      .select('referral_code')
      .eq('id', user.id)
      .single()

    const { data: referrals, error } = await supabase
      .from('referrals')
      .select('*, referred:users!referrals_referred_id_fkey(id, email, created_at)')
      .eq('referrer_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      return createApiError(error.message, 500)
    }

    return createApiResponse({
      referral_code: userData?.referral_code,
      referrals: referrals || [],
      streak_count: referrals?.length || 0,
    })
  } catch (error: any) {
    return createApiError(error.message || 'Internal server error', 500)
  }
}





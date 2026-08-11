import { NextRequest } from 'next/server'
import {
  createApiResponse,
  createApiError,
  authenticateRequest,
} from '@/lib/api/middleware'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return createApiError('Unauthorized', 401)
    }

    const supabase = createAdminClient()
    const now = Date.now()

    const { data: allActive, error } = await supabase
      .from('promo_codes')
      .select('*')
      .eq('is_active', true)
      .order('is_system', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) {
      return createApiError(error.message, 500)
    }

    const { data: userAssignments } = await supabase
      .from('promo_code_users')
      .select('promo_code_id')
      .eq('user_id', user.id)

    const assignedIds = new Set(
      (userAssignments || []).map((row) => row.promo_code_id)
    )

    const applicable = (allActive || []).filter((promo) => {
      if (promo.starts_at && new Date(promo.starts_at).getTime() > now) {
        return false
      }
      if (promo.ends_at && new Date(promo.ends_at).getTime() < now) {
        return false
      }
      if (promo.is_system) return true
      if (promo.applies_to_all_users) return true
      return assignedIds.has(promo.id)
    })

    return createApiResponse(applicable)
  } catch (error: any) {
    return createApiError(error.message || 'Internal server error', 500)
  }
}

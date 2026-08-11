import { NextRequest } from 'next/server'
import { createApiResponse, createApiError } from '@/lib/api/middleware'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(_request: NextRequest) {
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('banners')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })

    if (error) {
      return createApiError(error.message, 500)
    }

    return createApiResponse(data || [])
  } catch (error: any) {
    return createApiError(error.message || 'Internal server error', 500)
  }
}

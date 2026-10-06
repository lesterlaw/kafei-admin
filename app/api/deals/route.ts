import { NextRequest } from 'next/server'
import { createApiResponse, createApiError } from '@/lib/api/middleware'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeDealImages } from '@/lib/deals'

export async function GET(_request: NextRequest) {
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('deals')
      .select('id, title, description, image_urls, link_url, sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })

    if (error) {
      return createApiError(error.message, 500)
    }

    return createApiResponse(
      (data || []).map((deal) => ({
        ...deal,
        image_urls: normalizeDealImages(deal.image_urls),
      }))
    )
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return createApiError(message, 500)
  }
}

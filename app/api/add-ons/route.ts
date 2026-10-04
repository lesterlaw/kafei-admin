import { NextRequest } from 'next/server'
import { createApiResponse, createApiError, authenticateRequest } from '@/lib/api/middleware'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return createApiError('Unauthorized', 401)
    }

    const productId = request.nextUrl.searchParams.get('productId')?.trim() || ''
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('add_ons')
      .select('*, product_addons(product_id)')
      .eq('is_hidden', false)
      .order('name', { ascending: true })

    if (error) {
      return createApiError(error.message, 500)
    }

    const rows = data || []
    if (!productId) {
      return createApiResponse(
        rows.map(({ product_addons: _links, ...addon }) => addon)
      )
    }

    const taggedForProduct = rows.filter((row) => {
      const links = Array.isArray(row.product_addons) ? row.product_addons : []
      return links.some((link: { product_id: string }) => link.product_id === productId)
    })

    // Product-specific tags win. Untagged catalog stays global so existing drinks keep working.
    const visible = taggedForProduct.length > 0
      ? taggedForProduct
      : rows.filter((row) => {
          const links = Array.isArray(row.product_addons) ? row.product_addons : []
          return links.length === 0
        })

    return createApiResponse(
      visible.map(({ product_addons: _links, ...addon }) => addon)
    )
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return createApiError(message, 500)
  }
}

import { NextRequest } from 'next/server'
import {
  createApiResponse,
  createApiError,
  authenticateRequest,
} from '@/lib/api/middleware'

export async function GET(_request: NextRequest) {
  try {
    const user = await authenticateRequest(_request)
    if (!user) {
      return createApiError('Unauthorized', 401)
    }

    return createApiResponse({
      ads: [],
      token: null,
      expires_at: null,
      house_ad: null,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return createApiError(message, 500)
  }
}

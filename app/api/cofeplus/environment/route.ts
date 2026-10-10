import { NextRequest } from 'next/server'
import {
  authenticateAdminRequest,
  createApiError,
  createApiResponse,
} from '@/lib/api/middleware'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getActiveCofeplusEnvironment,
  setActiveCofeplusEnvironment,
} from '@/lib/cofeplus/settings'

export async function GET() {
  try {
    const environment = await getActiveCofeplusEnvironment()
    return createApiResponse({ environment })
  } catch (error: unknown) {
    return createApiError(
      error instanceof Error ? error.message : 'Failed to load environment',
      500
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    // Switching the machine between test and live is an admin action.
    const admin = await authenticateAdminRequest(request)
    if (!admin) {
      return createApiError('Admin access required', 403)
    }

    const body = await request.json().catch(() => ({}))
    const environment = body?.environment === 'live' ? 'live' : 'test'
    const saved = await setActiveCofeplusEnvironment(
      environment,
      createAdminClient()
    )
    return createApiResponse({ environment: saved })
  } catch (error: unknown) {
    return createApiError(
      error instanceof Error ? error.message : 'Failed to save environment',
      500
    )
  }
}

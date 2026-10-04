import { NextRequest } from 'next/server'
import { createApiError, createApiResponse } from '@/lib/api/middleware'
import { createAdminClient } from '@/lib/supabase/admin'
import { authenticateKioskDevice } from '@/lib/kiosk/device'
import { getKioskOrderView } from '@/lib/kiosk/scan'

export const maxDuration = 25

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateKioskDevice(request)
    if (!auth.ok) {
      return createApiError(auth.error, auth.status)
    }
    const kiosk = auth.kiosk

    const { id } = await context.params
    const result = await getKioskOrderView(createAdminClient(), kiosk, id)
    if (!result.ok) {
      return createApiError(result.error, result.status)
    }

    return createApiResponse(result.drink)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Order lookup failed'
    return createApiError(message, 500)
  }
}

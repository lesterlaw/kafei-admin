import { NextRequest } from 'next/server'
import { createApiError, createApiResponse } from '@/lib/api/middleware'
import { createAdminClient } from '@/lib/supabase/admin'
import { authenticateKioskDevice } from '@/lib/kiosk/device'
import { getKioskBoard } from '@/lib/kiosk/scan'

export const maxDuration = 25

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateKioskDevice(request)
    if (!auth.ok) {
      return createApiError(auth.error, auth.status)
    }
    const kiosk = auth.kiosk

    const board = await getKioskBoard(
      createAdminClient(),
      kiosk,
      request.nextUrl.searchParams.get('deliveryPort')
    )
    return createApiResponse(board)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Status failed'
    return createApiError(message, 500)
  }
}

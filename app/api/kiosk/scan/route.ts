import { NextRequest, NextResponse } from 'next/server'
import { createApiError, createApiResponse } from '@/lib/api/middleware'
import { createAdminClient } from '@/lib/supabase/admin'
import { authenticateKioskDevice } from '@/lib/kiosk/device'
import { scanPickupAtKiosk } from '@/lib/kiosk/scan'

export const maxDuration = 25

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateKioskDevice(request)
    if (!auth.ok) {
      return createApiError(auth.error, auth.status)
    }
    const kiosk = auth.kiosk

    const body = (await request.json().catch(() => null)) as {
      code?: unknown
      deliveryPort?: unknown
    } | null
    const code = typeof body?.code === 'string' ? body.code : ''

    const result = await scanPickupAtKiosk(
      createAdminClient(),
      kiosk,
      code,
      body?.deliveryPort
    )
    if (!result.ok) {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
          ...(result.queuePosition != null
            ? { queuePosition: result.queuePosition }
            : {}),
        },
        { status: result.status }
      )
    }

    return createApiResponse(result.drink)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Scan failed'
    return createApiError(message, 500)
  }
}

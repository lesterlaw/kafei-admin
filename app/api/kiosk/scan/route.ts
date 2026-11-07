import { NextRequest, NextResponse } from 'next/server'
import { createApiError, createApiResponse } from '@/lib/api/middleware'
import { createAdminClient } from '@/lib/supabase/admin'
import { authenticateKioskDevice } from '@/lib/kiosk/device'
import { scanPickupAtKiosk } from '@/lib/kiosk/scan'

export const maxDuration = 25

// Raw network errors ("Timed out after 10000ms via relay ...") mean nothing to
// a customer. Rescanning is safe: dispatch retries reuse the order's
// Idempotency-Key, so a drink is never made twice.
const NETWORK_ERROR_PATTERN =
  /timed out|timeout|NETWORK_ERROR|network|socket|ECONN|ETIMEDOUT|TLS|fetch failed|via relay/i
const RETRY_MESSAGE =
  'Connection hiccup. Tap Scan Again and scan your QR code again.'

function customerError(error: string, status: number) {
  if (NETWORK_ERROR_PATTERN.test(error)) {
    console.error('[kiosk] scan network error', error)
    return { error: RETRY_MESSAGE, status: 503 }
  }
  return { error, status }
}

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
      const shown = customerError(result.error, result.status)
      return NextResponse.json(
        {
          success: false,
          error: shown.error,
          ...(result.queuePosition != null
            ? { queuePosition: result.queuePosition }
            : {}),
        },
        { status: shown.status }
      )
    }

    return createApiResponse(result.drink)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Scan failed'
    const shown = customerError(message, 500)
    return createApiError(shown.error, shown.status)
  }
}

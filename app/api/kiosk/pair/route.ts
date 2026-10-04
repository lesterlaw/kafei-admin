import { NextRequest } from 'next/server'
import { createApiError, createApiResponse } from '@/lib/api/middleware'
import { authenticateKioskDevice } from '@/lib/kiosk/device'
import { getActiveCofeplusEnvironment } from '@/lib/cofeplus/settings'

export async function POST(request: NextRequest) {
  const auth = await authenticateKioskDevice(request)
  if (!auth.ok) {
    return createApiError(auth.error, auth.status)
  }
  const kiosk = auth.kiosk

  return createApiResponse({
    kiosk: {
      id: kiosk.id,
      name: kiosk.name,
      location: kiosk.location,
      podId: kiosk.pod_id || '',
    },
    environment: await getActiveCofeplusEnvironment(),
  })
}

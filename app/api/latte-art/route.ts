import { NextRequest } from 'next/server'
import {
  authenticateRequest,
  createApiError,
  createApiResponse,
} from '@/lib/api/middleware'
import { storeUploadedLatteArt } from '@/lib/cofeplus/latte-art'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return createApiError('Unauthorized', 401)
    }

    const body = await request.json()
    const imageBase64 =
      typeof body?.image_base64 === 'string' ? body.image_base64 : ''
    const mimeType =
      typeof body?.mime_type === 'string' ? body.mime_type : 'image/jpeg'

    if (!imageBase64) {
      return createApiError('Missing image', 400)
    }

    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic']
    if (!allowed.includes(mimeType.toLowerCase())) {
      return createApiError('Use a JPEG, PNG, or WebP photo', 400)
    }

    const buffer = Buffer.from(imageBase64, 'base64')
    const adminClient = createAdminClient()
    const stored = await storeUploadedLatteArt(adminClient, user.id, buffer)

    return createApiResponse({
      locator: stored.locator,
      flag: 'upload',
      note: stored.note,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    const status = /under 8MB|empty|over 2MB/i.test(message) ? 400 : 500
    return createApiError(message, status)
  }
}

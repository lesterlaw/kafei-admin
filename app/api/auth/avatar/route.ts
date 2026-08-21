import { NextRequest } from 'next/server'
import {
  authenticateRequest,
  createApiError,
  createApiResponse,
} from '@/lib/api/middleware'
import { createAdminClient } from '@/lib/supabase/admin'

function avatarPath(userId: string, ext: string) {
  return `avatars/${userId}.${ext}`
}

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

    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    if (!allowed.includes(mimeType.toLowerCase())) {
      return createApiError('Use a JPEG, PNG, or WebP image', 400)
    }

    const ext = mimeType.includes('png')
      ? 'png'
      : mimeType.includes('webp')
        ? 'webp'
        : 'jpg'
    const buffer = Buffer.from(imageBase64, 'base64')
    if (!buffer.length || buffer.length > 6 * 1024 * 1024) {
      return createApiError('Image must be under 6MB', 400)
    }

    const supabase = createAdminClient()
    await supabase.storage
      .createBucket('product-images', { public: true })
      .then(
        () => undefined,
        () => undefined
      )

    const path = avatarPath(user.id, ext)
    const { error: uploadError } = await supabase.storage
      .from('product-images')
      .upload(path, buffer, {
        contentType: mimeType,
        upsert: true,
      })

    if (uploadError) {
      return createApiError(`Image upload failed: ${uploadError.message}`, 500)
    }

    const { data: publicData } = supabase.storage
      .from('product-images')
      .getPublicUrl(path)
    const avatarUrl = `${publicData.publicUrl}?t=${Date.now()}`

    const { data: updated, error: updateError } = await supabase
      .from('users')
      .update({
        avatar_url: avatarUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)
      .select('*')
      .maybeSingle()

    if (updateError) {
      console.error('avatar_url column update failed:', updateError.message)
    }

    return createApiResponse({
      ...(updated || { id: user.id }),
      avatar_url: avatarUrl,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return createApiError(message, 500)
  }
}

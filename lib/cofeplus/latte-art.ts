import sharp from 'sharp'
import type { SupabaseClient } from '@supabase/supabase-js'
import { isIcedDrink, normalizeDrinkName } from '@/lib/cofeplus/product-map'
import {
  LATTE_ART_CANVAS,
  LATTE_ART_DPI,
  LATTE_ART_SAFE_DIAMETER,
  type LatteArtFlag,
} from '@/lib/cofeplus/latte-art-contract'

export const LATTE_ART_NOTE =
  'Resized to an 800x800 JPG at 72 DPI. The design sits inside the center 640px circle. Files are kept under 2MB.'

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024
const BUCKET = 'product-images'

const HEART_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">
  <path fill="#3B2414" d="M320 470C210 390 150 320 150 250c0-52 40-92 92-92 32 0 60 16 78 42 18-26 46-42 78-42 52 0 92 40 92 92 0 70-60 140-170 220z"/>
</svg>`

const LEAF_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">
  <path fill="#3B2414" d="M470 170c-130 20-230 110-270 210-18 46-16 96-4 140 18-58 62-112 120-148 78-48 140-90 154-202z"/>
  <path fill="none" stroke="#3B2414" stroke-width="16" stroke-linecap="round" d="M210 500c50-80 110-150 190-210"/>
</svg>`

const catalogUrls = new Map<string, string>()

export function drinkSupportsLatteArt(
  name: string,
  temperature?: string | null
) {
  if (isIcedDrink(name, temperature)) return false
  const normalized = normalizeDrinkName(name)
  if (/americano|espresso|long black|black coffee|cold brew/.test(normalized)) {
    return false
  }
  return /latte|cappuccino|flat white|mocha|macchiato|cortado|\bmilk\b/.test(
    normalized
  )
}

export function isHostedLatteArtLocator(url: string, supabaseUrl: string) {
  try {
    const parsed = new URL(url)
    const host = new URL(supabaseUrl).host
    return (
      parsed.protocol === 'https:' &&
      parsed.host === host &&
      parsed.pathname.includes('/latte-art/') &&
      parsed.pathname.toLowerCase().endsWith('.jpg')
    )
  } catch {
    return false
  }
}

function circleMask(size: number) {
  const radius = size / 2
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
      <circle cx="${radius}" cy="${radius}" r="${radius}" fill="#ffffff"/>
    </svg>`
  )
}

async function composeSpecJpeg(artwork: Buffer) {
  const safe = LATTE_ART_SAFE_DIAMETER
  const canvas = LATTE_ART_CANVAS
  const offset = Math.round((canvas - safe) / 2)

  const circled = await sharp(artwork)
    .resize(safe, safe, { fit: 'cover', position: 'centre' })
    .ensureAlpha()
    .composite([{ input: circleMask(safe), blend: 'dest-in' }])
    .png()
    .toBuffer()

  const encodeJpeg = (quality: number) =>
    sharp({
      create: {
        width: canvas,
        height: canvas,
        channels: 3,
        background: '#ffffff',
      },
    })
      .composite([{ input: circled, left: offset, top: offset }])
      .jpeg({ quality, mozjpeg: true })
      .withMetadata({ density: LATTE_ART_DPI })
      .toBuffer()

  let quality = 90
  let jpeg = await encodeJpeg(quality)
  while (jpeg.length > MAX_OUTPUT_BYTES && quality > 50) {
    quality -= 10
    jpeg = await encodeJpeg(quality)
  }

  if (jpeg.length > MAX_OUTPUT_BYTES) {
    throw new Error('Latte art image is still over 2MB after resizing')
  }
  return jpeg
}

export async function prepareLatteArtJpeg(input: Buffer) {
  if (!input.length) {
    throw new Error('Image is empty')
  }
  if (input.length > MAX_UPLOAD_BYTES) {
    throw new Error('Image must be under 8MB before resizing')
  }
  return composeSpecJpeg(input)
}

async function renderPresetJpeg(svg: string) {
  const png = await sharp(Buffer.from(svg)).png().toBuffer()
  return composeSpecJpeg(png)
}

async function uploadJpeg(
  adminClient: SupabaseClient,
  path: string,
  jpeg: Buffer
) {
  await adminClient.storage.createBucket(BUCKET, { public: true }).then(
    () => undefined,
    () => undefined
  )

  const { error } = await adminClient.storage.from(BUCKET).upload(path, jpeg, {
    contentType: 'image/jpeg',
    upsert: true,
  })
  if (error) {
    throw new Error(`Latte art upload failed: ${error.message}`)
  }

  const { data } = adminClient.storage.from(BUCKET).getPublicUrl(path)
  return data.publicUrl
}

export async function storeUploadedLatteArt(
  adminClient: SupabaseClient,
  userId: string,
  input: Buffer
) {
  const jpeg = await prepareLatteArtJpeg(input)
  const path = `latte-art/${userId}/${crypto.randomUUID()}.jpg`
  const locator = await uploadJpeg(adminClient, path, jpeg)
  return { locator, note: LATTE_ART_NOTE }
}

export async function ensureCatalogLatteArtLocator(
  adminClient: SupabaseClient,
  preset: 'heart' | 'leaf'
): Promise<string> {
  const cached = catalogUrls.get(preset)
  if (cached) return cached

  const jpeg = await renderPresetJpeg(preset === 'heart' ? HEART_SVG : LEAF_SVG)
  const locator = await uploadJpeg(
    adminClient,
    `latte-art/catalog/${preset}.jpg`,
    jpeg
  )
  catalogUrls.set(preset, locator)
  return locator
}

export function pickCatalogPreset(): 'heart' | 'leaf' {
  return Math.random() < 0.5 ? 'heart' : 'leaf'
}

export function latteArtLabel(flag: LatteArtFlag) {
  if (flag === 'catalog') return 'Random latte art'
  if (flag === 'upload') return 'Your latte art photo'
  return 'No latte art'
}

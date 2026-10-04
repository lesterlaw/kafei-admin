import { readFileSync } from 'fs'
import { resolve } from 'path'
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: resolve(process.cwd(), '.env') })

const BUCKET = 'kiosk-releases'
const OBJECT_PATH = 'kafei-kiosk.apk'
const APK_PATH = resolve(
  process.cwd(),
  '../kafei-kiosk/android/app/build/outputs/apk/release/app-release.apk'
)

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { error: createError } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: 52428800,
    allowedMimeTypes: [
      'application/vnd.android.package-archive',
      'application/octet-stream',
    ],
  })

  if (createError && !/already exists/i.test(createError.message)) {
    throw createError
  }

  const { error: updateError } = await supabase.storage.updateBucket(BUCKET, {
    public: true,
    fileSizeLimit: 52428800,
  })

  if (updateError) {
    throw updateError
  }

  const file = readFileSync(APK_PATH)
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(OBJECT_PATH, file, {
      contentType: 'application/vnd.android.package-archive',
      cacheControl: '0',
      upsert: true,
    })

  if (uploadError) {
    throw uploadError
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(OBJECT_PATH)
  console.log(`Uploaded ${file.length} bytes`)
  console.log(data.publicUrl)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})

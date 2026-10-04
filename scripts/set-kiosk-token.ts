import { resolve } from 'path'
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { KIOSK_DEVICE_TOKEN } from '../lib/kiosk/apk'

config({ path: resolve(process.cwd(), '.env') })

const OLD_PUBLIC_TOKEN = 'kiosk_a7a176c3cb75c8f30db52ed743833fc12eac7dac'

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data, error } = await supabase
    .from('kiosk_devices')
    .select('kiosk_id, device_token, kiosks(name)')

  if (error) {
    throw error
  }

  const rows = data || []
  const target =
    rows.find((row) => row.device_token === OLD_PUBLIC_TOKEN) ||
    (rows.length === 1 ? rows[0] : null)

  if (!target) {
    console.log('Current tokens:')
    for (const row of rows) {
      const kiosk = Array.isArray(row.kiosks) ? row.kiosks[0] : row.kiosks
      console.log(JSON.stringify({ name: kiosk?.name, token: row.device_token }))
    }
    throw new Error('Could not find the public kiosk token to replace')
  }

  const { error: updateError } = await supabase
    .from('kiosk_devices')
    .update({
      device_token: KIOSK_DEVICE_TOKEN,
      last_seen_at: null,
    })
    .eq('kiosk_id', target.kiosk_id)

  if (updateError) {
    throw updateError
  }

  const kiosk = Array.isArray(target.kiosks) ? target.kiosks[0] : target.kiosks
  console.log(
    JSON.stringify({
      name: kiosk?.name || null,
      kioskId: target.kiosk_id,
      token: KIOSK_DEVICE_TOKEN,
    })
  )
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})

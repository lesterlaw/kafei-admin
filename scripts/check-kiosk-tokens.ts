import { resolve } from 'path'
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: resolve(process.cwd(), '.env') })

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data, error } = await supabase
    .from('kiosk_devices')
    .select('kiosk_id, device_token, last_seen_at, kiosks(name, is_active)')

  if (error) {
    throw error
  }

  for (const row of data || []) {
    const kiosk = Array.isArray(row.kiosks) ? row.kiosks[0] : row.kiosks
    console.log(
      JSON.stringify({
        name: kiosk?.name || null,
        active: kiosk?.is_active ?? null,
        token: row.device_token,
        lastSeen: row.last_seen_at,
      })
    )
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})

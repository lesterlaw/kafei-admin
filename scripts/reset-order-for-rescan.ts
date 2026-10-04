import { resolve } from 'path'
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { resetOrderForRescan } from '../lib/cofeplus/queue'

config({ path: resolve(process.cwd(), '.env') })

const ORDER_ID = process.argv[2] || 'a8212f9b-6010-4ea2-a08d-afeb3329bea8'

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const result = await resetOrderForRescan(supabase, ORDER_ID)
  if (result.error || !result.order) {
    throw new Error(result.error || 'Reset failed')
  }

  console.log(
    JSON.stringify(
      {
        id: result.order.id,
        status: result.order.status,
        pickup_code: result.order.pickup_code,
        delivery_port: result.order.delivery_port,
        scan_expires_at: result.order.scan_expires_at,
        missed_scans: result.order.missed_scans,
      },
      null,
      2
    )
  )
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})

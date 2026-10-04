import { resolve } from 'path'
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { startImmediateBrewForOrder, type MachineOrderRow } from '../lib/cofeplus/queue'

config({ path: resolve(process.cwd(), '.env') })

const ORDER_ID =
  process.argv[2] || 'b6e5f3ea-2ef6-458e-ac74-e92b94b782ba'

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: current, error } = await supabase
    .from('orders')
    .select(
      'id, status, pickup_code, cofeplus_dispatch_id, cofeplus_pod_id, cofeplus_environment, machine_activated_at, scan_expires_at, missed_scans, created_at, order_number, user_id, kiosk_id, delivery_port, redemption_id'
    )
    .eq('id', ORDER_ID)
    .maybeSingle()

  if (error || !current) {
    throw new Error(error?.message || 'Order not found')
  }

  console.log('before', JSON.stringify(current, null, 2))

  if (current.status === 'cancelled' || current.status === 'completed') {
    const { data: reopened, error: reopenError } = await supabase
      .from('orders')
      .update({
        status: 'pending',
        missed_scans: 0,
        cofeplus_pod_id: current.cofeplus_pod_id || 'RCK541',
        cofeplus_environment: current.cofeplus_environment || 'live',
      })
      .eq('id', ORDER_ID)
      .select(
        'id, status, pickup_code, cofeplus_dispatch_id, cofeplus_pod_id, cofeplus_environment, machine_activated_at, scan_expires_at, missed_scans, created_at, order_number, user_id, kiosk_id, delivery_port, redemption_id'
      )
      .maybeSingle()

    if (reopenError || !reopened) {
      throw new Error(reopenError?.message || 'Failed to reopen order')
    }
    Object.assign(current, reopened)
    console.log('reopened', current.status)
  }

  const result = await startImmediateBrewForOrder(
    supabase,
    current as MachineOrderRow,
    { podId: 'RCK541' }
  )
  console.log('start', {
    status: result.order.status,
    dispatch: result.order.cofeplus_dispatch_id,
    port: result.order.delivery_port,
    alreadyStarted: result.alreadyStarted || false,
    error: result.error || null,
  })
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})

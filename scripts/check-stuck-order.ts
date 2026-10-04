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

  const ids = [
    'b6e5f3ea-2ef6-458e-ac74-e92b94b782ba',
    '7ece692c-762f-47b6-ac4c-576db3e04c70',
  ]
  const { data, error } = await supabase
    .from('orders')
    .select(
      'id, order_number, status, pickup_code, cofeplus_dispatch_id, cofeplus_pod_id, cofeplus_environment, machine_activated_at, scan_expires_at, missed_scans, delivery_port, kiosk_id, created_at, updated_at'
    )
    .or(
      `id.in.(${ids.join(',')}),order_number.ilike.%1789719351869%,order_number.ilike.%ZAK3VVUJ%`
    )
    .order('created_at', { ascending: false })
    .limit(10)

  if (error) throw error
  console.log(JSON.stringify(data, null, 2))

  for (const order of data || []) {
    const { data: items } = await supabase
      .from('order_items')
      .select('id, product_id, quantity, products(name, cofeplus_item_code)')
      .eq('order_id', order.id)
    console.log(order.order_number, JSON.stringify(items, null, 2))
  }

  const { data: recent } = await supabase
    .from('orders')
    .select(
      'id, order_number, status, pickup_code, cofeplus_dispatch_id, missed_scans, delivery_port, created_at'
    )
    .eq('kiosk_id', '0ddcecb8-972b-4d75-8186-c31a3ab12f90')
    .gte('created_at', '2026-09-18T08:00:00+00:00')
    .order('created_at', { ascending: false })
    .limit(15)
  console.log('recent', JSON.stringify(recent, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})

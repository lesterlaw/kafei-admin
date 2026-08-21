'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { persistPickupForOrder } from '@/lib/cofeplus/queue'
import {
  dispenseSecondsForEnvironment,
  formatWaitLabel,
} from '@/lib/cofeplus/timing'
import type { CofeplusEnvironment } from '@/lib/cofeplus/config'

const ACTIVE_STATUSES = ['queued', 'pending', 'brewing', 'ready'] as const
const SERVING_STATUSES = ['pending', 'brewing', 'ready'] as const

async function verifyAdmin() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Not authenticated')
  }

  const { data: admin } = await supabase
    .from('admins')
    .select('id')
    .eq('id', user.id)
    .single()

  if (!admin) {
    throw new Error('Admin access required')
  }

  return admin
}

export type QueuePerson = {
  id: string
  orderNumber: string
  status: string
  customerName: string
  customerPhone: string | null
  drink: string
  kioskName: string
  podId: string
  environment: CofeplusEnvironment
  deliveryPort: number | null
  pickupCode: string | null
  createdAt: string
  position: number | null
  waitLabel: string
  isServing: boolean
}

export type QueueLane = {
  key: string
  podId: string
  environment: CofeplusEnvironment
  kioskName: string
  serving: QueuePerson[]
  waiting: QueuePerson[]
}

function asEnvironment(value: string | null | undefined): CofeplusEnvironment {
  return value === 'live' ? 'live' : 'test'
}

function customerName(user: {
  full_name?: string | null
  phone?: string | null
  email?: string | null
} | null) {
  return user?.full_name?.trim() || user?.phone?.trim() || user?.email?.trim() || 'Unknown customer'
}

function drinkName(order: {
  order_items?: { products?: { name?: string | null } | { name?: string | null }[] | null }[] | null
}) {
  const first = order.order_items?.[0]
  const product = Array.isArray(first?.products) ? first?.products[0] : first?.products
  return product?.name?.trim() || 'Drink'
}

export async function getMachineQueueLanes(): Promise<QueueLane[]> {
  await verifyAdmin()
  const supabase = createAdminClient()

  const embedded = await supabase
    .from('orders')
    .select(
      'id, order_number, status, created_at, pickup_code, cofeplus_pod_id, cofeplus_environment, delivery_port, users(full_name, phone, email), kiosks(name, location, pod_id), order_items(products(name))'
    )
    .in('status', [...ACTIVE_STATUSES])
    .not('cofeplus_pod_id', 'is', null)
    .order('created_at', { ascending: true })

  let data: Record<string, unknown>[] = (embedded.data || []) as Record<
    string,
    unknown
  >[]
  if (embedded.error) {
    console.error('getMachineQueueLanes embed failed:', embedded.error.message)
    const fallback = await supabase
      .from('orders')
      .select(
        'id, order_number, status, created_at, pickup_code, cofeplus_pod_id, cofeplus_environment, delivery_port, user_id, kiosk_id'
      )
      .in('status', [...ACTIVE_STATUSES])
      .not('cofeplus_pod_id', 'is', null)
      .order('created_at', { ascending: true })
    if (fallback.error) {
      console.error('getMachineQueueLanes:', fallback.error.message)
      return []
    }
    data = (fallback.data || []) as Record<string, unknown>[]
  }

  const lanes = new Map<string, QueueLane>()

  for (const raw of data || []) {
    const order = raw as {
      id: string
      order_number: string
      status: string
      created_at: string
      pickup_code: string | null
      cofeplus_pod_id: string | null
      cofeplus_environment: string | null
      delivery_port: number | null
      users?: unknown
      kiosks?: unknown
      order_items?: {
        products?: { name?: string | null } | { name?: string | null }[] | null
      }[]
    }
    const podId = String(order.cofeplus_pod_id || '').trim()
    if (!podId) continue
    const environment = asEnvironment(order.cofeplus_environment)
    const key = `${environment}:${podId}`
    const user = (Array.isArray(order.users) ? order.users[0] : order.users) as {
      full_name?: string | null
      phone?: string | null
      email?: string | null
    } | null
    const kiosk = (Array.isArray(order.kiosks) ? order.kiosks[0] : order.kiosks) as {
      name?: string | null
      location?: string | null
    } | null

    if (!lanes.has(key)) {
      lanes.set(key, {
        key,
        podId,
        environment,
        kioskName: kiosk?.name || kiosk?.location || podId,
        serving: [],
        waiting: [],
      })
    }

    const lane = lanes.get(key)!
    const isServing = SERVING_STATUSES.includes(
      order.status as (typeof SERVING_STATUSES)[number]
    )
    const person: QueuePerson = {
      id: order.id,
      orderNumber: order.order_number,
      status: order.status,
      customerName: customerName(user),
      customerPhone: user?.phone || null,
      drink: drinkName(order),
      kioskName: lane.kioskName,
      podId,
      environment,
      deliveryPort: order.delivery_port ?? null,
      pickupCode: order.pickup_code,
      createdAt: order.created_at,
      position: null,
      waitLabel: isServing ? 'At machine' : '',
      isServing,
    }

    if (isServing) {
      lane.serving.push(person)
    } else {
      lane.waiting.push(person)
    }
  }

  for (const lane of lanes.values()) {
    const seconds = dispenseSecondsForEnvironment(lane.environment)
    lane.waiting.forEach((person, index) => {
      person.position = index + 1
      const ahead = lane.serving.length + index
      person.waitLabel = formatWaitLabel(ahead * seconds)
    })
  }

  return [...lanes.values()].sort((a, b) => {
    if (a.environment !== b.environment) {
      return a.environment === 'live' ? -1 : 1
    }
    return a.kioskName.localeCompare(b.kioskName)
  })
}

/**
 * Skip Kafei wait + CofePlus pickup QR: create an `immediate` dispatch
 * so the machine starts brewing now.
 * Docs: POST /partner/v1/dispatches/{podId}?mode=immediate
 */
export async function skipQueueAndBrewNow(orderId: string) {
  await verifyAdmin()
  const supabase = createAdminClient()

  const { data: order, error } = await supabase
    .from('orders')
    .select(
      'id, status, pickup_code, cofeplus_dispatch_id, cofeplus_pod_id, cofeplus_environment, machine_activated_at, created_at, order_number, user_id, kiosk_id, delivery_port'
    )
    .eq('id', orderId)
    .single()

  if (error || !order) {
    return { ok: false, error: 'Order not found' }
  }

  const podId = String(order.cofeplus_pod_id || '').trim()
  if (!podId) {
    return { ok: false, error: 'Order is not linked to a machine pod' }
  }

  const environment = order.cofeplus_environment === 'live' ? 'live' : 'test'
  const result = await persistPickupForOrder(
    supabase,
    order,
    podId,
    environment,
    order.delivery_port,
    'immediate'
  )

  if (result.error) {
    return { ok: false, error: result.error }
  }

  return { ok: true, orderId: result.order.id, status: result.order.status }
}

'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { singaporeDateString, singaporeDayBounds } from '@/lib/product-logic/settings'
import {
  persistImmediateDispatchForOrder,
  persistPickupForOrder,
  refreshOrderQueueState,
  resetOrderForRescan as resetOrderForRescanInQueue,
  type MachineOrderRow,
} from '@/lib/cofeplus/queue'
import { listLiveDispatchesResult } from '@/lib/cofeplus/dispatch'
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

export type LiveDispatchRow = {
  id: string
  state: string
  orderNumber: string
  pickupCode: string
  drink: string
  temperature: string
  milk: string
  deliveryPort: number | null
  timeCreated: string
  isToday: boolean
}

export type CofeplusLiveLane = {
  key: string
  podId: string
  environment: CofeplusEnvironment
  kioskName: string
  error?: string
  items: LiveDispatchRow[]
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
      'id, order_number, status, created_at, pickup_code, cofeplus_dispatch_id, cofeplus_pod_id, cofeplus_environment, machine_activated_at, delivery_port, users(full_name, phone, email), kiosks(name, location, pod_id), order_items(products(name))'
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
        'id, order_number, status, created_at, pickup_code, cofeplus_dispatch_id, cofeplus_pod_id, cofeplus_environment, machine_activated_at, delivery_port, user_id, kiosk_id'
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

  const servingRows = data.filter((raw) => {
    const status = String((raw as { status?: string }).status || '')
    const dispatchId = String(
      (raw as { cofeplus_dispatch_id?: string | null }).cofeplus_dispatch_id ||
        ''
    ).trim()
    return (
      SERVING_STATUSES.includes(status as (typeof SERVING_STATUSES)[number]) &&
      dispatchId
    )
  })

  await Promise.all(
    servingRows.slice(0, 6).map((raw) =>
      Promise.race([
        refreshOrderQueueState(supabase, raw as unknown as MachineOrderRow),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('queue sync timeout')), 8000)
        ),
      ]).catch((error) => {
        console.error('getMachineQueueLanes sync failed:', error)
      })
    )
  )

  if (servingRows.length > 0) {
    const refreshed = await supabase
      .from('orders')
      .select(
        'id, order_number, status, created_at, pickup_code, cofeplus_dispatch_id, cofeplus_pod_id, cofeplus_environment, machine_activated_at, delivery_port, users(full_name, phone, email), kiosks(name, location, pod_id), order_items(products(name))'
      )
      .in('status', [...ACTIVE_STATUSES])
      .not('cofeplus_pod_id', 'is', null)
      .order('created_at', { ascending: true })
    if (!refreshed.error && refreshed.data) {
      data = refreshed.data as Record<string, unknown>[]
    }
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

// "Today" is the Singapore calendar day. The server runs in UTC on Vercel.
function startOfLocalDayIso() {
  return singaporeDayBounds().start.toISOString()
}

function isSameLocalDay(iso: string) {
  if (!iso) return false
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return false
  return singaporeDateString(date) === singaporeDateString()
}

export async function getCofeplusLiveLanes(): Promise<CofeplusLiveLane[]> {
  await verifyAdmin()
  const supabase = createAdminClient()

  const { data: kiosks } = await supabase
    .from('kiosks')
    .select('name, location, pod_id')
    .not('pod_id', 'is', null)

  const { data: recentOrders } = await supabase
    .from('orders')
    .select('cofeplus_pod_id, cofeplus_environment')
    .not('cofeplus_pod_id', 'is', null)
    .gte('created_at', startOfLocalDayIso())

  const kioskNameByPod = new Map<string, string>()
  const pairs = new Map<string, { podId: string; environment: CofeplusEnvironment }>()

  for (const kiosk of kiosks || []) {
    const podId = String(kiosk.pod_id || '').trim()
    if (!podId) continue
    kioskNameByPod.set(
      podId,
      kiosk.name || kiosk.location || podId
    )
    pairs.set(`live:${podId}`, { podId, environment: 'live' })
  }

  for (const order of recentOrders || []) {
    const podId = String(order.cofeplus_pod_id || '').trim()
    if (!podId) continue
    const environment = asEnvironment(order.cofeplus_environment)
    pairs.set(`${environment}:${podId}`, { podId, environment })
    if (!kioskNameByPod.has(podId)) {
      kioskNameByPod.set(podId, podId)
    }
  }

  if (pairs.size === 0) {
    return []
  }

  const lanes = await Promise.all(
    [...pairs.values()].map(async ({ podId, environment }) => {
      const key = `${environment}:${podId}`
      const fetched = await Promise.race([
        listLiveDispatchesResult(podId, environment),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
      ])

      if (!fetched) {
        return {
          key,
          podId,
          environment,
          kioskName: kioskNameByPod.get(podId) || podId,
          error: 'CofePlus live list timed out',
          items: [],
        } satisfies CofeplusLiveLane
      }

      if (!fetched.ok) {
        return {
          key,
          podId,
          environment,
          kioskName: kioskNameByPod.get(podId) || podId,
          error: `CofePlus live list failed (${fetched.status || 'error'})`,
          items: [],
        } satisfies CofeplusLiveLane
      }

      const items = fetched.items
        .map((item) => {
          const timeCreated = item.timeCreated || ''
          return {
            id: item.id,
            state: item.state,
            orderNumber: item.orderNumber === '(none)' ? '' : item.orderNumber,
            pickupCode: item.pickupCode === '(none)' ? '' : item.pickupCode,
            drink: item.displayNote || item.lineItemCodes[0] || 'Drink',
            temperature: item.temperature || '',
            milk: item.milk || '',
            deliveryPort: item.deliveryPort ?? null,
            timeCreated,
            isToday: isSameLocalDay(timeCreated),
          } satisfies LiveDispatchRow
        })
        .sort((a, b) => {
          const aTime = a.timeCreated ? new Date(a.timeCreated).getTime() : 0
          const bTime = b.timeCreated ? new Date(b.timeCreated).getTime() : 0
          return bTime - aTime
        })

      return {
        key,
        podId,
        environment,
        kioskName: kioskNameByPod.get(podId) || podId,
        items,
      } satisfies CofeplusLiveLane
    })
  )

  return lanes.sort((a, b) => {
    if (a.environment !== b.environment) {
      return a.environment === 'live' ? -1 : 1
    }
    return a.kioskName.localeCompare(b.kioskName)
  })
}

/**
 * Skip the kiosk scan and start CofePlus mode=immediate now.
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
  const alreadyHasQr = Boolean(order.pickup_code)
  const result = alreadyHasQr
    ? await persistImmediateDispatchForOrder(
        supabase,
        order,
        podId,
        environment,
        order.delivery_port
      )
    : await persistPickupForOrder(
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

/**
 * Clear a failed dispatch / cancelled miss and mint a new QR for the same order.
 */
export async function resetOrderForRescan(orderId: string) {
  await verifyAdmin()
  const supabase = createAdminClient()
  const result = await resetOrderForRescanInQueue(supabase, orderId)
  if (result.error || !result.order) {
    return { ok: false as const, error: result.error || 'Reset failed' }
  }

  revalidatePath('/dashboard/queue')
  revalidatePath('/dashboard/orders')
  revalidatePath(`/dashboard/orders/${orderId}`)

  return {
    ok: true as const,
    orderId: result.order.id,
    pickupCode: result.order.pickup_code,
    deliveryPort: result.order.delivery_port,
  }
}

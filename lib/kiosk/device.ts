import { randomInt } from 'crypto'
import type { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Kiosk } from '@/types/database'

export interface PairedKiosk extends Kiosk {
  device_token: string
  last_seen_at?: string | null
}

const PUBLIC_KIOSK_COLUMNS =
  'id, name, location, address, details, latitude, longitude, is_active, pod_id, created_at, updated_at'

const TOKEN_DIGITS = 10

export function publicKioskColumns() {
  return PUBLIC_KIOSK_COLUMNS
}

export function newKioskDeviceToken() {
  return String(randomInt(10 ** (TOKEN_DIGITS - 1), 10 ** TOKEN_DIGITS))
}

export function normalizeDeviceToken(value: string) {
  return value.replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/[\s-]/g, '').trim()
}

export function isKioskDeviceToken(value: string) {
  if (/^\d{10}$/.test(value)) return true
  return /^kiosk_[a-f0-9]{20,}$/i.test(value)
}

function readDeviceToken(request: NextRequest) {
  const header = normalizeDeviceToken(request.headers.get('x-kiosk-token') || '')
  if (isKioskDeviceToken(header)) return header

  const auth = request.headers.get('authorization') || ''
  if (auth.toLowerCase().startsWith('bearer ')) {
    const token = normalizeDeviceToken(auth.slice(7))
    if (isKioskDeviceToken(token)) return token
  }

  const query = normalizeDeviceToken(request.nextUrl.searchParams.get('token') || '')
  if (isKioskDeviceToken(query)) return query

  return ''
}

async function readDeviceTokenFromBody(request: NextRequest) {
  try {
    const body = (await request.clone().json()) as { token?: unknown } | null
    if (typeof body?.token !== 'string') return ''
    const token = normalizeDeviceToken(body.token)
    return isKioskDeviceToken(token) ? token : ''
  } catch {
    return ''
  }
}

export type KioskAuthResult =
  | { ok: true; kiosk: PairedKiosk }
  | { ok: false; status: 401 | 403; error: string }

export async function authenticateKioskDevice(
  request: NextRequest
): Promise<KioskAuthResult> {
  const token = readDeviceToken(request) || (await readDeviceTokenFromBody(request))
  if (!token) {
    return { ok: false, status: 401, error: 'Invalid kiosk token' }
  }

  const adminClient = createAdminClient()
  const { data, error } = await adminClient
    .from('kiosk_devices')
    .select('kiosk_id, device_token, last_seen_at, kiosks(*)')
    .eq('device_token', token)
    .maybeSingle()

  if (error || !data) {
    return { ok: false, status: 401, error: 'Invalid kiosk token' }
  }

  const raw = data.kiosks as Kiosk | Kiosk[] | null
  const kiosk = Array.isArray(raw) ? raw[0] : raw
  if (!kiosk) {
    return { ok: false, status: 401, error: 'Invalid kiosk token' }
  }
  if (!kiosk.is_active) {
    return { ok: false, status: 403, error: 'This kiosk is blocked' }
  }

  await adminClient
    .from('kiosk_devices')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('kiosk_id', kiosk.id)

  return {
    ok: true,
    kiosk: {
      ...kiosk,
      device_token: data.device_token,
      last_seen_at: data.last_seen_at,
    },
  }
}

function isUniqueTokenError(error: { message?: string; code?: string } | null) {
  const message = error?.message || ''
  return error?.code === '23505' || /duplicate|unique/i.test(message)
}

export async function issueKioskDeviceToken(kioskId: string, token?: string) {
  const adminClient = createAdminClient()

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const nextToken = token || newKioskDeviceToken()
    const { error } = await adminClient.from('kiosk_devices').upsert(
      {
        kiosk_id: kioskId,
        device_token: nextToken,
        created_at: new Date().toISOString(),
        last_seen_at: null,
      },
      { onConflict: 'kiosk_id' }
    )

    if (!error) {
      return { ok: true as const, token: nextToken }
    }
    if (token || !isUniqueTokenError(error)) {
      return { ok: false as const, error: error.message }
    }
  }

  return { ok: false as const, error: 'Failed to issue a unique kiosk token' }
}

export async function getKioskDevice(kioskId: string) {
  const adminClient = createAdminClient()
  const { data } = await adminClient
    .from('kiosk_devices')
    .select('device_token, created_at, last_seen_at')
    .eq('kiosk_id', kioskId)
    .maybeSingle()
  return data
}

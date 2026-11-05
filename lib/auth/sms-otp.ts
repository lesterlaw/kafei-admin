import { createHmac, randomInt, timingSafeEqual } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'

// SMS sign-in codes for the mobile app, sent through OneWaySMS.
//
// On when these are set on the server:
//   ONEWAYSMS_API_USERNAME=<apiusername>
//   ONEWAYSMS_API_PASSWORD=<apipassword>
// Optional:
//   ONEWAYSMS_SENDER_ID=KAFEI            sender name shown on the phone (max 11 characters)
//   ONEWAYSMS_API_URL=https://gatewayv5.onewaysms.sg/api.aspx
//   SMS_OTP_SECRET=<32+ random chars>    key for hashing codes (defaults to the service role key)
//
// Codes live in public.phone_otps as a keyed hash only (migration 024).

const CODE_TTL_MINUTES = 5
const RESEND_COOLDOWN_SECONDS = 30
const MAX_SENDS_PER_HOUR = 5
const MAX_ATTEMPTS = 5
const DEFAULT_API_URL = 'https://gatewayv5.onewaysms.sg/api.aspx'

export type SmsOtpResult = { ok: true } | { ok: false; status: number; message: string }

function env(name: string): string | null {
  return process.env[name]?.trim() || null
}

export function isSmsOtpConfigured(): boolean {
  return Boolean(env('ONEWAYSMS_API_USERNAME') && env('ONEWAYSMS_API_PASSWORD'))
}

/** Digits with country code, e.g. "+65 9123 4567" -> "6591234567". Null if not a phone number. */
export function normalizeSmsPhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, '')
  return /^\d{10,15}$/.test(digits) ? digits : null
}

function hashCode(phone: string, code: string): string {
  const key = env('SMS_OTP_SECRET') || env('SUPABASE_SERVICE_ROLE_KEY')
  if (!key) throw new Error('SMS_OTP_SECRET is not set')
  return createHmac('sha256', key).update(`${phone}:${code}`).digest('hex')
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

// OneWaySMS replies with a positive message id, or a negative error code
const ONEWAYSMS_ERRORS: Record<string, string> = {
  '-100': 'apiusername or apipassword is invalid',
  '-200': 'sender id is invalid',
  '-300': 'mobile number is invalid',
  '-400': 'language type is invalid',
  '-500': 'message has invalid characters',
  '-600': 'insufficient credit',
}

async function sendOneWaySms(mobileNo: string, message: string): Promise<string> {
  const params = new URLSearchParams({
    apiusername: env('ONEWAYSMS_API_USERNAME') || '',
    apipassword: env('ONEWAYSMS_API_PASSWORD') || '',
    mobileno: mobileNo,
    senderid: env('ONEWAYSMS_SENDER_ID') || 'KAFEI',
    languagetype: '1',
    message,
  })
  const response = await fetch(`${env('ONEWAYSMS_API_URL') || DEFAULT_API_URL}?${params}`, {
    signal: AbortSignal.timeout(15000),
    cache: 'no-store',
  })
  const body = (await response.text()).trim()
  if (!response.ok || !/^\d+$/.test(body) || Number(body) <= 0) {
    const reason = ONEWAYSMS_ERRORS[body] || `HTTP ${response.status}: ${body.slice(0, 200)}`
    throw new Error(`OneWaySMS send failed (${reason})`)
  }
  return body
}

export async function sendSmsOtp(rawPhone: string): Promise<SmsOtpResult> {
  const phone = normalizeSmsPhone(rawPhone)
  if (!phone) {
    return { ok: false, status: 400, message: 'Please enter a valid phone number.' }
  }

  const adminClient = createAdminClient()
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { data: recent, error: recentError } = await adminClient
    .from('phone_otps')
    .select('created_at')
    .eq('phone', phone)
    .gte('created_at', hourAgo)
    .order('created_at', { ascending: false })

  if (recentError) {
    console.error('[sms-otp] read recent codes failed', recentError.message)
    return { ok: false, status: 503, message: "We couldn't send your sign-in code right now. Please try again later." }
  }

  const lastSentAt = recent?.[0] ? new Date(recent[0].created_at).getTime() : 0
  if (Date.now() - lastSentAt < RESEND_COOLDOWN_SECONDS * 1000) {
    return { ok: false, status: 429, message: 'A code was just sent. Please wait a moment before asking for another.' }
  }
  if ((recent?.length ?? 0) >= MAX_SENDS_PER_HOUR) {
    return { ok: false, status: 429, message: 'Too many codes requested. Please try again in an hour.' }
  }

  const code = randomInt(0, 1_000_000).toString().padStart(6, '0')
  const message = `KAFEI: Your sign-in code is ${code}. It expires in ${CODE_TTL_MINUTES} minutes. Do not share it with anyone.`

  let providerRef: string
  try {
    providerRef = await sendOneWaySms(phone, message)
  } catch (error: any) {
    console.error('[sms-otp]', error.message)
    return { ok: false, status: 503, message: "We couldn't send your sign-in code right now. Please try again later or email hello@kafei.sg." }
  }

  const { error: insertError } = await adminClient.from('phone_otps').insert({
    phone,
    code_hash: hashCode(phone, code),
    expires_at: new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000).toISOString(),
    provider_ref: providerRef,
  })
  if (insertError) {
    console.error('[sms-otp] save code failed', insertError.message)
    return { ok: false, status: 503, message: "We couldn't send your sign-in code right now. Please try again later." }
  }

  return { ok: true }
}

/** Checks the latest code sent to this phone and uses it up when it matches. */
export async function verifySmsOtp(rawPhone: string, rawCode: string): Promise<SmsOtpResult> {
  const phone = normalizeSmsPhone(rawPhone)
  const code = String(rawCode).trim()
  if (!phone || !/^\d{6}$/.test(code)) {
    return { ok: false, status: 400, message: 'Please enter the 6-digit code.' }
  }

  const adminClient = createAdminClient()
  const { data: otp, error } = await adminClient
    .from('phone_otps')
    .select('id, code_hash, expires_at, attempts, consumed_at')
    .eq('phone', phone)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[sms-otp] read code failed', error.message)
    return { ok: false, status: 503, message: 'Something went wrong. Please try again.' }
  }
  if (!otp || otp.consumed_at || new Date(otp.expires_at).getTime() < Date.now()) {
    return { ok: false, status: 400, message: 'This code has expired. Tap resend for a new one.' }
  }
  if (otp.attempts >= MAX_ATTEMPTS) {
    return { ok: false, status: 429, message: 'Too many wrong tries. Tap resend for a new code.' }
  }

  if (!safeEqual(hashCode(phone, code), otp.code_hash)) {
    await adminClient
      .from('phone_otps')
      .update({ attempts: otp.attempts + 1 })
      .eq('id', otp.id)
    return { ok: false, status: 400, message: 'That code is not right. Please check it and try again.' }
  }

  // Use the code up; only one request can win this
  const { data: consumed } = await adminClient
    .from('phone_otps')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', otp.id)
    .is('consumed_at', null)
    .select('id')

  if (!consumed?.length) {
    return { ok: false, status: 400, message: 'This code has already been used. Tap resend for a new one.' }
  }

  return { ok: true }
}

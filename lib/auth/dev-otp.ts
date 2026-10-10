import { createHmac, timingSafeEqual } from 'crypto'

// Test-only sign-in used while real SMS OTP is not set up.
//
// Off unless all of these are set on the server:
//   DEV_OTP_ENABLED=true
//   DEV_OTP_CODE=<6 digits>                 the code testers type
//   DEV_OTP_ALLOWLIST=+6591234567,qa@x.com  phones or emails allowed to use it
//   DEV_TOKEN_SECRET=<32+ random chars>     signs the session tokens it issues
//
// Anyone not on the allowlist gets the real OTP flow. Tokens are signed and expire,
// so a token cannot be forged from a user ID.

const ACCESS_TTL_SECONDS = 7 * 24 * 60 * 60
const REFRESH_TTL_SECONDS = 60 * 24 * 60 * 60
const TOKEN_PREFIX = 'devv2'

type DevTokenKind = 'access' | 'refresh'

function secret(): string | null {
  const value = process.env.DEV_TOKEN_SECRET || ''
  return value.length >= 32 ? value : null
}

export function isDevOtpEnabled(): boolean {
  return (
    process.env.DEV_OTP_ENABLED === 'true' &&
    /^\d{6}$/.test(process.env.DEV_OTP_CODE || '') &&
    secret() !== null
  )
}

function normalizeIdentity(value: string): string {
  const trimmed = value.trim().toLowerCase()
  return trimmed.includes('@') ? trimmed : trimmed.replace(/\D/g, '')
}

export function isDevOtpAllowed(identity?: string | null): boolean {
  if (!identity || !isDevOtpEnabled()) return false
  const wanted = normalizeIdentity(identity)
  if (!wanted) return false
  return (process.env.DEV_OTP_ALLOWLIST || '')
    .split(',')
    .map(normalizeIdentity)
    .filter(Boolean)
    .includes(wanted)
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

export function isDevOtpCode(code: string): boolean {
  const expected = process.env.DEV_OTP_CODE || ''
  return isDevOtpEnabled() && safeEqual(String(code), expected)
}

function sign(payload: string, key: string): string {
  return createHmac('sha256', key).update(payload).digest('base64url')
}

export function signDevToken(userId: string, kind: DevTokenKind): string {
  const key = secret()
  if (!key) throw new Error('DEV_TOKEN_SECRET is not set')
  const ttl = kind === 'access' ? ACCESS_TTL_SECONDS : REFRESH_TTL_SECONDS
  const expires = Math.floor(Date.now() / 1000) + ttl
  const payload = `${kind}.${userId}.${expires}`
  return `${TOKEN_PREFIX}.${payload}.${sign(payload, key)}`
}

export function isDevTokenFormat(token: string): boolean {
  return token.startsWith(`${TOKEN_PREFIX}.`)
}

/** Returns the user ID for a valid, unexpired dev token of the given kind, otherwise null. */
export function verifyDevToken(token: string, kind: DevTokenKind): string | null {
  const key = secret()
  if (!key || !isDevOtpEnabled() || !isDevTokenFormat(token)) return null

  const parts = token.split('.')
  if (parts.length !== 5) return null
  const [, tokenKind, userId, expires, signature] = parts
  if (tokenKind !== kind || !userId || !/^\d+$/.test(expires)) return null
  if (Number(expires) < Math.floor(Date.now() / 1000)) return null

  const expected = sign(`${tokenKind}.${userId}.${expires}`, key)
  return safeEqual(signature, expected) ? userId : null
}

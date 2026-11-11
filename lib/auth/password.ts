import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto'
import { promisify } from 'util'
import type { createAdminClient } from '@/lib/supabase/admin'

// App sign-in passwords (migration 027). Hashes live in public.user_passwords.

const scrypt = promisify(scryptCallback) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>

const KEY_LENGTH = 64
const MAX_FAILED_ATTEMPTS = 5
const LOCK_MINUTES = 15

export const MIN_PASSWORD_LENGTH = 8

/** Null when the password is fine, otherwise a message for the customer. */
export function passwordProblem(password: unknown): string | null {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters`
  }
  if (password.length > 128) {
    return 'Use 128 characters or fewer'
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return 'Use at least one letter and one number'
  }
  return null
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const hash = await scrypt(password, salt, KEY_LENGTH)
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`
}

async function matches(password: string, stored: string): Promise<boolean> {
  const [scheme, saltText, hashText] = stored.split('$')
  if (scheme !== 'scrypt' || !saltText || !hashText) return false
  const expected = Buffer.from(hashText, 'base64')
  const actual = await scrypt(password, Buffer.from(saltText, 'base64'), expected.length)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

type AdminClient = ReturnType<typeof createAdminClient>

export async function hasPassword(adminClient: AdminClient, userId: string): Promise<boolean> {
  const { data } = await adminClient
    .from('user_passwords')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()
  return Boolean(data)
}

export async function setPassword(adminClient: AdminClient, userId: string, password: string) {
  const { error } = await adminClient.from('user_passwords').upsert({
    user_id: userId,
    password_hash: await hashPassword(password),
    failed_attempts: 0,
    locked_until: null,
    updated_at: new Date().toISOString(),
  })
  if (error) throw new Error(`Save password failed: ${error.message}`)
}

export type PasswordCheck =
  | { ok: true }
  | { ok: false; reason: 'not_set' | 'wrong' | 'locked'; minutes?: number }

/** Checks a password and counts wrong tries; too many in a row locks sign-in for a while. */
export async function checkPassword(
  adminClient: AdminClient,
  userId: string,
  password: string
): Promise<PasswordCheck> {
  const { data: row } = await adminClient
    .from('user_passwords')
    .select('password_hash, failed_attempts, locked_until')
    .eq('user_id', userId)
    .maybeSingle()

  if (!row) return { ok: false, reason: 'not_set' }

  const lockedMs = row.locked_until ? new Date(row.locked_until).getTime() - Date.now() : 0
  if (lockedMs > 0) {
    return { ok: false, reason: 'locked', minutes: Math.ceil(lockedMs / 60000) }
  }

  if (await matches(password, row.password_hash)) {
    if (row.failed_attempts > 0 || row.locked_until) {
      await adminClient
        .from('user_passwords')
        .update({ failed_attempts: 0, locked_until: null })
        .eq('user_id', userId)
    }
    return { ok: true }
  }

  const failed = row.failed_attempts + 1
  const lock = failed >= MAX_FAILED_ATTEMPTS
  await adminClient
    .from('user_passwords')
    .update({
      failed_attempts: lock ? 0 : failed,
      locked_until: lock ? new Date(Date.now() + LOCK_MINUTES * 60000).toISOString() : null,
    })
    .eq('user_id', userId)

  return lock ? { ok: false, reason: 'locked', minutes: LOCK_MINUTES } : { ok: false, reason: 'wrong' }
}

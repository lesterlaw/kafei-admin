import type { createAdminClient } from '@/lib/supabase/admin'

function normalizePhone(phone?: string | null): string {
  return (phone ?? '').replace(/\D/g, '')
}

/** The users row for this phone, matched on digits so "+65 9123 4567" and "6591234567" agree. */
export async function findUserByPhone(
  adminClient: ReturnType<typeof createAdminClient>,
  phone: string
) {
  const normalizedPhone = normalizePhone(phone)
  const phoneCandidates = Array.from(
    new Set([phone, normalizedPhone, `+${normalizedPhone}`].filter(Boolean))
  )

  const { data, error } = await adminClient
    .from('users')
    .select('*')
    .in('phone', phoneCandidates)

  if (error) {
    console.error('Failed to find user by phone:', error)
    return null
  }

  return data.find((user) => normalizePhone(user.phone) === normalizedPhone) ?? null
}

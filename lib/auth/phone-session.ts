import { createClient, type Session, type User as AuthUser } from '@supabase/supabase-js'
import type { createAdminClient } from '@/lib/supabase/admin'

/**
 * Real Supabase session for a phone user whose SMS code we checked ourselves
 * (lib/auth/sms-otp.ts). Supabase has no SMS provider here, so we issue a
 * one-time email link server side and redeem it at once. Nothing is emailed.
 */
export async function createPhoneUserSession(
  adminClient: ReturnType<typeof createAdminClient>,
  authUser: AuthUser,
  phone: string
): Promise<Session> {
  let email = authUser.email
  if (!email) {
    // Users made by the old Supabase phone sign-in may have no email
    email = `${phone.replace(/\D/g, '')}@phone.kafei.local`
    const { error } = await adminClient.auth.admin.updateUserById(authUser.id, {
      email,
      email_confirm: true,
    })
    if (error) throw new Error(`Set placeholder email failed: ${error.message}`)
  }

  const { data: link, error: linkError } = await adminClient.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })
  const tokenHash = link?.properties?.hashed_token
  if (linkError || !tokenHash) {
    throw new Error(`Generate sign-in link failed: ${linkError?.message || 'no token'}`)
  }

  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { data, error } = await anonClient.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'magiclink',
  })
  if (error || !data.session) {
    throw new Error(`Redeem sign-in link failed: ${error?.message || 'no session'}`)
  }
  return data.session
}

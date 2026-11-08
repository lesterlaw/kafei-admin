import type { SupabaseClient } from '@supabase/supabase-js'

// Fixed id for the staff free drink offered in the app's promo list. It is not a
// promo_codes row, so nobody can edit or assign it from the Promo Codes page.
// Must stay a v4-shaped UUID: the app only sends UUID-shaped coupon ids.
export const STAFF_FREE_DRINK_ID = '5a7ff000-0000-4000-8000-000000000001'

// Plain 100% promo with no kind, so the app takes it off the whole cup (add-ons
// included) and skips Stripe when the total is $0.
export const STAFF_FREE_DRINK_PROMO = {
  id: STAFF_FREE_DRINK_ID,
  name: 'Staff free drink',
  code: 'STAFF',
  type: 'percent' as const,
  discount_value: 100,
  is_system: true,
  is_active: true,
}

export async function isStaffUser(
  adminClient: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data } = await adminClient
    .from('users')
    .select('is_staff')
    .eq('id', userId)
    .maybeSingle()
  return Boolean(data?.is_staff)
}

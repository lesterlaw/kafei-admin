import { NextRequest } from 'next/server'
import { createApiResponse, createApiError, authenticateRequest } from '@/lib/api/middleware'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStripeForMode } from '@/lib/stripe/server'
import { getActiveStripeMode, isStripeModeConfigured } from '@/lib/stripe/mode'
import {
  grantWelcomeIfNeeded,
  InvalidReferralCodeError,
  recordReferralAtSignup,
} from '@/lib/product-logic'

// GET - Get current user profile
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return createApiError('Unauthorized', 401)
    }

    const adminClient = createAdminClient()
    const { data, error } = await adminClient
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single()

    if (error) {
      return createApiError(error.message, 404)
    }

    return createApiResponse(data)
  } catch (error: any) {
    return createApiError(error.message || 'Internal server error', 500)
  }
}

// PUT - Update current user profile
export async function PUT(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return createApiError('Unauthorized', 401)
    }

    const { full_name, email: rawEmail, referral_code_used } = await request.json()
    const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : rawEmail

    const adminClient = createAdminClient()

    if (email !== undefined) {
      if (typeof email !== 'string' || !EMAIL_PATTERN.test(email)) {
        return createApiError('Please enter a valid email address', 400)
      }

      // users.email is unique, so catch a clash here with a clear message
      const { data: emailOwner } = await adminClient
        .from('users')
        .select('id')
        .eq('email', email)
        .neq('id', user.id)
        .maybeSingle()

      if (emailOwner) {
        return createApiError(EMAIL_TAKEN_MESSAGE, 409)
      }
    }

    if (typeof referral_code_used === 'string' && referral_code_used.trim()) {
      try {
        await recordReferralAtSignup(adminClient, user.id, referral_code_used)
      } catch (err) {
        if (err instanceof InvalidReferralCodeError) {
          return createApiError(err.message, 400)
        }
        console.error('[auth/me] referral record failed', err)
        return createApiError('Unable to apply this referral code', 400)
      }
    }

    // Build update object with only provided fields
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    }

    if (full_name !== undefined) {
      updateData.full_name = full_name
    }

    if (email !== undefined) {
      updateData.email = email
    }

    // Grant welcome drink + beans on first profile completion
    try {
      await grantWelcomeIfNeeded(adminClient, user.id)
    } catch (err) {
      console.error('[auth/me] welcome grant failed', err)
    }

    // Update user profile
    const { data, error } = await adminClient
      .from('users')
      .update(updateData)
      .eq('id', user.id)
      .select()
      .single()

    if (error) {
      // Another sign-up may have taken the email between the check and the update
      if (error.code === '23505') {
        return createApiError(EMAIL_TAKEN_MESSAGE, 409)
      }
      return createApiError(error.message, 500)
    }

    return createApiResponse(data)
  } catch (error: any) {
    return createApiError(error.message || 'Internal server error', 500)
  }
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const EMAIL_TAKEN_MESSAGE =
  'This email is already used by another KAFEI account. Please use a different email.'

// DELETE - Permanently delete the current user's account (App Store guideline 5.1.1(v)).
// Cancels any auto-renewing plan right away, then removes the auth user; every table
// that references public.users cascades from there.
export async function DELETE(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return createApiError('Unauthorized', 401)
    }

    const adminClient = createAdminClient()

    const { data: subscriptions } = await adminClient
      .from('user_subscriptions')
      .select('stripe_subscription_id')
      .eq('user_id', user.id)
      .not('stripe_subscription_id', 'is', null)

    for (const { stripe_subscription_id } of subscriptions ?? []) {
      await cancelStripeSubscriptionNow(adminClient, stripe_subscription_id)
    }

    await adminClient.storage
      .from('product-images')
      .remove(['jpg', 'jpeg', 'png', 'webp', 'heic'].map((ext) => `avatars/${user.id}.${ext}`))
      .then(
        () => undefined,
        () => undefined
      )

    const { error } = await adminClient.auth.admin.deleteUser(user.id)
    if (error) {
      return createApiError(error.message, 500)
    }

    return createApiResponse({ deleted: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return createApiError(message, 500)
  }
}

// The plan may have been bought before the admin switched Stripe mode, so try both.
async function cancelStripeSubscriptionNow(
  adminClient: ReturnType<typeof createAdminClient>,
  subscriptionId: string
) {
  const active = await getActiveStripeMode(adminClient)
  const other = active === 'live' ? 'test' : 'live'
  try {
    await getStripeForMode(active).subscriptions.cancel(subscriptionId)
  } catch (error) {
    if (isStripeErrorCode(error, 'resource_missing') && isStripeModeConfigured(other)) {
      try {
        await getStripeForMode(other).subscriptions.cancel(subscriptionId)
      } catch (otherError) {
        if (!isStripeErrorCode(otherError, 'resource_missing')) throw otherError
      }
      return
    }
    // Already cancelled in Stripe is fine; anything else should stop the deletion.
    if (!isStripeErrorCode(error, 'resource_missing')) throw error
  }
}

function isStripeErrorCode(error: unknown, code: string) {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === code
}

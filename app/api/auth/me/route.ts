import { NextRequest } from 'next/server'
import { createApiResponse, createApiError, authenticateRequest } from '@/lib/api/middleware'
import { createAdminClient } from '@/lib/supabase/admin'
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

    const { full_name, email, referral_code_used } = await request.json()

    const adminClient = createAdminClient()

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
      return createApiError(error.message, 500)
    }

    return createApiResponse(data)
  } catch (error: any) {
    return createApiError(error.message || 'Internal server error', 500)
  }
}

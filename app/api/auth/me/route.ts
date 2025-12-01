import { NextRequest, NextResponse } from 'next/server'
import { createApiResponse, createApiError, authenticateRequest } from '@/lib/api/middleware'
import { createAdminClient } from '@/lib/supabase/admin'

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

    // Handle referral code if provided
    if (referral_code_used) {
      // Find the user who owns this referral code
      const { data: referrer } = await adminClient
        .from('users')
        .select('id')
        .eq('referral_code', referral_code_used)
        .single()

      if (referrer) {
        // Create referral record
        await adminClient.from('referrals').insert({
          referrer_id: referrer.id,
          referred_id: user.id,
          referral_code: referral_code_used,
        })
      }
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

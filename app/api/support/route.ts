import { NextRequest } from 'next/server'
import { z } from 'zod'
import {
  authenticateRequest,
  createApiError,
  createApiResponse,
} from '@/lib/api/middleware'
import { createAdminClient } from '@/lib/supabase/admin'

const CATEGORY_LABELS = {
  enquiry: 'Enquiry',
  feedback: 'Feedback',
  help: 'Help',
  complaint: 'Complaint',
} as const

const createTicketSchema = z.object({
  category: z.enum(['enquiry', 'feedback', 'help', 'complaint']),
  subject: z.string().trim().max(200).optional(),
  message: z.string().trim().min(1).max(4000),
})

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return createApiError('Unauthorized', 401)
    }

    const body = await request.json()
    const parsed = createTicketSchema.safeParse(body)
    if (!parsed.success) {
      return createApiError('Please enter a message for your request.', 400)
    }

    const { category, subject, message } = parsed.data
    const categoryLabel = CATEGORY_LABELS[category]
    const ticketSubject = subject
      ? `${categoryLabel}: ${subject}`
      : categoryLabel

    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('support_tickets')
      .insert({
        user_id: user.id,
        subject: ticketSubject,
        message,
        status: 'open',
      })
      .select('*')
      .single()

    if (error) {
      console.error('create support ticket:', error.message)
      return createApiError('Unable to submit your request right now.', 500)
    }

    return createApiResponse(data, 201)
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Internal server error'
    return createApiError(message, 500)
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return createApiError('Unauthorized', 401)
    }

    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('support_tickets')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      return createApiError(error.message, 500)
    }

    return createApiResponse(data || [])
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Internal server error'
    return createApiError(message, 500)
  }
}

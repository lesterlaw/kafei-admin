import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createApiResponse, createApiError, authenticateRequest } from '@/lib/api/middleware'
import { getStripeServer } from '@/lib/stripe/server'

const schema = z.object({
  amount: z.number().positive(),
  currency: z.string().default('sgd'),
  order_metadata: z
    .object({
      product_id: z.string().optional(),
      kiosk_id: z.string().optional(),
    })
    .optional(),
})

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return createApiError('Unauthorized', 401)
    }

    const body = await request.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return createApiError('Invalid payment payload', 400)
    }

    const { amount, currency, order_metadata } = parsed.data
    const stripe = getStripeServer()

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: currency.toLowerCase(),
      automatic_payment_methods: { enabled: true },
      metadata: {
        user_id: user.id,
        product_id: order_metadata?.product_id || '',
        kiosk_id: order_metadata?.kiosk_id || '',
        purpose: 'order_checkout',
      },
    })

    return createApiResponse({
      client_secret: paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id,
      publishable_key: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || null,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return createApiError(message, 500)
  }
}

import Stripe from 'stripe'

const stripeSecretKey = process.env.STRIPE_SECRET_KEY!

export const getStripeServer = () => {
  if (!stripeSecretKey) {
    throw new Error('Missing STRIPE_SECRET_KEY')
  }
  return new Stripe(stripeSecretKey, {
    apiVersion: '2025-10-29.clover',
  })
}


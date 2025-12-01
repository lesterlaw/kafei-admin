import { loadStripe } from '@stripe/stripe-js'

const stripePublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!

export const getStripeClient = () => {
  if (!stripePublishableKey) {
    throw new Error('Missing NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY')
  }
  return loadStripe(stripePublishableKey)
}





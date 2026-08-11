export interface User {
  id: string
  email: string
  phone?: string
  full_name?: string
  created_at: string
  updated_at: string
  is_blocked: boolean
  referral_code: string
}

export interface Admin {
  id: string
  email: string
  full_name: string
  created_at: string
  updated_at: string
}

export interface SubscriptionTier {
  id: string
  name: string
  description: string
  price: number
  period: 'monthly' | 'annual' | '3year'
  features: string[]
  coupon_per_day: number
  created_at: string
  updated_at: string
}

export interface UserSubscription {
  id: string
  user_id: string
  tier_id: string
  status: 'active' | 'cancelled' | 'expired'
  start_date: string
  end_date?: string
  renews_at?: string
  created_at: string
  updated_at: string
}

export interface Transaction {
  id: string
  user_id: string
  subscription_id?: string
  amount: number
  currency: string
  status: 'success' | 'failed' | 'pending'
  payment_method: string
  stripe_payment_intent_id?: string
  created_at: string
}

export interface Product {
  id: string
  name: string
  description: string
  price: number
  temperature?: 'hot' | 'cold' | 'both'
  image_url?: string
  is_hidden: boolean
  /** CofePlus menu itemCode for machine dispatch */
  cofeplus_item_code?: string | null
  created_at: string
  updated_at: string
}

export interface AddOn {
  id: string
  name: string
  description: string
  price: number
  temperature?: 'hot' | 'cold' | 'both'
  is_hidden: boolean
  created_at: string
  updated_at: string
}

export interface ProductAddOn {
  product_id: string
  addon_id: string
}

export interface Order {
  id: string
  order_number: string
  user_id: string
  kiosk_id: string
  coupon_id?: string
  status: 'queued' | 'pending' | 'brewing' | 'ready' | 'completed' | 'cancelled'
  total_amount: number
  /** CofePlus pickupCode — encode this string as the machine QR */
  pickup_code?: string | null
  cofeplus_dispatch_id?: string | null
  cofeplus_pod_id?: string | null
  cofeplus_environment?: 'test' | 'live' | null
  created_at: string
  updated_at: string
}

export interface OrderItem {
  id: string
  order_id: string
  product_id: string
  quantity: number
  price: number
  addons?: string[]
}

export interface Coupon {
  id: string
  user_id: string
  code: string
  qr_code?: string
  expires_at: string
  is_redeemed: boolean
  redeemed_at?: string
  order_id?: string
  created_at: string
}

export interface Referral {
  id: string
  referrer_id: string
  referred_id: string
  referral_code: string
  created_at: string
}

export interface Kiosk {
  id: string
  name: string
  location: string
  address: string
  /** Free-text location note shown in the app (e.g. Beside counter 4) */
  details?: string | null
  latitude?: number
  longitude?: number
  is_active: boolean
  /** CofePlus machine serial / pod ID (e.g. RCK111) */
  pod_id?: string | null
  created_at: string
  updated_at: string
}

export interface SupportTicket {
  id: string
  user_id: string
  subject: string
  message: string
  status: 'open' | 'in_progress' | 'resolved' | 'closed'
  attachments?: string[]
  created_at: string
  updated_at: string
}

export interface Notification {
  id: string
  title: string
  content: string
  trigger_event: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Subpage {
  id: string
  title: string
  slug: string
  content: string
  created_at: string
  updated_at: string
}

export interface Banner {
  id: string
  image_url: string
  title?: string | null
  link_url?: string | null
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export type PromoCodeType = 'percent' | 'fixed' | 'nth_cup' | 'referral'

export interface PromoCode {
  id: string
  name: string
  code?: string | null
  type: PromoCodeType
  discount_value: number
  nth_cup?: number | null
  referral_threshold?: number | null
  validity_days?: number | null
  min_amount: number
  max_discount_amount?: number | null
  max_redemptions_total?: number | null
  max_redemptions_per_user?: number | null
  starts_at?: string | null
  ends_at?: string | null
  applies_to_all_users: boolean
  is_system: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface PromoCodeUser {
  promo_code_id: string
  user_id: string
}





export interface User {
  id: string
  email: string
  phone?: string
  full_name?: string
  created_at: string
  updated_at: string
  is_blocked: boolean
  referral_code: string
  avatar_url?: string | null
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
  period: 'free' | 'monthly' | 'annual' | '3year'
  features: string[]
  coupon_per_day: number
  is_hidden?: boolean
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
  cofeplus_group?: string | null
  cofeplus_flag?: string | null
  cofeplus_locator?: string | null
  source?: 'manual' | 'cofeplus'
  created_at: string
  updated_at: string
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
  kind?: 'daily_24h' | 'welcome' | 'pass' | 'other'
  granted_at?: string
  created_at: string
}

export interface Referral {
  id: string
  referrer_id: string
  referred_id: string
  referral_code: string
  status?: 'pending' | 'activated_free' | 'activated_paid'
  activated_at?: string | null
  reward_issued?: boolean
  credit_issued?: boolean
  created_at: string
}

export interface ProductLogicSettings {
  stamp_cost: number
  stamp_max: number
  checkin_beans: number
  welcome_beans: number
  free_bean_expiry_days: number
  scan_window_seconds: number
  robot_max_orders: number
  bean_americano: number
  bean_latte: number
  bean_addon: number
  addon_cash_price: number
  free_referral_threshold: number
  free_pass_max: number
  pass_duration_days: number
  paid_free_referral_beans: number
  paid_paid_referral_beans: number
  paid_referral_credit_threshold: number
  membership_credit_cents: number
  paid_referral_drink_coupons?: number
  paid_referral_addon_coupons?: number
  paid_referral_coupon_expiry_days?: number
}

export interface UserWallet {
  stamp_count: number
  stamp_cost: number
  stamp_max: number
  welcome_drink_available: boolean
  last_checkin_on: string | null
  can_checkin: boolean
  membership_credit_cents: number
  pass_active_until: string | null
  pass_pending_until: string | null
  passes_earned_count: number
  passes_max: number
}

export interface WalletResponse {
  membership: {
    kind: 'free' | 'monthly' | 'annual' | 'pass'
    isPaid: boolean
    isPass: boolean
    seesAds: boolean
    collectsStamps: boolean
    fullBeanCatalogue: boolean
    freeBeanExpiry: boolean
    passActiveUntil: string | null
  }
  wallet: UserWallet
  beans: number
  daily_coupon: Coupon | null
  second_cup_eligible: boolean
  reward_catalogue: Array<{
    id: string
    type: 'bean_drink' | 'bean_addon'
    name: string
    beans: number
    free_eligible: boolean
    paid_eligible: boolean
    cash_price?: number
  }>
  settings: {
    scan_window_seconds: number
    checkin_beans: number
    free_bean_expiry_days: number
  }
  referral: {
    free: {
      activated_count: number
      threshold: number
      progress: number
      passes_earned: number
      passes_max: number
      pass_active_until: string | null
      pass_pending_until: string | null
    }
    paid: {
      activated_free_count: number
      activated_paid_count: number
      credit_threshold: number
      credit_progress: number
      beans_per_free: number
      beans_per_paid: number
      membership_credit_cents: number
    }
  }
}

export interface HouseAd {
  id: string
  title: string
  media_url: string
  media_type: 'image' | 'video'
  duration_seconds: number
  placement: 'checkin' | 'redemption' | 'both'
  is_active: boolean
  sort_order: number
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
  delivery_port?: number | null
  redemption_id?: string | null
  entitlement_type?: string | null
  scan_expires_at?: string | null
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





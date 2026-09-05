-- Referral reward coupons, welcome drink promo, deactivate global REF3FREE

UPDATE public.promo_codes
SET is_active = FALSE, updated_at = TIMEZONE('utc'::text, NOW())
WHERE code = 'REF3FREE';

INSERT INTO public.promo_codes (
  name,
  code,
  type,
  discount_value,
  is_system,
  is_active,
  applies_to_all_users,
  max_redemptions_per_user
) VALUES (
  'Welcome drink - Latte/Americano',
  'WELCOME1',
  'percent',
  100,
  TRUE,
  TRUE,
  FALSE,
  1
)
ON CONFLICT (code) DO UPDATE SET
  is_active = TRUE,
  applies_to_all_users = FALSE,
  max_redemptions_per_user = 1,
  discount_value = 100,
  type = 'percent',
  name = EXCLUDED.name,
  updated_at = TIMEZONE('utc'::text, NOW());

ALTER TABLE public.coupons DROP CONSTRAINT IF EXISTS coupons_kind_check;
ALTER TABLE public.coupons
  ADD CONSTRAINT coupons_kind_check
  CHECK (kind IN (
    'daily_24h',
    'welcome',
    'pass',
    'other',
    'referral_drink',
    'referral_addon'
  ));

ALTER TABLE public.product_logic_settings
  ADD COLUMN IF NOT EXISTS paid_referral_drink_coupons INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS paid_referral_addon_coupons INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS paid_referral_coupon_expiry_days INTEGER NOT NULL DEFAULT 90;

UPDATE public.product_logic_settings
SET
  paid_referral_drink_coupons = 10,
  paid_referral_addon_coupons = 10,
  paid_referral_coupon_expiry_days = 90,
  updated_at = TIMEZONE('utc'::text, NOW())
WHERE id = 1;

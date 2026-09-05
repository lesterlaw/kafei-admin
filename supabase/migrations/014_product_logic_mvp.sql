-- KAFEI Final MVP Product Logic (25 Aug 2026)
-- Wallets, beans, redemptions, house ads, referrals, coupons, add-on CofePlus mapping

-- ---------------------------------------------------------------------------
-- Product logic settings (campaign caps editable without app rebuild)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_logic_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  stamp_cost INTEGER NOT NULL DEFAULT 7,
  stamp_max INTEGER NOT NULL DEFAULT 13,
  checkin_beans INTEGER NOT NULL DEFAULT 5,
  welcome_beans INTEGER NOT NULL DEFAULT 5,
  free_bean_expiry_days INTEGER NOT NULL DEFAULT 60,
  scan_window_seconds INTEGER NOT NULL DEFAULT 80,
  robot_max_orders INTEGER NOT NULL DEFAULT 2,
  bean_americano INTEGER NOT NULL DEFAULT 250,
  bean_latte INTEGER NOT NULL DEFAULT 300,
  bean_addon INTEGER NOT NULL DEFAULT 75,
  addon_cash_price NUMERIC(10, 2) NOT NULL DEFAULT 1.00,
  free_referral_threshold INTEGER NOT NULL DEFAULT 3,
  free_pass_max INTEGER NOT NULL DEFAULT 2,
  pass_duration_days INTEGER NOT NULL DEFAULT 7,
  paid_free_referral_beans INTEGER NOT NULL DEFAULT 50,
  paid_paid_referral_beans INTEGER NOT NULL DEFAULT 150,
  paid_referral_credit_threshold INTEGER NOT NULL DEFAULT 3,
  membership_credit_cents INTEGER NOT NULL DEFAULT 2900,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())
);

INSERT INTO public.product_logic_settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.product_logic_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage product_logic_settings"
  ON public.product_logic_settings FOR ALL
  USING (EXISTS (SELECT 1 FROM public.admins WHERE admins.id = auth.uid()));

CREATE POLICY "Authenticated read product_logic_settings"
  ON public.product_logic_settings FOR SELECT
  USING (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- User wallets
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_wallets (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  stamp_count INTEGER NOT NULL DEFAULT 0 CHECK (stamp_count >= 0),
  welcome_drink_available BOOLEAN NOT NULL DEFAULT TRUE,
  welcome_beans_granted BOOLEAN NOT NULL DEFAULT FALSE,
  last_checkin_on DATE,
  membership_credit_cents INTEGER NOT NULL DEFAULT 0 CHECK (membership_credit_cents >= 0),
  pass_active_until TIMESTAMPTZ,
  pass_pending_until TIMESTAMPTZ,
  passes_earned_count INTEGER NOT NULL DEFAULT 0 CHECK (passes_earned_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE INDEX IF NOT EXISTS idx_user_wallets_last_checkin ON public.user_wallets(last_checkin_on);
CREATE INDEX IF NOT EXISTS idx_user_wallets_pass_active ON public.user_wallets(pass_active_until);

ALTER TABLE public.user_wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own wallet"
  ON public.user_wallets FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins manage wallets"
  ON public.user_wallets FOR ALL
  USING (EXISTS (SELECT 1 FROM public.admins WHERE admins.id = auth.uid()));

-- ---------------------------------------------------------------------------
-- Bean lots (FIFO expiry for Free-plan beans)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bean_lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount > 0),
  remaining INTEGER NOT NULL CHECK (remaining >= 0),
  earned_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
  expires_at TIMESTAMPTZ,
  source TEXT NOT NULL CHECK (source IN (
    'welcome', 'checkin', 'referral_free', 'referral_paid', 'admin', 'other'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE INDEX IF NOT EXISTS idx_bean_lots_user ON public.bean_lots(user_id);
CREATE INDEX IF NOT EXISTS idx_bean_lots_expiry ON public.bean_lots(user_id, expires_at)
  WHERE remaining > 0;

ALTER TABLE public.bean_lots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own bean lots"
  ON public.bean_lots FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins manage bean lots"
  ON public.bean_lots FOR ALL
  USING (EXISTS (SELECT 1 FROM public.admins WHERE admins.id = auth.uid()));

-- ---------------------------------------------------------------------------
-- Redemptions (hold until machine success)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN (
    'welcome', 'stamp', 'bean_drink', 'bean_addon',
    'daily_coupon', 'second_cup', 'pass_coupon', 'cash'
  )),
  status TEXT NOT NULL DEFAULT 'held' CHECK (status IN (
    'held', 'queued', 'completed', 'released'
  )),
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  addon_id UUID REFERENCES public.add_ons(id) ON DELETE SET NULL,
  stamps_reserved INTEGER NOT NULL DEFAULT 0,
  beans_reserved INTEGER NOT NULL DEFAULT 0,
  coupon_id UUID REFERENCES public.coupons(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
  completed_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_redemptions_user ON public.redemptions(user_id);
CREATE INDEX IF NOT EXISTS idx_redemptions_order ON public.redemptions(order_id);
CREATE INDEX IF NOT EXISTS idx_redemptions_status ON public.redemptions(status);

ALTER TABLE public.redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own redemptions"
  ON public.redemptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins manage redemptions"
  ON public.redemptions FOR ALL
  USING (EXISTS (SELECT 1 FROM public.admins WHERE admins.id = auth.uid()));

-- ---------------------------------------------------------------------------
-- House ads (Free plan only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.house_ads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  media_url TEXT NOT NULL,
  media_type TEXT NOT NULL DEFAULT 'image' CHECK (media_type IN ('image', 'video')),
  duration_seconds INTEGER NOT NULL DEFAULT 5,
  placement TEXT NOT NULL DEFAULT 'both' CHECK (placement IN (
    'checkin', 'redemption', 'both'
  )),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE INDEX IF NOT EXISTS idx_house_ads_active ON public.house_ads(is_active, sort_order);

ALTER TABLE public.house_ads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active house ads"
  ON public.house_ads FOR SELECT
  USING (is_active = TRUE);

CREATE POLICY "Admins manage house ads"
  ON public.house_ads FOR ALL
  USING (EXISTS (SELECT 1 FROM public.admins WHERE admins.id = auth.uid()));

-- Ad view tokens (prove Free user watched an ad before check-in / redemption)
CREATE TABLE IF NOT EXISTS public.ad_view_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  house_ad_id UUID REFERENCES public.house_ads(id) ON DELETE SET NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('checkin', 'redemption')),
  token TEXT NOT NULL UNIQUE,
  consumed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE INDEX IF NOT EXISTS idx_ad_view_tokens_user ON public.ad_view_tokens(user_id, purpose);

ALTER TABLE public.ad_view_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own ad tokens"
  ON public.ad_view_tokens FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins manage ad tokens"
  ON public.ad_view_tokens FOR ALL
  USING (EXISTS (SELECT 1 FROM public.admins WHERE admins.id = auth.uid()));

-- ---------------------------------------------------------------------------
-- Referrals: activation status
-- ---------------------------------------------------------------------------
ALTER TABLE public.referrals
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'activated_free', 'activated_paid')),
  ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reward_issued BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS credit_issued BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_referrals_status ON public.referrals(referrer_id, status);

-- ---------------------------------------------------------------------------
-- Coupons: kind + granted_at for rolling 24h
-- ---------------------------------------------------------------------------
ALTER TABLE public.coupons
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'daily_24h'
    CHECK (kind IN ('daily_24h', 'welcome', 'pass', 'other')),
  ADD COLUMN IF NOT EXISTS granted_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW());

CREATE INDEX IF NOT EXISTS idx_coupons_kind_granted
  ON public.coupons(user_id, kind, granted_at DESC);

-- ---------------------------------------------------------------------------
-- Add-ons: CofePlus modifier mapping
-- ---------------------------------------------------------------------------
ALTER TABLE public.add_ons
  ADD COLUMN IF NOT EXISTS cofeplus_group TEXT,
  ADD COLUMN IF NOT EXISTS cofeplus_flag TEXT,
  ADD COLUMN IF NOT EXISTS cofeplus_locator TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'cofeplus'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_add_ons_cofeplus_group_flag
  ON public.add_ons(cofeplus_group, cofeplus_flag)
  WHERE cofeplus_group IS NOT NULL AND cofeplus_flag IS NOT NULL;

-- Hide legacy seeded add-ons (replaced by CofePlus sync)
UPDATE public.add_ons
SET is_hidden = TRUE, updated_at = TIMEZONE('utc'::text, NOW())
WHERE name IN ('Oat Milk', 'Espresso', 'Flavors')
  AND (cofeplus_group IS NULL);

-- ---------------------------------------------------------------------------
-- Subscription tiers: Free period + retire 3year / fix Annual price
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'subscription_tiers'
      AND column_name = 'is_hidden'
  ) THEN
    ALTER TABLE public.subscription_tiers
      ADD COLUMN is_hidden BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;

-- Drop period check so we can migrate 3year → annual, then re-add
ALTER TABLE public.subscription_tiers
  DROP CONSTRAINT IF EXISTS subscription_tiers_period_check;

UPDATE public.subscription_tiers
SET
  name = 'Annual Plan (legacy 3-year retired)',
  period = 'annual',
  price = 249.00,
  is_hidden = TRUE,
  updated_at = TIMEZONE('utc'::text, NOW())
WHERE period = '3year' OR name ILIKE '%3-year%' OR name ILIKE '%3 year%';

ALTER TABLE public.subscription_tiers
  ADD CONSTRAINT subscription_tiers_period_check
  CHECK (period IN ('free', 'monthly', 'annual'));

UPDATE public.subscription_tiers
SET
  price = 249.00,
  description = 'Same membership, best value — All Drinks, 5 Beans/day, full Bean rewards',
  features = '["1 All-Drinks coupon every 24h","+5 Beans daily check-in","No house ads","Full Bean rewards","Second cup 50% off"]'::jsonb,
  coupon_per_day = 1,
  is_hidden = FALSE,
  updated_at = TIMEZONE('utc'::text, NOW())
WHERE period = 'annual' AND name NOT ILIKE '%legacy%';

UPDATE public.subscription_tiers
SET
  description = 'Daily All-Drinks membership — 1 coupon / 24h, Beans, no ads',
  features = '["1 All-Drinks coupon every 24h","+5 Beans daily check-in","No house ads","Full Bean rewards","Second cup 50% off"]'::jsonb,
  coupon_per_day = 1,
  is_hidden = FALSE,
  updated_at = TIMEZONE('utc'::text, NOW())
WHERE period = 'monthly';

INSERT INTO public.subscription_tiers (
  name, description, price, period, features, coupon_per_day, is_hidden
)
SELECT
  'Free Plan',
  'First drink + Stamps + Beans + Ads',
  0,
  'free',
  '["Welcome Latte or Americano","7 Stamps = 1 drink","Daily check-in +1 Stamp +5 Beans","House ads","Basic Bean rewards","60-day Bean expiry"]'::jsonb,
  0,
  FALSE
WHERE NOT EXISTS (
  SELECT 1 FROM public.subscription_tiers WHERE period = 'free'
);

-- ---------------------------------------------------------------------------
-- Orders: link to redemption + scan window tracking
-- ---------------------------------------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS redemption_id UUID REFERENCES public.redemptions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS scan_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS entitlement_type TEXT;

-- Backfill wallets for existing users
INSERT INTO public.user_wallets (user_id, welcome_drink_available, welcome_beans_granted)
SELECT id, FALSE, TRUE
FROM public.users
ON CONFLICT (user_id) DO NOTHING;

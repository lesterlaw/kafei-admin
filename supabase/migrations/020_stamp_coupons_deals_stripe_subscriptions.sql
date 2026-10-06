-- Stamp reward coupons, admin-managed deals, and Stripe subscription links

-- Stamp rewards become a coupon the customer picks at checkout
ALTER TABLE public.coupons DROP CONSTRAINT IF EXISTS coupons_kind_check;
ALTER TABLE public.coupons
  ADD CONSTRAINT coupons_kind_check
  CHECK (kind IN (
    'daily_24h',
    'welcome',
    'pass',
    'other',
    'referral_drink',
    'referral_addon',
    'stamp'
  ));

-- Deals and promotions shown on the app Deals tab
CREATE TABLE IF NOT EXISTS public.deals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    -- Limited HTML: p, br, strong, ul, li
    description TEXT NOT NULL DEFAULT '',
    -- Up to 3 public image URLs
    image_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
    link_url TEXT,
    sort_order INTEGER DEFAULT 0 NOT NULL,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_deals_sort_order ON public.deals(sort_order);
CREATE INDEX IF NOT EXISTS idx_deals_is_active ON public.deals(is_active);

ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view deals" ON public.deals;
CREATE POLICY "Anyone can view deals" ON public.deals
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can manage deals" ON public.deals;
CREATE POLICY "Admins can manage deals" ON public.deals
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.admins
            WHERE id = auth.uid()
        )
    );

-- Carry over the deals that were hardcoded in the app
INSERT INTO public.deals (title, description, sort_order)
SELECT seed.title, seed.description, seed.sort_order
FROM (
    VALUES
        (
            '50% off second drink',
            '<p>After you use your daily drink coupon, your next cup is 50% off KAFEI retail.</p>',
            0
        ),
        (
            '7-Day KAFEI Pass',
            '<p>Refer 3 activated friends to earn a 7-Day Pass:</p><ul><li>1 Latte or Americano daily</li><li>50% off your next drink</li><li>Max 2 Passes</li></ul>',
            1
        ),
        (
            'Referral drink & add-on coupons',
            '<p>Refer 3 new Paid subscribers to receive:</p><ul><li>10 Latte/Americano drink coupons</li><li>10 add-on coupons</li></ul><p>Coupons expire after 90 days. Repeatable for every 3 Paid referrals.</p>',
            2
        )
) AS seed(title, description, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.deals);

-- Stripe Billing links for recurring Monthly / Annual plans
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

ALTER TABLE public.user_subscriptions
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_stripe_subscription
  ON public.user_subscriptions(stripe_subscription_id);

-- Banners (home carousel / marketing images)
CREATE TABLE IF NOT EXISTS public.banners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    image_url TEXT NOT NULL,
    title TEXT,
    link_url TEXT,
    sort_order INTEGER DEFAULT 0 NOT NULL,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Marketing / admin-created promo codes (separate from daily coupons)
CREATE TABLE IF NOT EXISTS public.promo_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    code TEXT UNIQUE,
    type TEXT NOT NULL CHECK (type IN ('percent', 'fixed', 'nth_cup', 'referral')),
    discount_value NUMERIC NOT NULL,
    nth_cup INTEGER,
    referral_threshold INTEGER,
    validity_days INTEGER,
    min_amount NUMERIC DEFAULT 0 NOT NULL,
    max_discount_amount NUMERIC,
    max_redemptions_total INTEGER,
    max_redemptions_per_user INTEGER,
    starts_at TIMESTAMP WITH TIME ZONE,
    ends_at TIMESTAMP WITH TIME ZONE,
    applies_to_all_users BOOLEAN DEFAULT TRUE NOT NULL,
    is_system BOOLEAN DEFAULT FALSE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Specific-user targeting for promo codes
CREATE TABLE IF NOT EXISTS public.promo_code_users (
    promo_code_id UUID NOT NULL REFERENCES public.promo_codes(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    PRIMARY KEY (promo_code_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_banners_sort_order ON public.banners(sort_order);
CREATE INDEX IF NOT EXISTS idx_banners_is_active ON public.banners(is_active);
CREATE INDEX IF NOT EXISTS idx_promo_codes_code ON public.promo_codes(code);
CREATE INDEX IF NOT EXISTS idx_promo_codes_is_active ON public.promo_codes(is_active);
CREATE INDEX IF NOT EXISTS idx_promo_code_users_user_id ON public.promo_code_users(user_id);

-- Seed system promo codes
INSERT INTO public.promo_codes (
    name,
    code,
    type,
    discount_value,
    nth_cup,
    referral_threshold,
    validity_days,
    is_system,
    is_active,
    applies_to_all_users
)
VALUES
    (
        '50% off your 2nd cup',
        'SECOND50',
        'nth_cup',
        50,
        2,
        NULL,
        30,
        TRUE,
        TRUE,
        TRUE
    ),
    (
        '1 free cup for every 3 referrals',
        'REF3FREE',
        'referral',
        1,
        NULL,
        3,
        30,
        TRUE,
        TRUE,
        TRUE
    )
ON CONFLICT (code) DO NOTHING;

-- RLS
ALTER TABLE public.banners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_code_users ENABLE ROW LEVEL SECURITY;

-- Banners: public read (active via app filter), admin manage
CREATE POLICY "Anyone can view banners" ON public.banners
    FOR SELECT USING (true);

CREATE POLICY "Admins can manage banners" ON public.banners
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.admins
            WHERE id = auth.uid()
        )
    );

-- Promo codes: authenticated users can view active applicable codes; admins manage
CREATE POLICY "Users can view applicable promo codes" ON public.promo_codes
    FOR SELECT USING (
        is_active = TRUE
        AND (
            applies_to_all_users = TRUE
            OR is_system = TRUE
            OR EXISTS (
                SELECT 1 FROM public.promo_code_users
                WHERE promo_code_id = promo_codes.id
                AND user_id = auth.uid()
            )
        )
        AND (
            starts_at IS NULL OR starts_at <= TIMEZONE('utc'::text, NOW())
        )
        AND (
            ends_at IS NULL OR ends_at >= TIMEZONE('utc'::text, NOW())
        )
    );

CREATE POLICY "Admins can manage promo codes" ON public.promo_codes
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.admins
            WHERE id = auth.uid()
        )
    );

-- Promo code users: users see own assignments; admins manage
CREATE POLICY "Users can view own promo code assignments" ON public.promo_code_users
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Admins can manage promo code users" ON public.promo_code_users
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.admins
            WHERE id = auth.uid()
        )
    );

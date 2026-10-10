-- Fixes from the QA data review (2026-10-10). Safe to run more than once.
-- NOT yet applied to production: review, then run in the Supabase SQL editor.

-- 1. Migration 017 was never applied in production: re-create the guard that stops two
--    active orders sharing a dispense hole. Fails if two active orders already share one;
--    if so, resolve those orders first.
CREATE UNIQUE INDEX IF NOT EXISTS orders_active_delivery_port_uidx
ON public.orders (cofeplus_pod_id, cofeplus_environment, delivery_port)
WHERE status IN ('pending', 'brewing', 'ready')
  AND delivery_port IN (1, 2);

-- 2. orders.updated_at never changed after insert, so nobody could tell when an order
--    completed or was cancelled. Keep it current on every update.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = TIMEZONE('utc'::text, NOW());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_set_updated_at ON public.orders;
CREATE TRIGGER orders_set_updated_at
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS support_tickets_set_updated_at ON public.support_tickets;
CREATE TRIGGER support_tickets_set_updated_at
BEFORE UPDATE ON public.support_tickets
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. order_items.addons was saved as a JSON string inside the jsonb column.
--    New orders now store a real array; convert the old rows.
UPDATE public.order_items
SET addons = (addons #>> '{}')::jsonb
WHERE jsonb_typeof(addons) = 'string'
  AND (addons #>> '{}') LIKE '[%';

-- 4. app_settings was the only public table with row level security off.
--    All reads and writes go through the service role (lib/cofeplus/settings.ts,
--    lib/stripe/mode.ts), which bypasses RLS, so no policy is needed.
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- 5. Speed up order item lookups (335k sequential scans, no index on order_id).
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items (order_id);

-- 6. Welcome-drink orders placed with the WELCOME1 promo on 2026-09-07 were labelled
--    'daily_coupon', so their wallets still offer a welcome drink. The order route now
--    always labels them 'welcome'; correct the old rows and wallets.
UPDATE public.orders o
SET entitlement_type = 'welcome'
FROM public.promo_codes p
WHERE p.code = 'WELCOME1'
  AND o.coupon_id = p.id
  AND o.entitlement_type IS DISTINCT FROM 'welcome';

UPDATE public.user_wallets w
SET welcome_drink_available = false
WHERE w.welcome_drink_available
  AND EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.user_id = w.user_id
      AND o.status <> 'cancelled'
      AND o.entitlement_type = 'welcome'
  );

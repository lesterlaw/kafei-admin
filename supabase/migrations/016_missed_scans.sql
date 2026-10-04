-- Count missed QR scans so the 3rd miss can cancel the order.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS missed_scans INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.orders.missed_scans IS
  'How many times this order missed its 80s QR scan window. Cancelled at 3.';

DROP POLICY IF EXISTS "Anyone can view product addons" ON public.product_addons;
CREATE POLICY "Anyone can view product addons"
  ON public.product_addons FOR SELECT
  USING (true);

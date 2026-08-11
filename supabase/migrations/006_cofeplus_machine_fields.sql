-- Link Kafei kiosks/products/orders to CofePlus machine QR (pickupCode) flow

ALTER TABLE public.kiosks
  ADD COLUMN IF NOT EXISTS pod_id TEXT;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS cofeplus_item_code TEXT;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS pickup_code TEXT,
  ADD COLUMN IF NOT EXISTS cofeplus_dispatch_id TEXT,
  ADD COLUMN IF NOT EXISTS cofeplus_pod_id TEXT,
  ADD COLUMN IF NOT EXISTS cofeplus_environment TEXT
    CHECK (cofeplus_environment IS NULL OR cofeplus_environment IN ('test', 'live'));

CREATE INDEX IF NOT EXISTS idx_kiosks_pod_id ON public.kiosks(pod_id);
CREATE INDEX IF NOT EXISTS idx_orders_pickup_code ON public.orders(pickup_code);
CREATE INDEX IF NOT EXISTS idx_orders_cofeplus_dispatch_id ON public.orders(cofeplus_dispatch_id);

COMMENT ON COLUMN public.kiosks.pod_id IS 'CofePlus machine serial / pod ID (e.g. RCK111)';
COMMENT ON COLUMN public.products.cofeplus_item_code IS 'CofePlus menu itemCode used when creating machine dispatches';
COMMENT ON COLUMN public.orders.pickup_code IS 'CofePlus pickupCode encoded as the machine QR payload';

-- Dedicated pairing secrets for the Kafei kiosk APK.
-- Kept off public.kiosks so the public "anyone can view kiosks" RLS cannot leak them.

CREATE TABLE IF NOT EXISTS public.kiosk_devices (
  kiosk_id UUID PRIMARY KEY REFERENCES public.kiosks(id) ON DELETE CASCADE,
  device_token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  last_seen_at TIMESTAMP WITH TIME ZONE
);

COMMENT ON TABLE public.kiosk_devices IS 'Kafei kiosk APK pairing tokens. Service-role only.';
COMMENT ON COLUMN public.kiosk_devices.device_token IS 'Secret the APK sends as X-Kiosk-Token. Regenerate to revoke.';

ALTER TABLE public.kiosk_devices ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_orders_active_pickup_code
ON public.orders (pickup_code)
WHERE pickup_code IS NOT NULL;

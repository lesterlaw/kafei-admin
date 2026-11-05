-- SMS sign-in codes sent through OneWaySMS (lib/auth/sms-otp.ts).
-- Only a keyed hash of each code is stored. A code works once, for a few
-- minutes, and is locked after too many wrong tries.

CREATE TABLE IF NOT EXISTS public.phone_otps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  consumed_at TIMESTAMP WITH TIME ZONE,
  provider_ref TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

COMMENT ON TABLE public.phone_otps IS 'SMS sign-in codes for the mobile app. Service-role only.';
COMMENT ON COLUMN public.phone_otps.phone IS 'Digits only, with country code, e.g. 6591234567.';
COMMENT ON COLUMN public.phone_otps.code_hash IS 'HMAC-SHA256 of phone and code. The code itself is never stored.';
COMMENT ON COLUMN public.phone_otps.provider_ref IS 'OneWaySMS mtid of the send.';

CREATE INDEX IF NOT EXISTS idx_phone_otps_phone_created
ON public.phone_otps (phone, created_at DESC);

ALTER TABLE public.phone_otps ENABLE ROW LEVEL SECURITY;

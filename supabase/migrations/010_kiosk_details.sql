-- Free-text location details shown in the mobile app (e.g. "Beside counter 4")
ALTER TABLE public.kiosks
ADD COLUMN IF NOT EXISTS details TEXT;

COMMENT ON COLUMN public.kiosks.details IS 'Free-text location details shown in the app (e.g. Beside counter 4)';

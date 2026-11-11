-- App sign-in passwords (SLP-1723). The phone is verified by SMS code once, at sign-up
-- or when resetting; after that customers sign in with phone and password.
-- Only a scrypt hash is stored (lib/auth/password.ts). Service-role only: no RLS policies,
-- and kept out of public.users so admin pages that select * never see it.

CREATE TABLE IF NOT EXISTS public.user_passwords (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

COMMENT ON TABLE public.user_passwords IS 'App sign-in password hashes. Service-role only.';
COMMENT ON COLUMN public.user_passwords.password_hash IS 'scrypt$<salt>$<hash>, never the password itself.';
COMMENT ON COLUMN public.user_passwords.locked_until IS 'Set after too many wrong passwords in a row.';

ALTER TABLE public.user_passwords ENABLE ROW LEVEL SECURITY;

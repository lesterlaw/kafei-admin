-- Staff accounts order every drink free (lib/product-logic/staff.ts).
-- Set from the admin Users page. Orders they place get entitlement_type 'staff'.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_staff BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.users.is_staff IS 'Staff account: every drink and add-on is free.';

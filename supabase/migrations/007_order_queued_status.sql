-- Virtual queue: orders wait with status=queued until the machine/dispenser is free.
-- QR (pickup_code) is only created when the order is activated (status → pending).

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN ('queued', 'pending', 'brewing', 'ready', 'completed', 'cancelled'));

COMMENT ON COLUMN public.orders.status IS
  'queued = waiting for machine turn (no QR yet); pending = your turn, show pickup QR; brewing/ready/completed/cancelled as usual';

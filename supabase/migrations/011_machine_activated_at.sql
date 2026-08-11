-- Timestamp when a machine order receives its pickup QR (your turn starts)
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS machine_activated_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN public.orders.machine_activated_at IS
  'When the order was activated for the machine (pickup QR unlocked). Used for test-mode dispense simulation and wait estimates.';

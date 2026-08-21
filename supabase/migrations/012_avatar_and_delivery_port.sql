-- Profile photo on app users
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

COMMENT ON COLUMN public.users.avatar_url IS 'Public URL of the customer profile photo';

-- Which machine outlet (1 or 2) this order was dispatched to
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_port INTEGER;

COMMENT ON COLUMN public.orders.delivery_port IS 'CofePlus deliveryPort / dispense hole (1 or 2)';

-- SLP-1382: one 2 min 30 sec QR scan window per order. A missed window now
-- cancels the order and grants a free drink coupon (code MP-<order number>)
-- instead of moving the customer back in the queue up to 3 times.
UPDATE public.product_logic_settings
SET scan_window_seconds = 150,
    updated_at = timezone('utc'::text, now())
WHERE id = 1
  AND scan_window_seconds = 80;

COMMENT ON COLUMN public.orders.missed_scans IS
  'How many times this order missed its QR scan window. Cancelled on the first miss.';

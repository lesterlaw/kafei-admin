-- Per-order latte art sent to CofePlus as a latte-art modifier locator.
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS latte_art_flag TEXT,
  ADD COLUMN IF NOT EXISTS latte_art_locator TEXT;

ALTER TABLE public.order_items
  DROP CONSTRAINT IF EXISTS order_items_latte_art_flag_check;

ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_latte_art_flag_check
  CHECK (
    latte_art_flag IS NULL
    OR latte_art_flag IN ('none', 'catalog', 'upload')
  );

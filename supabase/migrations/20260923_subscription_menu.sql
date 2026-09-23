-- Flexible menu categories + subscription extension months on payment proofs

ALTER TABLE public.menu_items ALTER COLUMN category DROP DEFAULT;
ALTER TABLE public.menu_items
  ALTER COLUMN category TYPE text USING category::text;
ALTER TABLE public.menu_items ALTER COLUMN category SET DEFAULT 'other';

ALTER TABLE public.payment_proofs
  ADD COLUMN IF NOT EXISTS months_requested integer NOT NULL DEFAULT 1;

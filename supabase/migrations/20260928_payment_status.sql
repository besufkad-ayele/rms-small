-- Payment status + optional proof image for non-cash tenders.
DO $$ BEGIN
  CREATE TYPE public.sale_payment_status AS ENUM ('unpaid', 'paid');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.sale_orders
  ADD COLUMN IF NOT EXISTS payment_status public.sale_payment_status,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paid_by TEXT,
  ADD COLUMN IF NOT EXISTS payment_proof_url TEXT;

-- Existing tickets were already counted as sales — keep them paid.
UPDATE public.sale_orders
SET
  payment_status = 'paid',
  paid_at = COALESCE(paid_at, created_at)
WHERE payment_status IS NULL
  AND (status IS NULL OR status::text <> 'canceled');

UPDATE public.sale_orders
SET payment_status = 'unpaid'
WHERE payment_status IS NULL;

-- Place = unpaid ticket; Mark as paid is a separate step.
ALTER TABLE public.sale_orders
  ALTER COLUMN payment_status SET DEFAULT 'unpaid',
  ALTER COLUMN payment_status SET NOT NULL;

CREATE INDEX IF NOT EXISTS sale_orders_org_payment_idx
  ON public.sale_orders (organization_id, payment_status, created_at DESC);

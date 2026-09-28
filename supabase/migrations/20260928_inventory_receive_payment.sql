-- Credit vs fully paid on stock receives (inventory purchases).
DO $$ BEGIN
  CREATE TYPE public.inventory_receive_payment_status AS ENUM ('paid', 'credit');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS payment_status public.inventory_receive_payment_status;

-- Existing receipts were treated as settled purchases.
UPDATE public.inventory_movements
SET payment_status = 'paid'
WHERE kind = 'in'
  AND payment_status IS NULL;

ALTER TABLE public.inventory_movements
  ALTER COLUMN payment_status SET DEFAULT 'paid';

CREATE INDEX IF NOT EXISTS inventory_movements_org_payment_idx
  ON public.inventory_movements (organization_id, payment_status, created_at DESC)
  WHERE kind = 'in';

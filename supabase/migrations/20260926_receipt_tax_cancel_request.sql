-- Receipt tax settings + cashier cancel request

ALTER TABLE public.org_meta
  ADD COLUMN IF NOT EXISTS vat_percent NUMERIC(5,2) NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS service_percent NUMERIC(5,2) NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS receipt_footer TEXT DEFAULT '';

ALTER TABLE public.sale_orders
  ADD COLUMN IF NOT EXISTS vat_percent NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS service_percent NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS cancel_requested BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancel_requested_by TEXT,
  ADD COLUMN IF NOT EXISTS cancel_requested_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS sale_orders_cancel_req_idx
  ON public.sale_orders (organization_id, cancel_requested)
  WHERE cancel_requested = true;

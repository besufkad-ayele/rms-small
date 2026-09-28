-- Track when finance receipt / tax settings last changed so clients
-- can skip re-downloading unchanged receipt details.

ALTER TABLE public.org_meta
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE public.org_meta
SET updated_at = now()
WHERE updated_at IS NULL;

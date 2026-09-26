-- Expand receipt designer fields on org_meta

ALTER TABLE public.org_meta
  ADD COLUMN IF NOT EXISTS receipt_profile JSONB NOT NULL DEFAULT '{}'::jsonb;

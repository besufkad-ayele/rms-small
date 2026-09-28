-- Enabled tender types for Mark as paid / finance (owner toggles in Settings).
ALTER TABLE public.org_meta
  ADD COLUMN IF NOT EXISTS payment_methods JSONB NOT NULL DEFAULT '{"enabled":["cash","cbe","telebirr","other"]}'::jsonb;

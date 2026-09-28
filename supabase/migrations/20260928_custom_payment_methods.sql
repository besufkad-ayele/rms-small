-- Allow any tender label on sale orders (custom bank / wallet names).
ALTER TABLE public.sale_orders
  ALTER COLUMN payment_method DROP DEFAULT;

ALTER TABLE public.sale_orders
  ALTER COLUMN payment_method TYPE TEXT USING payment_method::text;

ALTER TABLE public.sale_orders
  ALTER COLUMN payment_method SET DEFAULT 'cash',
  ALTER COLUMN payment_method SET NOT NULL;

-- Custom + built-in methods for Mark as paid / finance filters.
ALTER TABLE public.org_meta
  ADD COLUMN IF NOT EXISTS payment_methods JSONB NOT NULL DEFAULT '{
    "methods": [
      {"id":"cash","label":"Cash","kind":"cash","enabled":true},
      {"id":"cbe","label":"CBE","kind":"bank","enabled":true},
      {"id":"telebirr","label":"Telebirr","kind":"telebirr","enabled":true},
      {"id":"other","label":"Other","kind":"other","enabled":true}
    ]
  }'::jsonb;

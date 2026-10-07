-- Pricing v2: online module, 2500/3500/5500 packages, one-time add-ons,
-- 1 included staff seat per module, guest/public orders, public menu slug.

-- ═══════════════════════════════════════
-- 1) Module catalog: allow `online`
-- ═══════════════════════════════════════
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.subscription_module_prices'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%module_code%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.subscription_module_prices DROP CONSTRAINT %I',
      r.conname
    );
  END LOOP;
END $$;

ALTER TABLE public.subscription_module_prices
  ADD CONSTRAINT subscription_module_prices_module_code_check
  CHECK (module_code IN (
    'menu', 'ordering', 'kitchen', 'inventory', 'finance', 'hr', 'online'
  ));

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS online_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS extra_staff_seats INT NOT NULL DEFAULT 0
    CHECK (extra_staff_seats >= 0);

ALTER TABLE public.subscription_packages
  ADD COLUMN IF NOT EXISTS online_enabled BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.payment_proofs
  ADD COLUMN IF NOT EXISTS online_enabled BOOLEAN,
  ADD COLUMN IF NOT EXISTS extra_staff_seats INT,
  ADD COLUMN IF NOT EXISTS addon_codes TEXT[];

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS public_slug TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS organizations_public_slug_uidx
  ON public.organizations (public_slug)
  WHERE public_slug IS NOT NULL;

-- ═══════════════════════════════════════
-- 2) Guest / public order fields
-- ═══════════════════════════════════════
ALTER TABLE public.sale_orders
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'pos',
  ADD COLUMN IF NOT EXISTS guest_name TEXT,
  ADD COLUMN IF NOT EXISTS guest_phone TEXT,
  ADD COLUMN IF NOT EXISTS guest_note TEXT;

-- ═══════════════════════════════════════
-- 3) One-time add-ons (data insertion, training, extra seats)
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.subscription_addons (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  price_etb NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (price_etb >= 0),
  kind TEXT NOT NULL DEFAULT 'one_time'
    CHECK (kind IN ('one_time')),
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.subscription_addons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS addons_select_active ON public.subscription_addons;
CREATE POLICY addons_select_active ON public.subscription_addons
  FOR SELECT TO authenticated
  USING (active = true OR public.is_platform_admin());

DROP POLICY IF EXISTS addons_platform_all ON public.subscription_addons;
CREATE POLICY addons_platform_all ON public.subscription_addons
  FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

INSERT INTO public.subscription_addons
  (code, name, description, price_etb, kind, active, sort_order)
VALUES
  (
    'data_insertion',
    'Data insertion',
    'We enter the restaurant menu, stock and opening data for you. One-time.',
    1000, 'one_time', true, 10
  ),
  (
    'extra_training',
    'One-day extra training',
    'An extra training day on top of onboarding. One-time.',
    1000, 'one_time', true, 20
  ),
  (
    'extra_seat',
    'Extra staff seat',
    'Each selected module includes 1 staff seat. Extra seats are a one-time fee.',
    500, 'one_time', true, 30
  )
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price_etb = EXCLUDED.price_etb,
  active = EXCLUDED.active,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

-- ═══════════════════════════════════════
-- 4) Six in-house modules = 4,500. Adding Website & public ordering = 5,500.
-- ═══════════════════════════════════════
INSERT INTO public.subscription_module_prices
  (module_code, label, description, monthly_price_etb, active, sort_order)
VALUES
  ('menu',      'Menu',      'Recipes, categories, availability, photos', 750, true, 10),
  ('ordering',  'Ordering',  'Tables, POS, placed-order queue',           850, true, 20),
  ('kitchen',   'Kitchen',   'Kitchen display and prep status',           650, true, 30),
  ('inventory', 'Inventory', 'Stock, suppliers, movements',               800, true, 40),
  ('finance',   'Finance',   'Reports, bills and day close',              800, true, 50),
  ('hr',        'HR / Staff','Staff permissions (1 seat included / module)', 650, true, 60),
  ('online',    'Website & public ordering',
    'Public menu page and guest orders with name and phone',             1000, true, 70)
ON CONFLICT (module_code) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  monthly_price_etb = EXCLUDED.monthly_price_etb,
  active = EXCLUDED.active,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

-- ═══════════════════════════════════════
-- 5) Replace named packages
-- ═══════════════════════════════════════
UPDATE public.subscription_packages
SET active = false, updated_at = now()
WHERE code NOT IN ('starter', 'intermediate', 'full', 'website');

INSERT INTO public.subscription_packages
  (code, name, description, monthly_price_etb,
   menu_enabled, ordering_enabled, kitchen_enabled, inventory_enabled,
   finance_enabled, hr_enabled, online_enabled,
   max_staff_seats, active, sort_order)
VALUES
  (
    'starter',
    'Starter',
    'Menu + Ordering + Kitchen. 3 staff seats included (1 per module).',
    2500,
    true, true, true, false, false, false, false,
    3, true, 10
  ),
  (
    'intermediate',
    'Intermediate',
    'Menu, Ordering, Inventory and Finance. No kitchen. 4 staff seats included.',
    3500,
    true, true, false, true, true, false, false,
    4, true, 20
  ),
  (
    'full',
    'Full',
    'All in-house modules including kitchen. No website. 6 staff seats included. Custom of these six is also 4,500; add Website & public ordering separately for 5,500.',
    4500,
    true, true, true, true, true, true, false,
    6, true, 30
  ),
  (
    'website',
    'Website + public ordering',
    'We link a public menu page to this restaurant. Guests order with their name and phone. Includes Menu, Ordering, Kitchen and Online. 4 seats included.',
    3000,
    true, true, true, false, false, false, true,
    4, true, 40
  )
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  monthly_price_etb = EXCLUDED.monthly_price_etb,
  menu_enabled = EXCLUDED.menu_enabled,
  ordering_enabled = EXCLUDED.ordering_enabled,
  kitchen_enabled = EXCLUDED.kitchen_enabled,
  inventory_enabled = EXCLUDED.inventory_enabled,
  finance_enabled = EXCLUDED.finance_enabled,
  hr_enabled = EXCLUDED.hr_enabled,
  online_enabled = EXCLUDED.online_enabled,
  max_staff_seats = EXCLUDED.max_staff_seats,
  active = EXCLUDED.active,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

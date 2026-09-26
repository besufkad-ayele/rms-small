-- Package catalog + à-la-carte module prices for Billing + Platform owner console

-- ═══════════════════════════════════════
-- 1) À-la-carte module prices
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.subscription_module_prices (
  module_code TEXT PRIMARY KEY
    CHECK (module_code IN ('menu', 'ordering', 'inventory', 'finance', 'hr')),
  label TEXT NOT NULL,
  description TEXT,
  monthly_price_etb NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (monthly_price_etb >= 0),
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════
-- 2) Named packages (bundles)
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.subscription_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  monthly_price_etb NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (monthly_price_etb >= 0),
  menu_enabled BOOLEAN NOT NULL DEFAULT false,
  ordering_enabled BOOLEAN NOT NULL DEFAULT false,
  inventory_enabled BOOLEAN NOT NULL DEFAULT false,
  finance_enabled BOOLEAN NOT NULL DEFAULT false,
  hr_enabled BOOLEAN NOT NULL DEFAULT false,
  max_staff_seats INT NOT NULL DEFAULT 2 CHECK (max_staff_seats >= 0),
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subscription_packages_active_idx
  ON public.subscription_packages (active, sort_order);

-- ═══════════════════════════════════════
-- 3) Payment proofs: expected amount + package + breakdown
-- ═══════════════════════════════════════
ALTER TABLE public.payment_proofs
  ADD COLUMN IF NOT EXISTS package_code TEXT,
  ADD COLUMN IF NOT EXISTS expected_amount_etb NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS amount_breakdown JSONB;

-- Optional explicit package on subscription (mirrors plan_code; plan_code remains source of truth)
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS package_code TEXT;

-- ═══════════════════════════════════════
-- 4) RLS
-- ═══════════════════════════════════════
ALTER TABLE public.subscription_module_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS module_prices_select_active ON public.subscription_module_prices;
CREATE POLICY module_prices_select_active ON public.subscription_module_prices
  FOR SELECT TO authenticated
  USING (active = true OR public.is_platform_admin());

DROP POLICY IF EXISTS module_prices_platform_all ON public.subscription_module_prices;
CREATE POLICY module_prices_platform_all ON public.subscription_module_prices
  FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS packages_select_active ON public.subscription_packages;
CREATE POLICY packages_select_active ON public.subscription_packages
  FOR SELECT TO authenticated
  USING (active = true OR public.is_platform_admin());

DROP POLICY IF EXISTS packages_platform_all ON public.subscription_packages;
CREATE POLICY packages_platform_all ON public.subscription_packages
  FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- ═══════════════════════════════════════
-- 5) Seed placeholder ETB prices (editable in Platform → Packages)
-- ═══════════════════════════════════════
INSERT INTO public.subscription_module_prices
  (module_code, label, description, monthly_price_etb, active, sort_order)
VALUES
  ('menu',      'Menu',      'Recipes, categories, availability', 300, true, 10),
  ('ordering',  'Ordering',  'Tables, POS, kitchen tickets',     400, true, 20),
  ('inventory', 'Inventory', 'Stock, purchases, units',          350, true, 30),
  ('finance',   'Finance',   'Reports & day close',              450, true, 40),
  ('hr',        'HR / Staff','Staff seats & permissions',        250, true, 50)
ON CONFLICT (module_code) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  monthly_price_etb = EXCLUDED.monthly_price_etb,
  active = EXCLUDED.active,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

INSERT INTO public.subscription_packages
  (code, name, description, monthly_price_etb,
   menu_enabled, ordering_enabled, inventory_enabled, finance_enabled, hr_enabled,
   max_staff_seats, active, sort_order)
VALUES
  (
    'starter',
    'Starter',
    'Menu + Ordering — essentials for takeout & floor service. Bundle vs à-la-carte 700.',
    650,
    true, true, false, false, false,
    2, true, 10
  ),
  (
    'growth',
    'Growth',
    'Menu + Ordering + Inventory + Finance. Bundle vs à-la-carte 1500.',
    1350,
    true, true, true, true, false,
    10, true, 20
  ),
  (
    'full',
    'Full',
    'All five modules + more staff seats. Bundle vs à-la-carte 1750.',
    1500,
    true, true, true, true, true,
    25, true, 30
  )
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  monthly_price_etb = EXCLUDED.monthly_price_etb,
  menu_enabled = EXCLUDED.menu_enabled,
  ordering_enabled = EXCLUDED.ordering_enabled,
  inventory_enabled = EXCLUDED.inventory_enabled,
  finance_enabled = EXCLUDED.finance_enabled,
  hr_enabled = EXCLUDED.hr_enabled,
  max_staff_seats = EXCLUDED.max_staff_seats,
  active = EXCLUDED.active,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

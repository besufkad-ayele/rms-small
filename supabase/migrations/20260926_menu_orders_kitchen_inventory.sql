-- Menu images, order lifecycle + kitchen, inventory suppliers & stock ledger

-- ═══════════════════════════════════════
-- 1) Menu item image (optional WebP URL)
-- ═══════════════════════════════════════
ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS image_url TEXT;

INSERT INTO storage.buckets (id, name, public)
VALUES ('menu-images', 'menu-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS menu_images_upload ON storage.objects;
CREATE POLICY menu_images_upload ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'menu-images' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS menu_images_update ON storage.objects;
CREATE POLICY menu_images_update ON storage.objects FOR UPDATE
  USING (bucket_id = 'menu-images' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS menu_images_read ON storage.objects;
CREATE POLICY menu_images_read ON storage.objects FOR SELECT
  USING (bucket_id = 'menu-images');

-- ═══════════════════════════════════════
-- 2) Order status lifecycle
-- ═══════════════════════════════════════
DO $$ BEGIN
  CREATE TYPE public.sale_order_status AS ENUM (
    'placed',
    'preparing',
    'ready',
    'completed',
    'canceled'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.sale_orders
  ADD COLUMN IF NOT EXISTS status public.sale_order_status,
  ADD COLUMN IF NOT EXISTS place_label TEXT,
  ADD COLUMN IF NOT EXISTS kitchen_note TEXT,
  ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS canceled_by TEXT;

-- Existing sales are already finished
UPDATE public.sale_orders
SET status = 'completed'
WHERE status IS NULL;

ALTER TABLE public.sale_orders
  ALTER COLUMN status SET DEFAULT 'placed',
  ALTER COLUMN status SET NOT NULL;

CREATE INDEX IF NOT EXISTS sale_orders_org_status_idx
  ON public.sale_orders (organization_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS sale_orders_org_day_idx
  ON public.sale_orders (organization_id, day_key);

-- ═══════════════════════════════════════
-- 3) Kitchen module + inventory issue permission
-- ═══════════════════════════════════════
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS kitchen_enabled BOOLEAN NOT NULL DEFAULT false;

-- Column defaults to false; copy from ordering so existing cafés keep kitchen with POS.
UPDATE public.subscriptions
SET kitchen_enabled = true
WHERE COALESCE(ordering_enabled, false) = true;

ALTER TABLE public.payment_proofs
  ADD COLUMN IF NOT EXISTS kitchen_enabled BOOLEAN;

ALTER TABLE public.memberships
  ADD COLUMN IF NOT EXISTS can_kitchen BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_inventory_issue BOOLEAN NOT NULL DEFAULT false;

UPDATE public.memberships
SET
  can_kitchen = true,
  can_inventory_issue = true,
  updated_at = now()
WHERE role = 'owner';

UPDATE public.memberships
SET
  can_kitchen = true,
  can_inventory_issue = true,
  updated_at = now()
WHERE role = 'manager';

CREATE OR REPLACE FUNCTION public.member_has_feature(org UUID, feature TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.organization_id = org
      AND m.user_id = auth.uid()
      AND m.active = true
      AND (
        m.role = 'owner'
        OR (feature = 'order' AND m.can_order)
        OR (feature = 'menu' AND m.can_menu)
        OR (feature = 'inventory' AND m.can_inventory)
        OR (feature = 'inventory_issue' AND m.can_inventory_issue)
        OR (feature = 'kitchen' AND m.can_kitchen)
        OR (feature = 'finance' AND m.can_finance)
        OR (feature = 'billing' AND m.can_billing)
        OR (feature = 'staff' AND m.can_manage_staff)
      )
  );
$$;

-- Package catalog kitchen + module price (relax check + seed)
ALTER TABLE public.subscription_packages
  ADD COLUMN IF NOT EXISTS kitchen_enabled BOOLEAN NOT NULL DEFAULT false;

UPDATE public.subscription_packages
SET kitchen_enabled = true
WHERE code IN ('growth', 'full', 'aramis_growth', 'aramis_full');

ALTER TABLE public.subscription_module_prices
  DROP CONSTRAINT IF EXISTS subscription_module_prices_module_code_check;

ALTER TABLE public.subscription_module_prices
  ADD CONSTRAINT subscription_module_prices_module_code_check
  CHECK (module_code IN ('menu', 'ordering', 'kitchen', 'inventory', 'finance', 'hr'));

INSERT INTO public.subscription_module_prices
  (module_code, label, description, monthly_price_etb, active, sort_order)
VALUES
  ('kitchen', 'Kitchen', 'Kitchen display and prep tickets', 250, true, 25)
ON CONFLICT (module_code) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  active = EXCLUDED.active;

-- ═══════════════════════════════════════
-- 4) Inventory suppliers + stock movements
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.inventory_suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  location TEXT,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inventory_suppliers_org_idx
  ON public.inventory_suppliers (organization_id);

DO $$ BEGIN
  CREATE TYPE public.inventory_movement_kind AS ENUM ('in', 'out');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  inventory_item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  kind public.inventory_movement_kind NOT NULL,
  quantity NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
  -- stock-in (receive)
  supplier_id UUID REFERENCES public.inventory_suppliers(id) ON DELETE SET NULL,
  buyer_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  buyer_name TEXT,
  purchased_at DATE,
  expires_at DATE,
  cost_per_unit NUMERIC(12,4),
  -- stock-out (issue)
  issued_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  issued_by_name TEXT,
  issued_at TIMESTAMPTZ,
  detail TEXT,
  note TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inventory_movements_org_idx
  ON public.inventory_movements (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS inventory_movements_item_idx
  ON public.inventory_movements (inventory_item_id, created_at DESC);

-- Nearest / tracked expiry on the item itself (updated on receive)
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS expiry_date DATE,
  ADD COLUMN IF NOT EXISTS last_purchased_at DATE,
  ADD COLUMN IF NOT EXISTS default_supplier_id UUID
    REFERENCES public.inventory_suppliers(id) ON DELETE SET NULL;

ALTER TABLE public.inventory_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inventory_suppliers_all ON public.inventory_suppliers;
CREATE POLICY inventory_suppliers_all ON public.inventory_suppliers FOR ALL
  USING (public.org_access_ok(organization_id))
  WITH CHECK (public.org_access_ok(organization_id));

DROP POLICY IF EXISTS inventory_movements_all ON public.inventory_movements;
CREATE POLICY inventory_movements_all ON public.inventory_movements FOR ALL
  USING (public.org_access_ok(organization_id))
  WITH CHECK (public.org_access_ok(organization_id));

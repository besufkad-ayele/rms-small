-- Aramis (rms-small) multi-tenant SaaS schema
-- Modules: inventory (menu + stock + cashier), finance (reports + day close)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE public.org_type AS ENUM ('cafe', 'restaurant', 'other');
CREATE TYPE public.member_role AS ENUM ('owner', 'manager', 'cashier');
CREATE TYPE public.sub_status AS ENUM ('trialing', 'active', 'past_due', 'canceled', 'expired');
CREATE TYPE public.proof_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE public.payment_method AS ENUM ('cash', 'cbe', 'telebirr', 'other');
CREATE TYPE public.menu_category AS ENUM ('hot-drinks', 'cold-drinks', 'food', 'pastry', 'other');
CREATE TYPE public.app_module AS ENUM ('inventory', 'finance');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  org_type public.org_type NOT NULL DEFAULT 'cafe',
  phone TEXT,
  address TEXT,
  tin TEXT DEFAULT '—',
  vat_number TEXT DEFAULT '—',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.member_role NOT NULL DEFAULT 'owner',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  status public.sub_status NOT NULL DEFAULT 'trialing',
  inventory_enabled BOOLEAN NOT NULL DEFAULT true,
  finance_enabled BOOLEAN NOT NULL DEFAULT true,
  trial_ends_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '14 days'),
  current_period_end TIMESTAMPTZ,
  plan_code TEXT NOT NULL DEFAULT 'aramis_starter',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.payment_proofs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  method public.payment_method NOT NULL DEFAULT 'telebirr',
  reference TEXT,
  image_url TEXT,
  status public.proof_status NOT NULL DEFAULT 'pending',
  submitted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'kg',
  stock_qty NUMERIC(12,3) NOT NULL DEFAULT 0,
  low_stock_threshold NUMERIC(12,3) NOT NULL DEFAULT 1,
  cost_per_unit NUMERIC(12,4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.inventory_cost_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  cost_per_unit NUMERIC(12,4) NOT NULL,
  note TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category public.menu_category NOT NULL DEFAULT 'other',
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  available BOOLEAN NOT NULL DEFAULT true,
  description TEXT DEFAULT '',
  vote_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.menu_recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id UUID NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  inventory_item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  quantity_required NUMERIC(12,3) NOT NULL,
  UNIQUE (menu_item_id, inventory_item_id)
);

CREATE TABLE public.sale_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  receipt_number TEXT NOT NULL,
  subtotal NUMERIC(12,2) NOT NULL,
  service_charge NUMERIC(12,2) NOT NULL DEFAULT 0,
  vat NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL,
  payment_method public.payment_method NOT NULL DEFAULT 'cash',
  payment_reference TEXT,
  cashier_name TEXT NOT NULL,
  note TEXT,
  day_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX sale_orders_org_receipt_uidx
  ON public.sale_orders (organization_id, receipt_number);

CREATE TABLE public.sale_order_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.sale_orders(id) ON DELETE CASCADE,
  menu_item_id UUID REFERENCES public.menu_items(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  unit_price NUMERIC(12,2) NOT NULL,
  quantity INT NOT NULL CHECK (quantity > 0),
  line_total NUMERIC(12,2) NOT NULL
);

CREATE TABLE public.day_closes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  day_key TEXT NOT NULL,
  expected_sales_total NUMERIC(12,2) NOT NULL,
  declared_cash_total NUMERIC(12,2) NOT NULL,
  variance NUMERIC(12,2) NOT NULL,
  note TEXT DEFAULT '',
  proof_images TEXT[] NOT NULL DEFAULT '{}',
  closed_by TEXT NOT NULL,
  closed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  synced BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE public.org_meta (
  organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  receipt_seq INT NOT NULL DEFAULT 0,
  seeded BOOLEAN NOT NULL DEFAULT false
);

-- Helpers
CREATE OR REPLACE FUNCTION public.is_org_member(org UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.organization_id = org AND m.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_manager(org UUID)
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
      AND m.role IN ('owner', 'manager')
  );
$$;

CREATE OR REPLACE FUNCTION public.org_access_ok(org UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships m
    JOIN public.subscriptions s ON s.organization_id = m.organization_id
    WHERE m.organization_id = org
      AND m.user_id = auth.uid()
      AND (
        (s.status = 'trialing' AND s.trial_ends_at > now())
        OR s.status = 'active'
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'phone'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.record_inventory_cost_history()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.inventory_cost_history (inventory_item_id, cost_per_unit, note)
    VALUES (NEW.id, NEW.cost_per_unit, 'Initial');
  ELSIF TG_OP = 'UPDATE' AND NEW.cost_per_unit IS DISTINCT FROM OLD.cost_per_unit THEN
    INSERT INTO public.inventory_cost_history (inventory_item_id, cost_per_unit, note)
    VALUES (NEW.id, NEW.cost_per_unit, 'Cost update');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inventory_cost_history ON public.inventory_items;
CREATE TRIGGER trg_inventory_cost_history
AFTER INSERT OR UPDATE OF cost_per_unit ON public.inventory_items
FOR EACH ROW EXECUTE FUNCTION public.record_inventory_cost_history();

CREATE OR REPLACE FUNCTION public.trim_inventory_cost_history()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM public.inventory_cost_history
  WHERE id IN (
    SELECT id FROM public.inventory_cost_history
    WHERE inventory_item_id = NEW.inventory_item_id
    ORDER BY recorded_at DESC
    OFFSET 12
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_trim_inventory_cost_history ON public.inventory_cost_history;
CREATE TRIGGER trg_trim_inventory_cost_history
AFTER INSERT ON public.inventory_cost_history
FOR EACH ROW EXECUTE FUNCTION public.trim_inventory_cost_history();

-- RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_cost_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.day_closes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_meta ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_select_own ON public.profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE USING (id = auth.uid());

CREATE POLICY orgs_select_member ON public.organizations FOR SELECT
  USING (public.is_org_member(id));
CREATE POLICY orgs_insert_auth ON public.organizations FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY orgs_update_manager ON public.organizations FOR UPDATE
  USING (public.is_org_manager(id));

CREATE POLICY memberships_select ON public.memberships FOR SELECT
  USING (user_id = auth.uid() OR public.is_org_member(organization_id));
CREATE POLICY memberships_insert_self ON public.memberships FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY subscriptions_select ON public.subscriptions FOR SELECT
  USING (public.is_org_member(organization_id));
CREATE POLICY subscriptions_insert ON public.subscriptions FOR INSERT
  WITH CHECK (public.is_org_manager(organization_id) OR public.is_org_member(organization_id));
CREATE POLICY subscriptions_update ON public.subscriptions FOR UPDATE
  USING (public.is_org_manager(organization_id));

CREATE POLICY proofs_select ON public.payment_proofs FOR SELECT
  USING (public.is_org_member(organization_id));
CREATE POLICY proofs_insert ON public.payment_proofs FOR INSERT
  WITH CHECK (public.is_org_member(organization_id));

CREATE POLICY inv_all ON public.inventory_items FOR ALL
  USING (public.org_access_ok(organization_id))
  WITH CHECK (public.org_access_ok(organization_id));

CREATE POLICY inv_hist_select ON public.inventory_cost_history FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.inventory_items i
    WHERE i.id = inventory_item_id AND public.org_access_ok(i.organization_id)
  ));
CREATE POLICY inv_hist_insert ON public.inventory_cost_history FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.inventory_items i
    WHERE i.id = inventory_item_id AND public.org_access_ok(i.organization_id)
  ));

CREATE POLICY menu_all ON public.menu_items FOR ALL
  USING (public.org_access_ok(organization_id))
  WITH CHECK (public.org_access_ok(organization_id));

CREATE POLICY recipes_all ON public.menu_recipes FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.menu_items m
    WHERE m.id = menu_item_id AND public.org_access_ok(m.organization_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.menu_items m
    WHERE m.id = menu_item_id AND public.org_access_ok(m.organization_id)
  ));

CREATE POLICY orders_all ON public.sale_orders FOR ALL
  USING (public.org_access_ok(organization_id))
  WITH CHECK (public.org_access_ok(organization_id));

CREATE POLICY order_lines_all ON public.sale_order_lines FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.sale_orders o
    WHERE o.id = order_id AND public.org_access_ok(o.organization_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.sale_orders o
    WHERE o.id = order_id AND public.org_access_ok(o.organization_id)
  ));

CREATE POLICY day_closes_all ON public.day_closes FOR ALL
  USING (public.org_access_ok(organization_id))
  WITH CHECK (public.org_access_ok(organization_id));

CREATE POLICY org_meta_all ON public.org_meta FOR ALL
  USING (public.org_access_ok(organization_id))
  WITH CHECK (public.org_access_ok(organization_id));

-- Storage bucket for payment proofs (public read for simplicity in MVP)
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-proofs', 'payment-proofs', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY payment_proofs_upload ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'payment-proofs' AND auth.uid() IS NOT NULL);
CREATE POLICY payment_proofs_read ON storage.objects FOR SELECT
  USING (bucket_id = 'payment-proofs');

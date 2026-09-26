-- Multi-area upgrade: inventory units, subscription modules, payment module flags, org TIN/website

-- ═══════════════════════════════════════
-- 1) Subscription modules (5 independent flags)
-- ═══════════════════════════════════════
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS menu_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ordering_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS hr_enabled BOOLEAN NOT NULL DEFAULT true;

-- Backfill from legacy inventory_enabled
UPDATE public.subscriptions
SET
  menu_enabled = COALESCE(menu_enabled, inventory_enabled),
  ordering_enabled = COALESCE(ordering_enabled, inventory_enabled),
  hr_enabled = COALESCE(hr_enabled, true)
WHERE true;

-- Payment proofs: requested modules + media kind
ALTER TABLE public.payment_proofs
  ADD COLUMN IF NOT EXISTS menu_enabled BOOLEAN,
  ADD COLUMN IF NOT EXISTS ordering_enabled BOOLEAN,
  ADD COLUMN IF NOT EXISTS inventory_enabled BOOLEAN,
  ADD COLUMN IF NOT EXISTS finance_enabled BOOLEAN,
  ADD COLUMN IF NOT EXISTS hr_enabled BOOLEAN,
  ADD COLUMN IF NOT EXISTS media_kind TEXT DEFAULT 'image';

-- Optional website on organizations
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS website TEXT;

-- ═══════════════════════════════════════
-- 2) Inventory units (org-scoped)
-- ═══════════════════════════════════════
DO $$ BEGIN
  CREATE TYPE public.unit_kind AS ENUM ('mass', 'volume', 'count', 'custom');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.inventory_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  kind public.unit_kind NOT NULL DEFAULT 'custom',
  base_unit TEXT,
  to_base_factor NUMERIC(18,8) NOT NULL DEFAULT 1,
  is_builtin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);

CREATE INDEX IF NOT EXISTS inventory_units_org_idx
  ON public.inventory_units (organization_id);

ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES public.inventory_units(id) ON DELETE SET NULL;

ALTER TABLE public.inventory_units ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inventory_units_all ON public.inventory_units;
CREATE POLICY inventory_units_all ON public.inventory_units FOR ALL
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS inventory_units_platform ON public.inventory_units;
CREATE POLICY inventory_units_platform ON public.inventory_units FOR SELECT
  USING (public.is_platform_admin());

-- Seed built-in units for every org (idempotent)
CREATE OR REPLACE FUNCTION public.seed_org_inventory_units(p_org_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.inventory_units (organization_id, code, label, kind, base_unit, to_base_factor, is_builtin)
  VALUES
    (p_org_id, 'kg',  'Kilogram',  'mass',   'g',  1000, true),
    (p_org_id, 'g',   'Gram',      'mass',   'g',  1,    true),
    (p_org_id, 'mg',  'Milligram', 'mass',   'g',  0.001, true),
    (p_org_id, 'L',   'Liter',     'volume', 'mL', 1000, true),
    (p_org_id, 'mL',  'Milliliter','volume', 'mL', 1,    true),
    (p_org_id, 'pcs', 'Piece',     'count',  'pcs', 1,   true),
    (p_org_id, 'pack','Pack',      'count',  'pcs', 1,   true),
    (p_org_id, 'package','Package','count',  'pcs', 1,   true),
    (p_org_id, 'box', 'Box',       'count',  'pcs', 1,   true),
    (p_org_id, 'bottle','Bottle',  'count',  'pcs', 1,   true),
    (p_org_id, 'can', 'Can',       'count',  'pcs', 1,   true)
  ON CONFLICT (organization_id, code) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.seed_org_inventory_units TO authenticated;

-- Backfill units for existing orgs + link inventory items by unit text
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.organizations LOOP
    PERFORM public.seed_org_inventory_units(r.id);
  END LOOP;

  UPDATE public.inventory_items i
  SET unit_id = u.id
  FROM public.inventory_units u
  WHERE u.organization_id = i.organization_id
    AND lower(u.code) = lower(i.unit)
    AND i.unit_id IS NULL;
END $$;

-- ═══════════════════════════════════════
-- 3) Expand onboard_business with TIN/VAT/website + 5 modules
-- Drop prior overloads so RPC resolves cleanly
-- ═══════════════════════════════════════
DROP FUNCTION IF EXISTS public.onboard_business(
  text, public.org_type, text, text, text, text, text, text, text, text, boolean, boolean
);

CREATE OR REPLACE FUNCTION public.onboard_business(
  p_name text,
  p_org_type public.org_type,
  p_phone text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_address text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_region text DEFAULT NULL,
  p_country text DEFAULT 'Ethiopia',
  p_license text DEFAULT NULL,
  p_id_doc text DEFAULT NULL,
  p_inventory boolean DEFAULT true,
  p_finance boolean DEFAULT true,
  p_tin text DEFAULT NULL,
  p_vat text DEFAULT NULL,
  p_website text DEFAULT NULL,
  p_menu boolean DEFAULT NULL,
  p_ordering boolean DEFAULT NULL,
  p_hr boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org_id uuid;
  v_trial timestamptz := now() + interval '14 days';
  v_menu boolean := COALESCE(p_menu, p_inventory);
  v_ordering boolean := COALESCE(p_ordering, p_inventory);
  v_hr boolean := COALESCE(p_hr, true);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT p_inventory AND NOT p_finance AND NOT v_menu AND NOT v_ordering AND NOT v_hr THEN
    RAISE EXCEPTION 'Enable at least one module';
  END IF;
  IF EXISTS (SELECT 1 FROM public.memberships WHERE user_id = v_uid) THEN
    RAISE EXCEPTION 'You already belong to a business';
  END IF;

  INSERT INTO public.organizations (
    name, org_type, phone, email, address, city, region, country,
    tin, vat_number, website,
    business_license_url, id_document_url, verification_status, created_by
  ) VALUES (
    trim(p_name), p_org_type, nullif(trim(p_phone), ''), nullif(lower(trim(p_email)), ''),
    nullif(trim(p_address), ''), nullif(trim(p_city), ''), nullif(trim(p_region), ''),
    coalesce(nullif(trim(p_country), ''), 'Ethiopia'),
    nullif(trim(p_tin), ''), nullif(trim(p_vat), ''), nullif(trim(p_website), ''),
    p_license, p_id_doc, 'pending', v_uid
  )
  RETURNING id INTO v_org_id;

  INSERT INTO public.memberships (
    organization_id, user_id, role,
    can_order, can_menu, can_inventory, can_finance, can_billing, can_manage_staff, active
  ) VALUES (
    v_org_id, v_uid, 'owner',
    true, true, true, true, true, true, true
  );

  INSERT INTO public.subscriptions (
    organization_id, status,
    inventory_enabled, finance_enabled, menu_enabled, ordering_enabled, hr_enabled,
    trial_ends_at, plan_code, notes, max_staff_seats
  ) VALUES (
    v_org_id, 'expired',
    p_inventory, p_finance, v_menu, v_ordering, v_hr,
    v_trial, 'aramis_starter',
    'Awaiting Aramis verification before trial starts', 2
  );

  INSERT INTO public.org_meta (organization_id, receipt_seq, seeded)
  VALUES (v_org_id, 0, false)
  ON CONFLICT (organization_id) DO NOTHING;

  -- Built-in units only — no demo inventory/menu
  PERFORM public.seed_org_inventory_units(v_org_id);

  UPDATE public.profiles
  SET
    email = coalesce(nullif(lower(trim(p_email)), ''), email),
    phone = coalesce(nullif(trim(p_phone), ''), phone),
    updated_at = now()
  WHERE id = v_uid;

  RETURN v_org_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.onboard_business TO authenticated;

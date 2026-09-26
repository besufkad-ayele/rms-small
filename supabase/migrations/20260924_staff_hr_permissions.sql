-- Staff / HR: per-feature permissions + package seat limits

ALTER TABLE public.memberships
  ADD COLUMN IF NOT EXISTS can_order BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_menu BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_inventory BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_finance BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_billing BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_staff BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Owners get full access
UPDATE public.memberships
SET
  can_order = true,
  can_menu = true,
  can_inventory = true,
  can_finance = true,
  can_billing = true,
  can_manage_staff = true,
  updated_at = now()
WHERE role = 'owner';

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS max_staff_seats INT NOT NULL DEFAULT 2;

-- Plan defaults: basic=2, growth/medium=10, enterprise=50
UPDATE public.subscriptions
SET max_staff_seats = CASE
  WHEN plan_code IN ('aramis_enterprise', 'enterprise') THEN 50
  WHEN plan_code IN ('aramis_growth', 'aramis_medium', 'medium', 'growth') THEN 10
  ELSE 2
END
WHERE max_staff_seats = 2 OR max_staff_seats IS NULL;

CREATE OR REPLACE FUNCTION public.is_org_owner(org UUID)
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
      AND m.role = 'owner'
      AND m.active = true
  );
$$;

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
        OR (feature = 'finance' AND m.can_finance)
        OR (feature = 'billing' AND m.can_billing)
        OR (feature = 'staff' AND m.can_manage_staff)
      )
  );
$$;

-- Active membership required for org access
CREATE OR REPLACE FUNCTION public.is_org_member(org UUID)
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
    JOIN public.organizations o ON o.id = m.organization_id
    WHERE m.organization_id = org
      AND m.user_id = auth.uid()
      AND m.active = true
      AND coalesce(o.verification_status, 'approved') = 'approved'
      AND (
        (s.status = 'trialing' AND s.trial_ends_at > now())
        OR (s.status = 'active' AND (s.current_period_end IS NULL OR s.current_period_end > now()))
      )
  );
$$;

-- Seat helper for server / RPC checks
CREATE OR REPLACE FUNCTION public.staff_seat_count(org UUID)
RETURNS INT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::int
  FROM public.memberships m
  WHERE m.organization_id = org
    AND m.role <> 'owner'
    AND m.active = true;
$$;

-- Owners may update / deactivate staff memberships (not transfer ownership via client)
DROP POLICY IF EXISTS memberships_update_owner ON public.memberships;
CREATE POLICY memberships_update_owner ON public.memberships FOR UPDATE
  USING (public.is_org_owner(organization_id))
  WITH CHECK (public.is_org_owner(organization_id));

DROP POLICY IF EXISTS memberships_insert_owner ON public.memberships;
CREATE POLICY memberships_insert_owner ON public.memberships FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    OR public.is_org_owner(organization_id)
  );

-- Owners can read profiles of people in their org (for Staff HR list)
DROP POLICY IF EXISTS profiles_select_org_peers ON public.profiles;
CREATE POLICY profiles_select_org_peers ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.memberships mine
      JOIN public.memberships theirs
        ON theirs.organization_id = mine.organization_id
      WHERE mine.user_id = auth.uid()
        AND mine.active = true
        AND mine.role = 'owner'
        AND theirs.user_id = profiles.id
    )
  );

-- Keep onboard creating owners with full perms
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
  p_finance boolean DEFAULT true
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
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT p_inventory AND NOT p_finance THEN
    RAISE EXCEPTION 'Enable at least one module';
  END IF;
  IF EXISTS (SELECT 1 FROM public.memberships WHERE user_id = v_uid) THEN
    RAISE EXCEPTION 'You already belong to a business';
  END IF;

  INSERT INTO public.organizations (
    name, org_type, phone, email, address, city, region, country,
    business_license_url, id_document_url, verification_status, created_by
  ) VALUES (
    trim(p_name), p_org_type, nullif(trim(p_phone), ''), nullif(lower(trim(p_email)), ''),
    nullif(trim(p_address), ''), nullif(trim(p_city), ''), nullif(trim(p_region), ''),
    coalesce(nullif(trim(p_country), ''), 'Ethiopia'),
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
    organization_id, status, inventory_enabled, finance_enabled,
    trial_ends_at, plan_code, notes, max_staff_seats
  ) VALUES (
    v_org_id, 'expired', p_inventory, p_finance, v_trial, 'aramis_starter',
    'Awaiting Aramis verification before trial starts', 2
  );

  INSERT INTO public.org_meta (organization_id, receipt_seq, seeded)
  VALUES (v_org_id, 0, false)
  ON CONFLICT (organization_id) DO NOTHING;

  UPDATE public.profiles
  SET
    email = coalesce(nullif(lower(trim(p_email)), ''), email),
    phone = coalesce(nullif(trim(p_phone), ''), phone),
    updated_at = now()
  WHERE id = v_uid;

  RETURN v_org_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_org_owner TO authenticated;
GRANT EXECUTE ON FUNCTION public.member_has_feature TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_seat_count TO authenticated;

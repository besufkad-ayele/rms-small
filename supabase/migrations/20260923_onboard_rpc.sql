-- Fix onboarding RLS + atomic onboard RPC

DROP POLICY IF EXISTS orgs_select_creator ON public.organizations;
CREATE POLICY orgs_select_creator ON public.organizations FOR SELECT
  USING (created_by = auth.uid());

DROP POLICY IF EXISTS orgs_insert_auth ON public.organizations;
CREATE POLICY orgs_insert_auth ON public.organizations FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND created_by = auth.uid());

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

  INSERT INTO public.memberships (organization_id, user_id, role)
  VALUES (v_org_id, v_uid, 'owner');

  INSERT INTO public.subscriptions (
    organization_id, status, inventory_enabled, finance_enabled,
    trial_ends_at, plan_code, notes
  ) VALUES (
    v_org_id, 'expired', p_inventory, p_finance, v_trial, 'aramis_starter',
    'Awaiting Aramis verification before trial starts'
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

GRANT EXECUTE ON FUNCTION public.onboard_business TO authenticated;

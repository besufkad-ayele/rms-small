-- Harden tenancy/billing RLS, lock staff features in policies, and add an
-- idempotent complete_sale RPC (atomic receipt + lines + stock).

-- ═══════════════════════════════════════
-- Helpers
-- ═══════════════════════════════════════

CREATE OR REPLACE FUNCTION public.org_feature_ok(org UUID, VARIADIC features TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_admin()
    OR (
      public.org_access_ok(org)
      AND EXISTS (
        SELECT 1 FROM unnest(features) AS f(feature)
        WHERE public.member_has_feature(org, f.feature)
      )
    );
$$;

REVOKE ALL ON FUNCTION public.org_feature_ok(UUID, TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.org_feature_ok(UUID, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.org_feature_ok(UUID, TEXT[]) TO service_role;

CREATE OR REPLACE FUNCTION public.storage_first_folder_org(object_name TEXT)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  folder TEXT;
BEGIN
  folder := (storage.foldername(object_name))[1];
  IF folder IS NULL OR folder !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN NULL;
  END IF;
  RETURN folder::uuid;
END;
$$;

-- ═══════════════════════════════════════
-- Profiles: cannot self-grant platform admin
-- ═══════════════════════════════════════

CREATE OR REPLACE FUNCTION public.protect_profile_admin_flag()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_platform_admin IS DISTINCT FROM OLD.is_platform_admin THEN
    IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.is_platform_admin() THEN
      RAISE EXCEPTION 'cannot change is_platform_admin';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_admin_flag ON public.profiles;
CREATE TRIGGER trg_protect_profile_admin_flag
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_admin_flag();

-- ═══════════════════════════════════════
-- Organizations: freeze KYC columns
-- ═══════════════════════════════════════

CREATE OR REPLACE FUNCTION public.protect_org_kyc_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.is_platform_admin() THEN
    NEW.verification_status := OLD.verification_status;
    NEW.verified_at := OLD.verified_at;
    NEW.verified_by := OLD.verified_by;
    NEW.admin_notes := OLD.admin_notes;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_org_kyc_columns ON public.organizations;
CREATE TRIGGER trg_protect_org_kyc_columns
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_org_kyc_columns();

DROP POLICY IF EXISTS orgs_insert_auth ON public.organizations;

-- ═══════════════════════════════════════
-- Memberships: invite / owner only (no self-join)
-- ═══════════════════════════════════════

DROP POLICY IF EXISTS memberships_insert_self ON public.memberships;
DROP POLICY IF EXISTS memberships_insert_owner ON public.memberships;
CREATE POLICY memberships_insert_owner ON public.memberships FOR INSERT
  WITH CHECK (
    public.is_org_owner(organization_id)
    OR public.is_platform_admin()
  );

-- ═══════════════════════════════════════
-- Subscriptions: platform-only writes
-- ═══════════════════════════════════════

DROP POLICY IF EXISTS subscriptions_insert ON public.subscriptions;
CREATE POLICY subscriptions_insert_platform ON public.subscriptions FOR INSERT
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS subscriptions_update ON public.subscriptions;

-- ═══════════════════════════════════════
-- seed_org_inventory_units: must belong to org
-- ═══════════════════════════════════════

CREATE OR REPLACE FUNCTION public.seed_org_inventory_units(p_org_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND NOT public.is_platform_admin()
     AND NOT public.is_org_member(p_org_id) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

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

-- ═══════════════════════════════════════
-- Operational table policies (feature-gated)
-- ═══════════════════════════════════════

DROP POLICY IF EXISTS inv_all ON public.inventory_items;
CREATE POLICY inv_select ON public.inventory_items FOR SELECT
  USING (public.org_feature_ok(organization_id, 'inventory', 'menu', 'order', 'finance'));
CREATE POLICY inv_write ON public.inventory_items FOR INSERT
  WITH CHECK (public.org_feature_ok(organization_id, 'inventory'));
CREATE POLICY inv_update ON public.inventory_items FOR UPDATE
  USING (public.org_feature_ok(organization_id, 'inventory', 'order'))
  WITH CHECK (public.org_feature_ok(organization_id, 'inventory', 'order'));
CREATE POLICY inv_delete ON public.inventory_items FOR DELETE
  USING (public.org_feature_ok(organization_id, 'inventory'));

DROP POLICY IF EXISTS inv_hist_select ON public.inventory_cost_history;
DROP POLICY IF EXISTS inv_hist_insert ON public.inventory_cost_history;
CREATE POLICY inv_hist_select ON public.inventory_cost_history FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.inventory_items i
    WHERE i.id = inventory_item_id
      AND public.org_feature_ok(i.organization_id, 'inventory', 'finance')
  ));
CREATE POLICY inv_hist_insert ON public.inventory_cost_history FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.inventory_items i
    WHERE i.id = inventory_item_id
      AND public.org_feature_ok(i.organization_id, 'inventory')
  ));

DROP POLICY IF EXISTS menu_all ON public.menu_items;
CREATE POLICY menu_select ON public.menu_items FOR SELECT
  USING (public.org_feature_ok(organization_id, 'menu', 'order', 'kitchen', 'inventory'));
CREATE POLICY menu_insert ON public.menu_items FOR INSERT
  WITH CHECK (public.org_feature_ok(organization_id, 'menu'));
CREATE POLICY menu_update ON public.menu_items FOR UPDATE
  USING (public.org_feature_ok(organization_id, 'menu', 'order'))
  WITH CHECK (public.org_feature_ok(organization_id, 'menu', 'order'));
CREATE POLICY menu_delete ON public.menu_items FOR DELETE
  USING (public.org_feature_ok(organization_id, 'menu'));

DROP POLICY IF EXISTS recipes_all ON public.menu_recipes;
CREATE POLICY recipes_select ON public.menu_recipes FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.menu_items m
    WHERE m.id = menu_item_id
      AND public.org_feature_ok(m.organization_id, 'menu', 'order', 'kitchen', 'inventory')
  ));
CREATE POLICY recipes_write ON public.menu_recipes FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.menu_items m
    WHERE m.id = menu_item_id
      AND public.org_feature_ok(m.organization_id, 'menu')
  ));
CREATE POLICY recipes_update ON public.menu_recipes FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.menu_items m
    WHERE m.id = menu_item_id
      AND public.org_feature_ok(m.organization_id, 'menu')
  ));
CREATE POLICY recipes_delete ON public.menu_recipes FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.menu_items m
    WHERE m.id = menu_item_id
      AND public.org_feature_ok(m.organization_id, 'menu')
  ));

DROP POLICY IF EXISTS orders_all ON public.sale_orders;
CREATE POLICY orders_select ON public.sale_orders FOR SELECT
  USING (public.org_feature_ok(organization_id, 'order', 'kitchen', 'finance'));
CREATE POLICY orders_insert ON public.sale_orders FOR INSERT
  WITH CHECK (public.org_feature_ok(organization_id, 'order'));
CREATE POLICY orders_update ON public.sale_orders FOR UPDATE
  USING (public.org_feature_ok(organization_id, 'order', 'kitchen'))
  WITH CHECK (public.org_feature_ok(organization_id, 'order', 'kitchen'));
CREATE POLICY orders_delete ON public.sale_orders FOR DELETE
  USING (public.org_feature_ok(organization_id, 'order', 'finance'));

DROP POLICY IF EXISTS order_lines_all ON public.sale_order_lines;
CREATE POLICY order_lines_select ON public.sale_order_lines FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.sale_orders o
    WHERE o.id = order_id
      AND public.org_feature_ok(o.organization_id, 'order', 'kitchen', 'finance')
  ));
CREATE POLICY order_lines_insert ON public.sale_order_lines FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.sale_orders o
    WHERE o.id = order_id
      AND public.org_feature_ok(o.organization_id, 'order')
  ));
CREATE POLICY order_lines_update ON public.sale_order_lines FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.sale_orders o
    WHERE o.id = order_id
      AND public.org_feature_ok(o.organization_id, 'order', 'kitchen')
  ));
CREATE POLICY order_lines_delete ON public.sale_order_lines FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.sale_orders o
    WHERE o.id = order_id
      AND public.org_feature_ok(o.organization_id, 'order')
  ));

DROP POLICY IF EXISTS day_closes_all ON public.day_closes;
CREATE POLICY day_closes_select ON public.day_closes FOR SELECT
  USING (public.org_feature_ok(organization_id, 'finance'));
CREATE POLICY day_closes_write ON public.day_closes FOR INSERT
  WITH CHECK (public.org_feature_ok(organization_id, 'finance'));
CREATE POLICY day_closes_update ON public.day_closes FOR UPDATE
  USING (public.org_feature_ok(organization_id, 'finance'))
  WITH CHECK (public.org_feature_ok(organization_id, 'finance'));
CREATE POLICY day_closes_delete ON public.day_closes FOR DELETE
  USING (public.org_feature_ok(organization_id, 'finance'));

DROP POLICY IF EXISTS x_reports_all ON public.x_reports;
CREATE POLICY x_reports_select ON public.x_reports FOR SELECT
  USING (public.org_feature_ok(organization_id, 'finance'));
CREATE POLICY x_reports_write ON public.x_reports FOR INSERT
  WITH CHECK (public.org_feature_ok(organization_id, 'finance'));
CREATE POLICY x_reports_update ON public.x_reports FOR UPDATE
  USING (public.org_feature_ok(organization_id, 'finance'))
  WITH CHECK (public.org_feature_ok(organization_id, 'finance'));
CREATE POLICY x_reports_delete ON public.x_reports FOR DELETE
  USING (public.org_feature_ok(organization_id, 'finance'));

DROP POLICY IF EXISTS paid_bills_all ON public.paid_bills;
CREATE POLICY paid_bills_select ON public.paid_bills FOR SELECT
  USING (public.org_feature_ok(organization_id, 'finance'));
CREATE POLICY paid_bills_write ON public.paid_bills FOR INSERT
  WITH CHECK (public.org_feature_ok(organization_id, 'finance'));
CREATE POLICY paid_bills_update ON public.paid_bills FOR UPDATE
  USING (public.org_feature_ok(organization_id, 'finance'))
  WITH CHECK (public.org_feature_ok(organization_id, 'finance'));
CREATE POLICY paid_bills_delete ON public.paid_bills FOR DELETE
  USING (public.org_feature_ok(organization_id, 'finance'));

DROP POLICY IF EXISTS inventory_units_all ON public.inventory_units;
CREATE POLICY inventory_units_select ON public.inventory_units FOR SELECT
  USING (public.org_feature_ok(organization_id, 'inventory', 'menu', 'order'));
CREATE POLICY inventory_units_write ON public.inventory_units FOR INSERT
  WITH CHECK (public.org_feature_ok(organization_id, 'inventory'));
CREATE POLICY inventory_units_update ON public.inventory_units FOR UPDATE
  USING (public.org_feature_ok(organization_id, 'inventory'))
  WITH CHECK (public.org_feature_ok(organization_id, 'inventory'));
CREATE POLICY inventory_units_delete ON public.inventory_units FOR DELETE
  USING (public.org_feature_ok(organization_id, 'inventory'));

DROP POLICY IF EXISTS inventory_suppliers_all ON public.inventory_suppliers;
CREATE POLICY inventory_suppliers_select ON public.inventory_suppliers FOR SELECT
  USING (public.org_feature_ok(organization_id, 'inventory'));
CREATE POLICY inventory_suppliers_write ON public.inventory_suppliers FOR INSERT
  WITH CHECK (public.org_feature_ok(organization_id, 'inventory'));
CREATE POLICY inventory_suppliers_update ON public.inventory_suppliers FOR UPDATE
  USING (public.org_feature_ok(organization_id, 'inventory'))
  WITH CHECK (public.org_feature_ok(organization_id, 'inventory'));
CREATE POLICY inventory_suppliers_delete ON public.inventory_suppliers FOR DELETE
  USING (public.org_feature_ok(organization_id, 'inventory'));

DROP POLICY IF EXISTS inventory_movements_all ON public.inventory_movements;
CREATE POLICY inventory_movements_select ON public.inventory_movements FOR SELECT
  USING (public.org_feature_ok(organization_id, 'inventory', 'finance'));
CREATE POLICY inventory_movements_write ON public.inventory_movements FOR INSERT
  WITH CHECK (public.org_feature_ok(organization_id, 'inventory'));
CREATE POLICY inventory_movements_update ON public.inventory_movements FOR UPDATE
  USING (public.org_feature_ok(organization_id, 'inventory'))
  WITH CHECK (public.org_feature_ok(organization_id, 'inventory'));
CREATE POLICY inventory_movements_delete ON public.inventory_movements FOR DELETE
  USING (public.org_feature_ok(organization_id, 'inventory'));

DROP POLICY IF EXISTS org_meta_all ON public.org_meta;
DROP POLICY IF EXISTS org_meta_select ON public.org_meta;
DROP POLICY IF EXISTS org_meta_insert ON public.org_meta;
DROP POLICY IF EXISTS org_meta_update ON public.org_meta;
CREATE POLICY org_meta_select ON public.org_meta FOR SELECT
  USING (public.org_access_ok(organization_id) OR public.is_platform_admin());
CREATE POLICY org_meta_insert ON public.org_meta FOR INSERT
  WITH CHECK (public.org_feature_ok(organization_id, 'finance'));
CREATE POLICY org_meta_update ON public.org_meta FOR UPDATE
  USING (public.org_feature_ok(organization_id, 'finance'))
  WITH CHECK (public.org_feature_ok(organization_id, 'finance'));

-- ═══════════════════════════════════════
-- Storage: private payment proofs, scoped uploads
-- ═══════════════════════════════════════

UPDATE storage.buckets
SET public = false
WHERE id = 'payment-proofs';

DROP POLICY IF EXISTS payment_proofs_upload ON storage.objects;
DROP POLICY IF EXISTS payment_proofs_read ON storage.objects;
DROP POLICY IF EXISTS payment_proofs_update ON storage.objects;
DROP POLICY IF EXISTS payment_proofs_delete ON storage.objects;

CREATE POLICY payment_proofs_upload ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'payment-proofs'
    AND auth.uid() IS NOT NULL
    AND (
      public.is_platform_admin()
      OR public.is_org_member(public.storage_first_folder_org(name))
    )
  );

CREATE POLICY payment_proofs_read ON storage.objects FOR SELECT
  USING (
    bucket_id = 'payment-proofs'
    AND (
      public.is_platform_admin()
      OR public.is_org_member(public.storage_first_folder_org(name))
    )
  );

CREATE POLICY payment_proofs_update ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'payment-proofs'
    AND (
      public.is_platform_admin()
      OR public.is_org_member(public.storage_first_folder_org(name))
    )
  );

CREATE POLICY payment_proofs_delete ON storage.objects FOR DELETE
  USING (
    bucket_id = 'payment-proofs'
    AND (
      public.is_platform_admin()
      OR public.is_org_owner(public.storage_first_folder_org(name))
    )
  );

DROP POLICY IF EXISTS menu_images_upload ON storage.objects;
DROP POLICY IF EXISTS menu_images_update ON storage.objects;
CREATE POLICY menu_images_upload ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'menu-images'
    AND auth.uid() IS NOT NULL
    AND (
      public.is_platform_admin()
      OR public.org_feature_ok(public.storage_first_folder_org(name), 'menu')
    )
  );
CREATE POLICY menu_images_update ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'menu-images'
    AND (
      public.is_platform_admin()
      OR public.org_feature_ok(public.storage_first_folder_org(name), 'menu')
    )
  );

-- ═══════════════════════════════════════
-- Stop persisting issued owner passwords
-- ═══════════════════════════════════════

UPDATE public.organizations SET platform_login_password = NULL
WHERE platform_login_password IS NOT NULL;

-- ═══════════════════════════════════════
-- complete_sale RPC
-- ═══════════════════════════════════════

ALTER TABLE public.sale_orders
  ADD COLUMN IF NOT EXISTS client_order_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS sale_orders_org_client_id_uidx
  ON public.sale_orders (organization_id, client_order_id)
  WHERE client_order_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sale_order_json(p_order_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT to_jsonb(o) || jsonb_build_object(
    'sale_order_lines',
    COALESCE((
      SELECT jsonb_agg(to_jsonb(l) ORDER BY l.id)
      FROM public.sale_order_lines l
      WHERE l.order_id = o.id
    ), '[]'::jsonb),
    'lines',
    COALESCE((
      SELECT jsonb_agg(to_jsonb(l) ORDER BY l.id)
      FROM public.sale_order_lines l
      WHERE l.order_id = o.id
    ), '[]'::jsonb)
  )
  FROM public.sale_orders o
  WHERE o.id = p_order_id;
$$;

CREATE OR REPLACE FUNCTION public.complete_sale(
  p_org_id UUID,
  p_client_order_id TEXT,
  p_lines JSONB,
  p_cashier_name TEXT,
  p_payment_method TEXT DEFAULT 'cash',
  p_payment_reference TEXT DEFAULT NULL,
  p_payment_proof_url TEXT DEFAULT NULL,
  p_place_label TEXT DEFAULT NULL,
  p_kitchen_note TEXT DEFAULT NULL,
  p_mark_paid BOOLEAN DEFAULT false,
  p_source TEXT DEFAULT 'pos',
  p_created_at TIMESTAMPTZ DEFAULT now(),
  p_guest_name TEXT DEFAULT NULL,
  p_guest_phone TEXT DEFAULT NULL,
  p_guest_note TEXT DEFAULT NULL,
  p_day_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client TEXT;
  v_existing UUID;
  v_line_count INT;
  v_created TIMESTAMPTZ;
  v_day TEXT;
  v_stamp TEXT;
  v_seq INT;
  v_receipt TEXT;
  v_vat NUMERIC;
  v_svc NUMERIC;
  v_subtotal NUMERIC := 0;
  v_service NUMERIC := 0;
  v_vat_amt NUMERIC := 0;
  v_total NUMERIC := 0;
  v_order_id UUID;
  v_elem JSONB;
  v_item UUID;
  v_qty INT;
  v_name TEXT;
  v_price NUMERIC;
  v_line_total NUMERIC;
  v_menu RECORD;
  v_recipe RECORD;
  v_now TIMESTAMPTZ := now();
  v_paid BOOLEAN;
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'organization required';
  END IF;

  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF NOT public.org_feature_ok(p_org_id, 'order') THEN
      RAISE EXCEPTION 'not allowed';
    END IF;
  END IF;

  v_client := nullif(trim(p_client_order_id), '');
  IF v_client IS NULL THEN
    v_client := 'sale_' || replace(gen_random_uuid()::text, '-', '');
  END IF;

  SELECT id INTO v_existing
  FROM public.sale_orders
  WHERE organization_id = p_org_id AND client_order_id = v_client
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    SELECT count(*) INTO v_line_count
    FROM public.sale_order_lines
    WHERE order_id = v_existing;
    IF v_line_count > 0 THEN
      RETURN public.sale_order_json(v_existing);
    END IF;
    v_order_id := v_existing;
  END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'Sale has no lines';
  END IF;

  v_created := COALESCE(p_created_at, v_now);
  v_paid := COALESCE(p_mark_paid, false);
  v_day := COALESCE(
    nullif(trim(p_day_key), ''),
    to_char(timezone('Africa/Addis_Ababa', v_created), 'YYYY-MM-DD')
  );
  v_stamp := to_char(timezone('Africa/Addis_Ababa', v_created), 'YYYYMMDD');

  SELECT
    COALESCE(vat_percent, 15),
    COALESCE(service_percent, 10)
  INTO v_vat, v_svc
  FROM public.org_meta
  WHERE organization_id = p_org_id;
  v_vat := COALESCE(v_vat, 15);
  v_svc := COALESCE(v_svc, 10);

  IF v_order_id IS NULL THEN
    INSERT INTO public.org_meta (organization_id, receipt_seq, seeded)
    VALUES (p_org_id, 1, false)
    ON CONFLICT (organization_id) DO UPDATE
      SET receipt_seq = public.org_meta.receipt_seq + 1
    RETURNING receipt_seq INTO v_seq;

    v_receipt := 'AR-' || v_stamp || '-' || lpad(v_seq::text, 4, '0');

    INSERT INTO public.sale_orders (
      organization_id,
      client_order_id,
      receipt_number,
      subtotal,
      service_charge,
      vat,
      total,
      payment_method,
      payment_reference,
      payment_proof_url,
      cashier_name,
      day_key,
      status,
      payment_status,
      paid_at,
      paid_by,
      place_label,
      kitchen_note,
      vat_percent,
      service_percent,
      source,
      guest_name,
      guest_phone,
      guest_note,
      created_at
    ) VALUES (
      p_org_id,
      v_client,
      v_receipt,
      0, 0, 0, 0,
      COALESCE(nullif(trim(p_payment_method), ''), 'cash'),
      nullif(trim(p_payment_reference), ''),
      nullif(trim(p_payment_proof_url), ''),
      COALESCE(nullif(trim(p_cashier_name), ''), 'Cashier'),
      v_day,
      'placed',
      CASE WHEN v_paid THEN 'paid' ELSE 'unpaid' END,
      CASE WHEN v_paid THEN v_created ELSE NULL END,
      CASE WHEN v_paid THEN COALESCE(nullif(trim(p_cashier_name), ''), 'Cashier') ELSE NULL END,
      nullif(trim(p_place_label), ''),
      nullif(trim(p_kitchen_note), ''),
      v_vat,
      v_svc,
      COALESCE(nullif(trim(p_source), ''), 'pos'),
      nullif(trim(p_guest_name), ''),
      nullif(trim(p_guest_phone), ''),
      nullif(trim(p_guest_note), ''),
      v_created
    )
    RETURNING id INTO v_order_id;
  END IF;

  FOR v_elem IN SELECT value FROM jsonb_array_elements(p_lines)
  LOOP
    v_item := NULLIF(v_elem->>'menu_item_id', '')::uuid;
    v_qty := GREATEST(1, COALESCE((v_elem->>'quantity')::int, 1));
    v_name := COALESCE(nullif(trim(v_elem->>'name'), ''), 'Item');
    v_price := COALESCE((v_elem->>'unit_price')::numeric, 0);

    IF v_item IS NOT NULL THEN
      SELECT name, price INTO v_menu
      FROM public.menu_items
      WHERE id = v_item AND organization_id = p_org_id;
      IF FOUND THEN
        v_name := v_menu.name;
        v_price := v_menu.price;
      ELSE
        v_item := NULL;
      END IF;
    END IF;

    v_line_total := round(v_price * v_qty, 2);
    v_subtotal := v_subtotal + v_line_total;

    INSERT INTO public.sale_order_lines (
      order_id, menu_item_id, name, unit_price, quantity, line_total,
      round, kitchen_status, sent_at
    ) VALUES (
      v_order_id, v_item, v_name, v_price, v_qty, v_line_total,
      1, 'placed', v_created
    );

    IF v_item IS NOT NULL THEN
      UPDATE public.menu_items
      SET vote_count = COALESCE(vote_count, 0) + v_qty,
          updated_at = v_now
      WHERE id = v_item AND organization_id = p_org_id;

      FOR v_recipe IN
        SELECT inventory_item_id, quantity_required
        FROM public.menu_recipes
        WHERE menu_item_id = v_item
      LOOP
        UPDATE public.inventory_items
        SET stock_qty = GREATEST(
              0,
              round((stock_qty - v_recipe.quantity_required * v_qty)::numeric, 3)
            ),
            updated_at = v_now
        WHERE id = v_recipe.inventory_item_id
          AND organization_id = p_org_id;
      END LOOP;
    END IF;
  END LOOP;

  v_service := round(v_subtotal * v_svc / 100.0, 2);
  v_vat_amt := round((v_subtotal + v_service) * v_vat / 100.0, 2);
  v_total := round(v_subtotal + v_service + v_vat_amt, 2);

  UPDATE public.sale_orders
  SET subtotal = v_subtotal,
      service_charge = v_service,
      vat = v_vat_amt,
      total = v_total,
      vat_percent = v_vat,
      service_percent = v_svc
  WHERE id = v_order_id;

  RETURN public.sale_order_json(v_order_id);

EXCEPTION WHEN unique_violation THEN
  SELECT id INTO v_existing
  FROM public.sale_orders
  WHERE organization_id = p_org_id AND client_order_id = v_client
  LIMIT 1;
  IF v_existing IS NULL THEN
    RAISE;
  END IF;
  RETURN public.sale_order_json(v_existing);
END;
$$;

REVOKE ALL ON FUNCTION public.complete_sale(
  UUID, TEXT, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_sale(
  UUID, TEXT, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_sale(
  UUID, TEXT, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT
) TO service_role;

-- Realtime for kitchen / cashier boards
ALTER TABLE public.sale_orders REPLICA IDENTITY FULL;
ALTER TABLE public.sale_order_lines REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'sale_orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sale_orders;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'sale_order_lines'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sale_order_lines;
  END IF;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

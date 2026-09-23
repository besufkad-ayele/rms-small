DROP POLICY IF EXISTS org_meta_all ON public.org_meta;

CREATE POLICY org_meta_select ON public.org_meta FOR SELECT
  USING (public.is_org_member(organization_id) OR public.is_platform_admin());

CREATE POLICY org_meta_insert ON public.org_meta FOR INSERT
  WITH CHECK (public.is_org_member(organization_id) OR public.is_platform_admin());

CREATE POLICY org_meta_update ON public.org_meta FOR UPDATE
  USING (
    public.org_access_ok(organization_id)
    OR public.is_platform_admin()
  );

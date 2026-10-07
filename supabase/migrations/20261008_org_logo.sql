-- Organization logo (public WebP URL) for subscriber branding

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS logo_url TEXT;

INSERT INTO storage.buckets (id, name, public)
VALUES ('org-logos', 'org-logos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS org_logos_read ON storage.objects;
CREATE POLICY org_logos_read ON storage.objects FOR SELECT
  USING (bucket_id = 'org-logos');

DROP POLICY IF EXISTS org_logos_upload ON storage.objects;
CREATE POLICY org_logos_upload ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'org-logos'
    AND auth.uid() IS NOT NULL
    AND (
      public.is_platform_admin()
      OR public.is_org_owner(public.storage_first_folder_org(name))
    )
  );

DROP POLICY IF EXISTS org_logos_update ON storage.objects;
CREATE POLICY org_logos_update ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'org-logos'
    AND (
      public.is_platform_admin()
      OR public.is_org_owner(public.storage_first_folder_org(name))
    )
  );

DROP POLICY IF EXISTS org_logos_delete ON storage.objects;
CREATE POLICY org_logos_delete ON storage.objects FOR DELETE
  USING (
    bucket_id = 'org-logos'
    AND (
      public.is_platform_admin()
      OR public.is_org_owner(public.storage_first_folder_org(name))
    )
  );

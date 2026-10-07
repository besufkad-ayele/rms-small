-- Interest applications: package, logo, full business fields (passwordless signup)

ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS package_code TEXT,
  ADD COLUMN IF NOT EXISTS tin TEXT,
  ADD COLUMN IF NOT EXISTS vat_number TEXT,
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS menu_wanted BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ordering_wanted BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS kitchen_wanted BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS hr_wanted BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS online_wanted BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.applications.package_code IS
  'Requested subscription_packages.code at interest signup';
COMMENT ON COLUMN public.applications.logo_url IS
  'Public URL or storage path for applicant logo (copied to org on approve)';

-- Allow anon/authenticated to read active packages for public interest form
DROP POLICY IF EXISTS packages_select_active ON public.subscription_packages;
CREATE POLICY packages_select_active ON public.subscription_packages
  FOR SELECT TO anon, authenticated
  USING (active = true OR public.is_platform_admin());

-- Application logos under org-logos/applications/{applicationId}/
DROP POLICY IF EXISTS org_logos_applications_upload ON storage.objects;
CREATE POLICY org_logos_applications_upload ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'org-logos'
    AND (storage.foldername(name))[1] = 'applications'
  );

DROP POLICY IF EXISTS org_logos_applications_update ON storage.objects;
CREATE POLICY org_logos_applications_update ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'org-logos'
    AND (storage.foldername(name))[1] = 'applications'
  );

-- Read already covered by org_logos_read (public bucket)

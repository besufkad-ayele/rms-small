-- Public applications (no password / no auth user yet)

CREATE TABLE IF NOT EXISTS public.applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  company_name TEXT,
  org_type TEXT NOT NULL DEFAULT 'cafe'
    CHECK (org_type IN ('cafe', 'restaurant', 'other')),
  website TEXT,
  address TEXT,
  city TEXT,
  region TEXT,
  country TEXT DEFAULT 'Ethiopia',
  notes TEXT,
  inventory_wanted BOOLEAN NOT NULL DEFAULT true,
  finance_wanted BOOLEAN NOT NULL DEFAULT true,
  business_license_url TEXT,
  id_document_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  generated_password TEXT,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS applications_status_idx ON public.applications (status, created_at DESC);
CREATE INDEX IF NOT EXISTS applications_email_idx ON public.applications (email);

ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

-- Public can insert applications (anon + authenticated)
CREATE POLICY applications_insert_public ON public.applications
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- Applicants cannot read others; platform admin reads all
CREATE POLICY applications_select_admin ON public.applications
  FOR SELECT TO authenticated
  USING (public.is_platform_admin());

CREATE POLICY applications_update_admin ON public.applications
  FOR UPDATE TO authenticated
  USING (public.is_platform_admin());

-- Allow public upload to kyc-docs under applications/ folder
CREATE POLICY kyc_docs_upload_applications ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'kyc-docs'
    AND (storage.foldername(name))[1] = 'applications'
  );

-- Platform admin + richer onboarding fields + org verification

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_platform_admin BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email TEXT;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS region TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'Ethiopia',
  ADD COLUMN IF NOT EXISTS business_license_url TEXT,
  ADD COLUMN IF NOT EXISTS id_document_url TEXT,
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS admin_notes TEXT;

-- Sync profile email from auth when missing
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id AND (p.email IS NULL OR p.email = '');

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_platform_admin = true
  );
$$;

-- Platform admins can read all orgs / subs / memberships / proofs / profiles
CREATE POLICY orgs_platform_select ON public.organizations FOR SELECT
  USING (public.is_platform_admin());
CREATE POLICY orgs_platform_update ON public.organizations FOR UPDATE
  USING (public.is_platform_admin());

CREATE POLICY memberships_platform_select ON public.memberships FOR SELECT
  USING (public.is_platform_admin());

CREATE POLICY subscriptions_platform_select ON public.subscriptions FOR SELECT
  USING (public.is_platform_admin());
CREATE POLICY subscriptions_platform_update ON public.subscriptions FOR UPDATE
  USING (public.is_platform_admin());

CREATE POLICY proofs_platform_select ON public.payment_proofs FOR SELECT
  USING (public.is_platform_admin());
CREATE POLICY proofs_platform_update ON public.payment_proofs FOR UPDATE
  USING (public.is_platform_admin());

CREATE POLICY profiles_platform_select ON public.profiles FOR SELECT
  USING (public.is_platform_admin() OR id = auth.uid());

-- Storage for KYC docs
INSERT INTO storage.buckets (id, name, public)
VALUES ('kyc-docs', 'kyc-docs', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY kyc_docs_upload ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'kyc-docs' AND auth.uid() IS NOT NULL);
CREATE POLICY kyc_docs_read_own ON storage.objects FOR SELECT
  USING (
    bucket_id = 'kyc-docs'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR public.is_platform_admin()
    )
  );

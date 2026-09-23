-- Paid bills / expenses for finance module

CREATE TABLE IF NOT EXISTS public.paid_bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid_at DATE NOT NULL DEFAULT (CURRENT_DATE),
  payment_method public.payment_method NOT NULL DEFAULT 'cash',
  reference TEXT,
  note TEXT DEFAULT '',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS paid_bills_org_paid_at_idx
  ON public.paid_bills (organization_id, paid_at DESC, created_at DESC);

ALTER TABLE public.paid_bills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS paid_bills_all ON public.paid_bills;
CREATE POLICY paid_bills_all ON public.paid_bills FOR ALL
  USING (public.org_access_ok(organization_id) OR public.is_platform_admin())
  WITH CHECK (public.org_access_ok(organization_id) OR public.is_platform_admin());

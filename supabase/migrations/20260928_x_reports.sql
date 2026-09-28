-- Mid-shift X-Report cash counts (does not close the day).
CREATE TABLE IF NOT EXISTS public.x_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  day_key TEXT NOT NULL,
  system_total NUMERIC(12,2) NOT NULL,
  cash_at_hand NUMERIC(12,2) NOT NULL,
  variance NUMERIC(12,2) NOT NULL,
  note TEXT DEFAULT '',
  counted_by TEXT NOT NULL,
  counted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS x_reports_org_day_idx
  ON public.x_reports (organization_id, day_key, counted_at DESC);

ALTER TABLE public.x_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS x_reports_all ON public.x_reports;
CREATE POLICY x_reports_all ON public.x_reports FOR ALL
  USING (public.org_access_ok(organization_id))
  WITH CHECK (public.org_access_ok(organization_id));

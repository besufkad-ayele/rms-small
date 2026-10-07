-- Recycle-bin for platform "reset restaurant data".
-- Rows + copied files stay for 3 days, then a platform action purges them.

CREATE TABLE IF NOT EXISTS public.org_data_backups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  categories TEXT[] NOT NULL DEFAULT '{}',
  row_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  purge_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '3 days'),
  restored_at TIMESTAMPTZ,
  purged_at TIMESTAMPTZ,
  restore_note TEXT
);

CREATE INDEX IF NOT EXISTS org_data_backups_org_idx
  ON public.org_data_backups (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS org_data_backups_purge_idx
  ON public.org_data_backups (purge_at)
  WHERE purged_at IS NULL;

ALTER TABLE public.org_data_backups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_data_backups_admin ON public.org_data_backups;
CREATE POLICY org_data_backups_admin ON public.org_data_backups FOR ALL
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

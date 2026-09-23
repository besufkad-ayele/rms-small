CREATE OR REPLACE FUNCTION public.org_access_ok(org UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships m
    JOIN public.subscriptions s ON s.organization_id = m.organization_id
    JOIN public.organizations o ON o.id = m.organization_id
    WHERE m.organization_id = org
      AND m.user_id = auth.uid()
      AND o.verification_status = 'approved'
      AND (
        (s.status = 'trialing' AND s.trial_ends_at > now())
        OR s.status = 'active'
      )
  );
$$;

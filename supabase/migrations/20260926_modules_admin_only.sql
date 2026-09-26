-- Only platform admins may change subscription rows (status, period, modules).
-- Restaurant owners request module changes via payment_proofs; they must not
-- unlock modules by updating subscriptions directly.
DROP POLICY IF EXISTS subscriptions_update ON public.subscriptions;

-- Keep period-end check aligned with app subscriptionIsLive().
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
      AND m.active = true
      AND coalesce(o.verification_status, 'approved') = 'approved'
      AND (
        (s.status = 'trialing' AND s.trial_ends_at > now())
        OR (s.status = 'active' AND (s.current_period_end IS NULL OR s.current_period_end > now()))
      )
  );
$$;

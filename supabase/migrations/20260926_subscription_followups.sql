-- Exact access end dates already use trial_ends_at / current_period_end.
-- Follow-up reminders for platform owner check-ins.

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS follow_up_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS follow_up_note TEXT;

CREATE INDEX IF NOT EXISTS subscriptions_follow_up_at_idx
  ON public.subscriptions (follow_up_at)
  WHERE follow_up_at IS NOT NULL;

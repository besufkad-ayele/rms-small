-- Fix kitchen_enabled backfill: column was added DEFAULT false, so the earlier
-- COALESCE(kitchen_enabled, ordering_enabled) never copied from ordering.
UPDATE public.subscriptions
SET kitchen_enabled = true
WHERE COALESCE(ordering_enabled, false) = true
  AND COALESCE(kitchen_enabled, false) = false;

-- Ensure kitchen permission columns exist (idempotent).
ALTER TABLE public.memberships
  ADD COLUMN IF NOT EXISTS can_kitchen BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_inventory_issue BOOLEAN NOT NULL DEFAULT false;

-- Add waiter role: place + complete orders only (no print/cancel in UI).
ALTER TYPE public.member_role ADD VALUE IF NOT EXISTS 'waiter';

-- Prefer DB role when enum is available (backfill from auth is app-side).
COMMENT ON TYPE public.member_role IS 'owner | manager | cashier | waiter';

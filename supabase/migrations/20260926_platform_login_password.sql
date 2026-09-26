-- Platform-visible owner login password (only set when platform generates/resets it)

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS platform_login_password TEXT;

COMMENT ON COLUMN public.organizations.platform_login_password IS
  'Last password issued by platform admin reset. Null if owner still uses signup password.';

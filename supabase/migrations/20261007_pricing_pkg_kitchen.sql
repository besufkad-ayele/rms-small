-- Intermediate has no kitchen. Full has kitchen and no website (4,500).

UPDATE public.subscription_packages SET
  kitchen_enabled = false,
  max_staff_seats = 4,
  description = 'Menu, Ordering, Inventory and Finance. No kitchen. 4 staff seats included.',
  updated_at = now()
WHERE code = 'intermediate';

UPDATE public.subscription_packages SET
  kitchen_enabled = true,
  online_enabled = false,
  monthly_price_etb = 4500,
  max_staff_seats = 6,
  description = 'All in-house modules including kitchen. No website. 6 staff seats included. Custom of these six is also 4,500; add Website & public ordering separately for 5,500.',
  updated_at = now()
WHERE code = 'full';

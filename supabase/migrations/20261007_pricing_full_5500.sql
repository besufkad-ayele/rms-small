-- Website & public ordering module is +1,000, not +3,000.
-- Six in-house modules = 4,500. All custom including website = 5,500.

UPDATE public.subscription_module_prices SET
  monthly_price_etb = CASE module_code
    WHEN 'menu' THEN 750
    WHEN 'ordering' THEN 850
    WHEN 'kitchen' THEN 650
    WHEN 'inventory' THEN 800
    WHEN 'finance' THEN 800
    WHEN 'hr' THEN 650
    WHEN 'online' THEN 1000
    ELSE monthly_price_etb
  END,
  updated_at = now()
WHERE module_code IN (
  'menu', 'ordering', 'kitchen', 'inventory', 'finance', 'hr', 'online'
);

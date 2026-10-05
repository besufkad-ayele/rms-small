-- Extra sends on the same check. Finance stays one sale_orders row.
-- Kitchen tracks each send (round) on its own.

ALTER TABLE public.sale_order_lines
  ADD COLUMN IF NOT EXISTS round INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS kitchen_status TEXT NOT NULL DEFAULT 'placed',
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE public.sale_order_lines AS l
SET
  sent_at = o.created_at,
  kitchen_status = CASE o.status
    WHEN 'completed' THEN 'served'
    WHEN 'canceled' THEN 'served'
    WHEN 'ready' THEN 'ready'
    WHEN 'preparing' THEN 'preparing'
    ELSE 'placed'
  END
FROM public.sale_orders AS o
WHERE l.order_id = o.id;

CREATE INDEX IF NOT EXISTS sale_order_lines_order_round_idx
  ON public.sale_order_lines (order_id, round);

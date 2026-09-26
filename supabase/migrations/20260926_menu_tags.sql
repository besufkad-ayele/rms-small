-- Menu item tags (starters, traditional, signature, …)

ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS menu_items_tags_gin
  ON public.menu_items USING gin (tags);

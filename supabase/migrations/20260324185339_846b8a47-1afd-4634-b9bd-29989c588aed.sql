
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 0;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS is_featured boolean DEFAULT false;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS is_trending boolean DEFAULT false;

ALTER TABLE public.authors ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 0;
ALTER TABLE public.authors ADD COLUMN IF NOT EXISTS is_trending boolean DEFAULT false;

ALTER TABLE public.narrators ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 0;
ALTER TABLE public.narrators ADD COLUMN IF NOT EXISTS is_trending boolean DEFAULT false;

ALTER TABLE public.publishers ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 0;
ALTER TABLE public.publishers ADD COLUMN IF NOT EXISTS is_featured boolean DEFAULT false;
ALTER TABLE public.publishers ADD COLUMN IF NOT EXISTS is_trending boolean DEFAULT false;

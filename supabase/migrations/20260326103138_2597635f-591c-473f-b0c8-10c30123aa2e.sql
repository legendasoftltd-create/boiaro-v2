ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS name_en text;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS slug text;

UPDATE public.categories SET name_en = name WHERE name_en IS NULL;
UPDATE public.categories SET slug = lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g')) WHERE slug IS NULL;
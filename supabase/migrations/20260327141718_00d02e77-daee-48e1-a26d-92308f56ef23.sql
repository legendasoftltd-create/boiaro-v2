ALTER TABLE public.authors ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.narrators ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.publishers ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.rj_profiles ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.rj_profiles ADD COLUMN IF NOT EXISTS email text;
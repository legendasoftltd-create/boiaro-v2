
-- Add email and status columns to authors, publishers, narrators
ALTER TABLE public.authors ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.authors ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

ALTER TABLE public.publishers ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.publishers ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

ALTER TABLE public.narrators ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.narrators ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

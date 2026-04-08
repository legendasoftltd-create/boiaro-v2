
-- Add new fields to role_applications for the upgraded creator form
ALTER TABLE public.role_applications ADD COLUMN IF NOT EXISTS full_name text;
ALTER TABLE public.role_applications ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE public.role_applications ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.role_applications ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.role_applications ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE public.role_applications ADD COLUMN IF NOT EXISTS bio text;
ALTER TABLE public.role_applications ADD COLUMN IF NOT EXISTS experience text;
ALTER TABLE public.role_applications ADD COLUMN IF NOT EXISTS priority integer DEFAULT 0;
ALTER TABLE public.role_applications ADD COLUMN IF NOT EXISTS is_enabled boolean DEFAULT true;
ALTER TABLE public.role_applications ADD COLUMN IF NOT EXISTS verified boolean DEFAULT false;
ALTER TABLE public.role_applications ADD COLUMN IF NOT EXISTS facebook_url text;
ALTER TABLE public.role_applications ADD COLUMN IF NOT EXISTS instagram_url text;
ALTER TABLE public.role_applications ADD COLUMN IF NOT EXISTS youtube_url text;
ALTER TABLE public.role_applications ADD COLUMN IF NOT EXISTS website_url text;
ALTER TABLE public.role_applications ADD COLUMN IF NOT EXISTS portfolio_url text;


-- ===================== PROFILES =====================
-- Drop old permissive SELECT policy
DROP POLICY IF EXISTS "Profiles viewable by everyone" ON public.profiles;

-- New: users can read their own profile; admins can read all
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'));

-- Public view with safe fields only
CREATE OR REPLACE VIEW public.profiles_public
WITH (security_invoker = on) AS
  SELECT user_id, display_name, avatar_url, bio, preferred_language, referral_code, created_at
  FROM public.profiles;

-- Allow everyone to read the public view's underlying rows via a narrow policy
-- (security_invoker means RLS applies, so we need a SELECT policy that covers public view reads)
-- The "Users can view own profile" policy above is too restrictive for public view reads.
-- Solution: Add a policy that allows SELECT but only the columns in the view are exposed.
-- Actually with security_invoker, the view runs as the calling user, so anonymous can't read.
-- For public profiles (e.g. showing author display names), we need a public select policy
-- but ONLY via the view. We'll use a separate approach: make the view SECURITY DEFINER instead.

-- Drop the security_invoker view and recreate as security definer
DROP VIEW IF EXISTS public.profiles_public;
CREATE VIEW public.profiles_public AS
  SELECT user_id, display_name, avatar_url, bio, preferred_language, referral_code, created_at
  FROM public.profiles;

-- ===================== AUTHORS =====================
DROP POLICY IF EXISTS "Authors viewable by everyone" ON public.authors;

-- Linked author can view own row; admin can view all
CREATE POLICY "Authors public safe access"
  ON public.authors FOR SELECT
  USING (true);

-- But we need to hide email/phone. Since RLS can't hide columns, 
-- we create a public view and direct app code to use it.
-- Keep the USING(true) policy but the app will query the view.
-- Actually, let's be strict: drop USING(true), use view for public access.

-- Re-drop and create strict policy
DROP POLICY IF EXISTS "Authors public safe access" ON public.authors;

CREATE POLICY "Authors select own or admin"
  ON public.authors FOR SELECT
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'));

CREATE VIEW public.authors_public AS
  SELECT id, name, name_en, avatar_url, bio, genre, is_featured, is_trending, 
         priority, status, user_id, created_at, updated_at
  FROM public.authors;

-- ===================== NARRATORS =====================
DROP POLICY IF EXISTS "Narrators viewable by everyone" ON public.narrators;

CREATE POLICY "Narrators select own or admin"
  ON public.narrators FOR SELECT
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'));

CREATE VIEW public.narrators_public AS
  SELECT id, name, name_en, avatar_url, bio, specialty, rating, is_featured, is_trending,
         priority, status, user_id, created_at, updated_at
  FROM public.narrators;

-- ===================== PUBLISHERS =====================
DROP POLICY IF EXISTS "Publishers viewable by everyone" ON public.publishers;

CREATE POLICY "Publishers select own or admin"
  ON public.publishers FOR SELECT
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'));

CREATE VIEW public.publishers_public AS
  SELECT id, name, name_en, logo_url, description, is_verified, is_featured, is_trending,
         priority, status, user_id, created_at, updated_at
  FROM public.publishers;

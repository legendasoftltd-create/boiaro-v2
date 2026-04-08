
-- ===================== AUTHORS =====================
-- Revert to public SELECT (needed for FK joins like books -> authors)
DROP POLICY IF EXISTS "Authors select own or admin" ON public.authors;
CREATE POLICY "Authors viewable by everyone"
  ON public.authors FOR SELECT
  USING (true);

-- Column-level security: hide email and phone from regular users
REVOKE SELECT (email, phone) ON public.authors FROM anon, authenticated;

-- ===================== NARRATORS =====================
DROP POLICY IF EXISTS "Narrators select own or admin" ON public.narrators;
CREATE POLICY "Narrators viewable by everyone"
  ON public.narrators FOR SELECT
  USING (true);

REVOKE SELECT (email, phone) ON public.narrators FROM anon, authenticated;

-- ===================== PUBLISHERS =====================
DROP POLICY IF EXISTS "Publishers select own or admin" ON public.publishers;
CREATE POLICY "Publishers viewable by everyone"
  ON public.publishers FOR SELECT
  USING (true);

REVOKE SELECT (email, phone) ON public.publishers FROM anon, authenticated;

-- ===================== PROFILES =====================
-- Revoke sensitive columns from regular users
REVOKE SELECT (phone, full_name, deleted_at, deleted_reason) ON public.profiles FROM anon, authenticated;

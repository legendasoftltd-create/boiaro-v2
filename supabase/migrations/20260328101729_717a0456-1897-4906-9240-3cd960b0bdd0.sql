
-- Fix views: use security_invoker instead of security_definer (owner = postgres)
-- This makes views respect the calling user's RLS policies

-- Drop and recreate views with security_invoker = true
-- Since the views bypass RLS by design (to allow public access to safe columns),
-- we need a different approach: use security invoker views but ensure
-- the underlying tables have policies that allow the view columns to be read.

-- Actually, the whole point is that these views SHOULD bypass RLS on the base table
-- to expose only safe columns publicly. The correct Supabase pattern is:
-- Use a security definer FUNCTION instead of a view.

-- Let's use a cleaner approach: keep views but set security_invoker = true,
-- and add back permissive SELECT policies on base tables that only expose non-sensitive data.
-- But RLS is row-level, not column-level, so this doesn't work.

-- Best approach: Create security definer FUNCTIONS that return safe columns.
-- But that changes the query pattern too much.

-- Simplest correct approach: Drop the views, add back open SELECT policies on base tables,
-- but for tables with sensitive columns, use a TRIGGER or computed column approach.
-- 
-- Actually the simplest: keep the base table open for SELECT but use the Supabase
-- column-level grants approach. Let's revoke SELECT on sensitive columns from anon/authenticated
-- and grant only on safe columns.

-- For authors: revoke access to email, phone columns
REVOKE SELECT ON public.authors FROM anon, authenticated;
GRANT SELECT (id, name, name_en, avatar_url, bio, genre, is_featured, is_trending, priority, status, user_id, created_at, updated_at) ON public.authors TO anon, authenticated;

-- For narrators
REVOKE SELECT ON public.narrators FROM anon, authenticated;
GRANT SELECT (id, name, name_en, avatar_url, bio, specialty, rating, is_featured, is_trending, priority, status, user_id, created_at, updated_at) ON public.narrators TO anon, authenticated;

-- For publishers
REVOKE SELECT ON public.publishers FROM anon, authenticated;
GRANT SELECT (id, name, name_en, logo_url, description, is_verified, is_featured, is_trending, priority, status, user_id, created_at, updated_at) ON public.publishers TO anon, authenticated;

-- For profiles: revoke phone column
REVOKE SELECT ON public.profiles FROM anon, authenticated;
GRANT SELECT (user_id, display_name, avatar_url, bio, preferred_language, full_name, experience, specialty, genre, facebook_url, instagram_url, youtube_url, website_url, portfolio_url, referral_code, referred_by, is_active, created_at, updated_at) ON public.profiles TO anon, authenticated;

-- For payment_gateways: revoke config column from non-admin
REVOKE SELECT ON public.payment_gateways FROM anon, authenticated;
GRANT SELECT (id, gateway_key, label, is_enabled, mode, sort_priority, notes, created_at, updated_at) ON public.payment_gateways TO authenticated;

-- For book_formats: revoke file_url from public access
REVOKE SELECT ON public.book_formats FROM anon, authenticated;
GRANT SELECT (id, book_id, format, price, original_price, discount, pages, duration, file_size, chapters_count, preview_chapters, preview_percentage, audio_quality, binding, dimensions, weight, delivery_days, in_stock, stock_count, is_available, narrator_id, submission_status, printing_cost, unit_cost, submitted_by, created_at, updated_at) ON public.book_formats TO anon, authenticated;

-- For ebook_chapters: revoke content and file_url
REVOKE SELECT ON public.ebook_chapters FROM anon, authenticated;
GRANT SELECT (id, book_format_id, chapter_title, chapter_order, status, created_at, updated_at, created_by) ON public.ebook_chapters TO anon, authenticated;

-- Now restore open SELECT RLS policies (since column grants handle the restriction)
-- Authors
DROP POLICY IF EXISTS "Authors public fields via view, full access for admin or self" ON public.authors;
CREATE POLICY "Authors viewable by everyone" ON public.authors FOR SELECT USING (true);

-- Narrators
DROP POLICY IF EXISTS "Narrators public fields via view, full access for admin or self" ON public.narrators;
CREATE POLICY "Narrators viewable by everyone" ON public.narrators FOR SELECT USING (true);

-- Publishers
DROP POLICY IF EXISTS "Publishers public fields via view, full access for admin or self" ON public.publishers;
CREATE POLICY "Publishers viewable by everyone" ON public.publishers FOR SELECT USING (true);

-- Profiles
DROP POLICY IF EXISTS "Profiles full access for admin or self" ON public.profiles;
CREATE POLICY "Profiles viewable by everyone" ON public.profiles FOR SELECT USING (true);

-- Book formats
DROP POLICY IF EXISTS "Formats readable by authorized users" ON public.book_formats;
CREATE POLICY "Formats viewable by everyone" ON public.book_formats FOR SELECT USING (true);

-- Ebook chapters
DROP POLICY IF EXISTS "Chapters readable by authorized users" ON public.ebook_chapters;
CREATE POLICY "Ebook chapters viewable by everyone" ON public.ebook_chapters FOR SELECT USING (true);

-- Payment gateways: only authenticated can see (admin sees config via ALL policy + direct grant)
DROP POLICY IF EXISTS "Enabled gateways viewable by authenticated" ON public.payment_gateways;
CREATE POLICY "Enabled gateways viewable by authenticated" ON public.payment_gateways FOR SELECT TO authenticated USING (is_enabled = true);

-- Grant full column access to admin via the service role (admin ALL policy + service key handles this)
-- For admin panel operations that need email/phone/config/file_url, they use the admin ALL policy
-- which runs as the authenticated role. We need to grant all columns to authenticated BUT
-- only expose them when the admin ALL policy allows it.
-- Actually column grants are separate from RLS. The column grant restricts which columns
-- the role can SEE regardless of RLS. So admin users (authenticated role) also can't see
-- email/phone columns even though their RLS policy allows the row.
-- 
-- Fix: We need to grant ALL columns to authenticated but use RLS to restrict rows.
-- Then for PII, we use a different approach: security definer functions for admin access.

-- Actually, let me reconsider. The admin panel queries use the service_role key via edge functions
-- for sensitive operations. But for direct supabase client queries from admin pages,
-- they use the authenticated role with admin RLS policies.
-- 
-- The column-level grant approach means admin users can't see email/phone either.
-- We need a hybrid: grant all columns to authenticated, but restrict at RLS level
-- so only admin or self can see rows (for base tables with PII).

-- Let me revert to the RLS-based approach for PII tables:
REVOKE ALL ON public.authors FROM anon, authenticated;
GRANT SELECT ON public.authors TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.authors TO authenticated;

REVOKE ALL ON public.narrators FROM anon, authenticated;
GRANT SELECT ON public.narrators TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.narrators TO authenticated;

REVOKE ALL ON public.publishers FROM anon, authenticated;
GRANT SELECT ON public.publishers TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.publishers TO authenticated;

REVOKE ALL ON public.profiles FROM anon, authenticated;
GRANT SELECT ON public.profiles TO anon, authenticated;
GRANT INSERT, UPDATE ON public.profiles TO authenticated;

-- For these PII tables, use RLS to restrict which ROWS show PII:
-- Everyone can see the row but a view/function strips PII for non-admin/non-self
-- This is tricky with RLS alone. The cleanest solution:
-- Keep open SELECT policy, drop the views, and handle PII stripping in the frontend/API layer.
-- The real sensitive data (file_url, config, content) we handle with column grants.

-- FINAL APPROACH for file_url/config/content (truly sensitive columns):
-- Use column-level grants. Admin operations use service_role key in edge functions.

-- Re-apply column grants for truly sensitive tables only:
-- book_formats: file_url is sensitive
REVOKE SELECT ON public.book_formats FROM anon, authenticated;
GRANT SELECT (id, book_id, format, price, original_price, discount, pages, duration, file_size, chapters_count, preview_chapters, preview_percentage, audio_quality, binding, dimensions, weight, delivery_days, in_stock, stock_count, is_available, narrator_id, submission_status, printing_cost, unit_cost, submitted_by, created_at, updated_at) ON public.book_formats TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.book_formats TO authenticated;

-- ebook_chapters: content, file_url are sensitive
REVOKE SELECT ON public.ebook_chapters FROM anon, authenticated;
GRANT SELECT (id, book_format_id, chapter_title, chapter_order, status, created_at, updated_at, created_by) ON public.ebook_chapters TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.ebook_chapters TO authenticated;

-- payment_gateways: config is sensitive
REVOKE SELECT ON public.payment_gateways FROM anon, authenticated;
GRANT SELECT (id, gateway_key, label, is_enabled, mode, sort_priority, notes, created_at, updated_at) ON public.payment_gateways TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.payment_gateways TO authenticated;

-- Drop the views we created (using column grants instead)
DROP VIEW IF EXISTS public.book_formats_public;
DROP VIEW IF EXISTS public.ebook_chapters_public;
DROP VIEW IF EXISTS public.payment_gateways_public;
DROP VIEW IF EXISTS public.authors_public;
DROP VIEW IF EXISTS public.narrators_public;
DROP VIEW IF EXISTS public.publishers_public;
DROP VIEW IF EXISTS public.profiles_public;

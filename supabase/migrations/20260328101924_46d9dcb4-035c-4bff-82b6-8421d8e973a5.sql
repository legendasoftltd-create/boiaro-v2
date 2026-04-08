
-- Fix PII column grants for authors, narrators, publishers, profiles
-- First revoke full SELECT, then grant only safe columns

-- Authors
REVOKE SELECT ON public.authors FROM anon, authenticated;
GRANT SELECT (id, name, name_en, avatar_url, bio, genre, is_featured, is_trending, priority, status, user_id, created_at, updated_at) ON public.authors TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.authors TO authenticated;

-- Narrators
REVOKE SELECT ON public.narrators FROM anon, authenticated;
GRANT SELECT (id, name, name_en, avatar_url, bio, specialty, rating, is_featured, is_trending, priority, status, user_id, created_at, updated_at) ON public.narrators TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.narrators TO authenticated;

-- Publishers
REVOKE SELECT ON public.publishers FROM anon, authenticated;
GRANT SELECT (id, name, name_en, logo_url, description, is_verified, is_featured, is_trending, priority, status, user_id, created_at, updated_at) ON public.publishers TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.publishers TO authenticated;

-- Profiles
REVOKE SELECT ON public.profiles FROM anon, authenticated;
GRANT SELECT (user_id, display_name, avatar_url, bio, preferred_language, full_name, experience, specialty, genre, facebook_url, instagram_url, youtube_url, website_url, portfolio_url, referral_code, referred_by, is_active, created_at, updated_at) ON public.profiles TO anon, authenticated;
GRANT INSERT, UPDATE ON public.profiles TO authenticated;

-- Ebook chapters
REVOKE SELECT ON public.ebook_chapters FROM anon, authenticated;
GRANT SELECT (id, book_format_id, chapter_title, chapter_order, status, created_at, updated_at, created_by) ON public.ebook_chapters TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.ebook_chapters TO authenticated;

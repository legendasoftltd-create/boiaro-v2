
-- =====================================================
-- SECURITY HARDENING MIGRATION
-- =====================================================

-- 1. BOOK_FORMATS: Replace open SELECT with restricted access
-- Drop the open "viewable by everyone" policy
DROP POLICY IF EXISTS "Formats viewable by everyone" ON public.book_formats;

-- Create a security definer function to check content access
CREATE OR REPLACE FUNCTION public.user_has_book_access(p_user_id uuid, p_book_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    -- Free book
    SELECT 1 FROM public.books WHERE id = p_book_id AND is_free = true
  ) OR EXISTS (
    -- Content unlock (coin)
    SELECT 1 FROM public.content_unlocks WHERE user_id = p_user_id AND book_id = p_book_id
  ) OR EXISTS (
    -- Completed order
    SELECT 1 FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE oi.book_id = p_book_id AND o.user_id = p_user_id
      AND o.status IN ('completed', 'paid', 'delivered')
  ) OR EXISTS (
    -- Active subscription
    SELECT 1 FROM public.user_subscriptions
    WHERE user_id = p_user_id AND status = 'active'
  ) OR EXISTS (
    -- User purchase
    SELECT 1 FROM public.user_purchases
    WHERE user_id = p_user_id AND book_id = p_book_id AND status = 'completed'
  )
$$;

-- Public view for book_formats: metadata only (NO file_url)
CREATE OR REPLACE VIEW public.book_formats_public AS
SELECT
  id, book_id, format, price, original_price, discount, pages, duration,
  file_size, chapters_count, preview_chapters, preview_percentage,
  audio_quality, binding, dimensions, weight, delivery_days,
  in_stock, stock_count, is_available, narrator_id, submission_status,
  printing_cost, unit_cost, submitted_by, created_at, updated_at
FROM public.book_formats;

-- Grant access to the public view
GRANT SELECT ON public.book_formats_public TO anon, authenticated;

-- New SELECT policy: anyone can read metadata columns, but file_url only for authorized users
-- Since RLS is row-level not column-level, we allow SELECT for everyone but
-- the public view is what the frontend should use for listing.
-- The base table SELECT is restricted to: admin, book owner/creator, or purchased user
CREATE POLICY "Formats readable by authorized users"
ON public.book_formats FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin')
  OR submitted_by = auth.uid()
  OR EXISTS (SELECT 1 FROM public.books WHERE id = book_formats.book_id AND submitted_by = auth.uid())
  OR public.user_has_book_access(auth.uid(), book_id)
);

-- Allow anon to read through the view (they need base table access for the view to work)
-- But we'll use a security definer function instead
-- Actually views with security definer owner bypass RLS, so we set the view owner
ALTER VIEW public.book_formats_public OWNER TO postgres;

-- 2. EBOOK_CHAPTERS: Replace open SELECT with restricted access
DROP POLICY IF EXISTS "Ebook chapters viewable by everyone" ON public.ebook_chapters;

-- Public view for ebook_chapters: metadata only (NO content, NO file_url)
CREATE OR REPLACE VIEW public.ebook_chapters_public AS
SELECT
  id, book_format_id, chapter_title, chapter_order, status, created_at, updated_at, created_by
FROM public.ebook_chapters;

GRANT SELECT ON public.ebook_chapters_public TO anon, authenticated;
ALTER VIEW public.ebook_chapters_public OWNER TO postgres;

-- Restricted SELECT: only admin, chapter creator, or users who purchased the book
CREATE POLICY "Chapters readable by authorized users"
ON public.ebook_chapters FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin')
  OR created_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.book_formats bf
    WHERE bf.id = ebook_chapters.book_format_id
      AND public.user_has_book_access(auth.uid(), bf.book_id)
  )
);

-- 3. PAYMENT_GATEWAYS: Remove config exposure from non-admin SELECT
DROP POLICY IF EXISTS "Enabled gateways viewable by authenticated" ON public.payment_gateways;

-- Public view excluding config/secrets
CREATE OR REPLACE VIEW public.payment_gateways_public AS
SELECT id, gateway_key, label, is_enabled, mode, sort_priority, notes, created_at, updated_at
FROM public.payment_gateways;

GRANT SELECT ON public.payment_gateways_public TO anon, authenticated;
ALTER VIEW public.payment_gateways_public OWNER TO postgres;

-- Only admins can read the base table (which has config)
-- The existing "Admins can manage payment_gateways" ALL policy already covers admin access

-- 4. PII PROTECTION: Create safe public views for authors, narrators, publishers, profiles

-- Authors: public view without email/phone
CREATE OR REPLACE VIEW public.authors_public AS
SELECT id, name, name_en, avatar_url, bio, genre, is_featured, is_trending, priority, status, user_id, created_at, updated_at
FROM public.authors;

GRANT SELECT ON public.authors_public TO anon, authenticated;
ALTER VIEW public.authors_public OWNER TO postgres;

-- Narrators: public view without email/phone
CREATE OR REPLACE VIEW public.narrators_public AS
SELECT id, name, name_en, avatar_url, bio, specialty, rating, is_featured, is_trending, priority, status, user_id, created_at, updated_at
FROM public.narrators;

GRANT SELECT ON public.narrators_public TO anon, authenticated;
ALTER VIEW public.narrators_public OWNER TO postgres;

-- Publishers: public view without email/phone
CREATE OR REPLACE VIEW public.publishers_public AS
SELECT id, name, name_en, logo_url, description, is_verified, is_featured, is_trending, priority, status, user_id, created_at, updated_at
FROM public.publishers;

GRANT SELECT ON public.publishers_public TO anon, authenticated;
ALTER VIEW public.publishers_public OWNER TO postgres;

-- Profiles: public view without phone
CREATE OR REPLACE VIEW public.profiles_public AS
SELECT user_id, display_name, avatar_url, bio, preferred_language, full_name,
       experience, specialty, genre, facebook_url, instagram_url, youtube_url,
       website_url, portfolio_url, referral_code, is_active, created_at, updated_at
FROM public.profiles;

GRANT SELECT ON public.profiles_public TO anon, authenticated;
ALTER VIEW public.profiles_public OWNER TO postgres;

-- Restrict base table SELECT on authors/narrators/publishers to admin or own user
DROP POLICY IF EXISTS "Authors viewable by everyone" ON public.authors;
CREATE POLICY "Authors public fields via view, full access for admin or self"
ON public.authors FOR SELECT
USING (
  has_role(auth.uid(), 'admin')
  OR user_id = auth.uid()
);

DROP POLICY IF EXISTS "Narrators viewable by everyone" ON public.narrators;
CREATE POLICY "Narrators public fields via view, full access for admin or self"
ON public.narrators FOR SELECT
USING (
  has_role(auth.uid(), 'admin')
  OR user_id = auth.uid()
);

DROP POLICY IF EXISTS "Publishers viewable by everyone" ON public.publishers;
CREATE POLICY "Publishers public fields via view, full access for admin or self"
ON public.publishers FOR SELECT
USING (
  has_role(auth.uid(), 'admin')
  OR user_id = auth.uid()
);

-- Profiles: restrict base table to own profile or admin
DROP POLICY IF EXISTS "Profiles viewable by everyone" ON public.profiles;
CREATE POLICY "Profiles full access for admin or self"
ON public.profiles FOR SELECT
USING (
  has_role(auth.uid(), 'admin')
  OR user_id = auth.uid()
);

-- 5. Fix search_path on email queue functions
CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name text, payload jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN pgmq.send(queue_name, payload);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN pgmq.send(queue_name, payload);
END;
$$;

CREATE OR REPLACE FUNCTION public.read_email_batch(queue_name text, batch_size integer, vt integer)
RETURNS TABLE(msg_id bigint, read_ct integer, message jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.message FROM pgmq.read(queue_name, vt, batch_size) r;
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_email(queue_name text, message_id bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN pgmq.delete(queue_name, message_id);
EXCEPTION WHEN undefined_table THEN
  RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE new_id BIGINT;
BEGIN
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  PERFORM pgmq.delete(source_queue, message_id);
  RETURN new_id;
EXCEPTION WHEN undefined_table THEN
  BEGIN
    PERFORM pgmq.create(dlq_name);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  BEGIN
    PERFORM pgmq.delete(source_queue, message_id);
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
  RETURN new_id;
END;
$$;

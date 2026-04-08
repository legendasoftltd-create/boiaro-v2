
-- Create security definer functions for admin to access PII columns
-- These bypass column-level grants since they run as the function owner (postgres)

CREATE OR REPLACE FUNCTION public.admin_get_authors()
RETURNS TABLE (
  id uuid, name text, name_en text, avatar_url text, bio text, genre text,
  is_featured boolean, is_trending boolean, priority integer, status text,
  user_id uuid, email text, phone text, created_at timestamptz, updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  RETURN QUERY SELECT a.id, a.name, a.name_en, a.avatar_url, a.bio, a.genre,
    a.is_featured, a.is_trending, a.priority, a.status, a.user_id, a.email, a.phone,
    a.created_at, a.updated_at FROM public.authors a
    ORDER BY a.priority ASC, a.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_narrators()
RETURNS TABLE (
  id uuid, name text, name_en text, avatar_url text, bio text, specialty text,
  rating numeric, is_featured boolean, is_trending boolean, priority integer, status text,
  user_id uuid, email text, phone text, created_at timestamptz, updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  RETURN QUERY SELECT n.id, n.name, n.name_en, n.avatar_url, n.bio, n.specialty,
    n.rating, n.is_featured, n.is_trending, n.priority, n.status, n.user_id, n.email, n.phone,
    n.created_at, n.updated_at FROM public.narrators n
    ORDER BY n.priority ASC, n.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_publishers()
RETURNS TABLE (
  id uuid, name text, name_en text, logo_url text, description text,
  is_verified boolean, is_featured boolean, is_trending boolean, priority integer, status text,
  user_id uuid, email text, phone text, created_at timestamptz, updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  RETURN QUERY SELECT p.id, p.name, p.name_en, p.logo_url, p.description,
    p.is_verified, p.is_featured, p.is_trending, p.priority, p.status, p.user_id, p.email, p.phone,
    p.created_at, p.updated_at FROM public.publishers p
    ORDER BY p.priority ASC, p.created_at DESC;
END;
$$;

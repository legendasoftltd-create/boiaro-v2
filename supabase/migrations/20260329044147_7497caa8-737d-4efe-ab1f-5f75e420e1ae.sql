CREATE OR REPLACE FUNCTION public.admin_get_all_profiles()
RETURNS TABLE(
  user_id uuid,
  display_name text,
  full_name text,
  avatar_url text,
  phone text,
  bio text,
  created_at timestamptz,
  is_active boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  RETURN QUERY SELECT p.user_id, p.display_name, p.full_name, p.avatar_url,
    p.phone, p.bio, p.created_at, p.is_active
  FROM public.profiles p
  ORDER BY p.created_at DESC;
END;
$$;
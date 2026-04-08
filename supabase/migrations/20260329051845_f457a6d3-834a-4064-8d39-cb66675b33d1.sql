-- SECURITY DEFINER function for admin to update any profile
CREATE OR REPLACE FUNCTION public.admin_update_profile(
  p_user_id uuid,
  p_display_name text DEFAULT NULL,
  p_is_active boolean DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_bio text DEFAULT NULL,
  p_full_name text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  UPDATE public.profiles
  SET
    display_name = COALESCE(p_display_name, display_name),
    is_active = COALESCE(p_is_active, is_active),
    phone = COALESCE(p_phone, phone),
    bio = COALESCE(p_bio, bio),
    full_name = COALESCE(p_full_name, full_name),
    updated_at = now()
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found for user %', p_user_id;
  END IF;

  RETURN json_build_object('success', true, 'user_id', p_user_id);
END;
$$;
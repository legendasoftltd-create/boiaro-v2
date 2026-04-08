CREATE OR REPLACE FUNCTION public.admin_get_user_profile(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_profile json;
  v_email text;
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  SELECT json_build_object(
    'user_id', p.user_id,
    'display_name', p.display_name,
    'full_name', p.full_name,
    'avatar_url', p.avatar_url,
    'phone', p.phone,
    'bio', p.bio,
    'created_at', p.created_at,
    'is_active', p.is_active,
    'deleted_at', p.deleted_at,
    'deleted_reason', p.deleted_reason
  ) INTO v_profile
  FROM public.profiles p
  WHERE p.user_id = p_user_id;

  SELECT au.email INTO v_email
  FROM auth.users au
  WHERE au.id = p_user_id;

  IF v_profile IS NULL THEN
    RETURN json_build_object(
      'user_id', p_user_id,
      'display_name', null,
      'full_name', null,
      'avatar_url', null,
      'phone', null,
      'bio', null,
      'created_at', null,
      'is_active', null,
      'deleted_at', null,
      'deleted_reason', null,
      'email', v_email
    );
  END IF;

  RETURN (v_profile::jsonb || jsonb_build_object('email', v_email))::json;
END;
$function$;
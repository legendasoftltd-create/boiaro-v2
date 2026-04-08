ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL,
ADD COLUMN IF NOT EXISTS deleted_reason TEXT NULL;

DROP FUNCTION IF EXISTS public.admin_get_all_profiles();

CREATE OR REPLACE FUNCTION public.admin_get_all_profiles()
 RETURNS TABLE(user_id uuid, display_name text, full_name text, avatar_url text, phone text, bio text, created_at timestamp with time zone, is_active boolean, deleted_at timestamp with time zone, deleted_reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  RETURN QUERY SELECT p.user_id, p.display_name, p.full_name, p.avatar_url,
    p.phone, p.bio, p.created_at, p.is_active, p.deleted_at, p.deleted_reason
  FROM public.profiles p
  ORDER BY p.created_at DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_soft_delete_user(p_user_id uuid, p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin access required'; END IF;
  UPDATE public.profiles SET deleted_at = now(), deleted_reason = p_reason, is_active = false, updated_at = now() WHERE user_id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_restore_user(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin access required'; END IF;
  UPDATE public.profiles SET deleted_at = NULL, deleted_reason = NULL, is_active = true, updated_at = now() WHERE user_id = p_user_id;
END;
$$;
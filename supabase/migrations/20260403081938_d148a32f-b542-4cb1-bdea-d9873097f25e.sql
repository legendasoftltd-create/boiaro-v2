
-- Profiles RLS (own row or admin) is sufficient protection.
-- Column revoke breaks own-profile reads (AuthContext, profile page).
GRANT SELECT (phone, full_name, deleted_at, deleted_reason) ON public.profiles TO authenticated;

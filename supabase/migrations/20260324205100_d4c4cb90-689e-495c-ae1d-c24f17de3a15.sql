
-- Prevent duplicate applications per user+role
-- First remove any duplicates keeping only the latest
DELETE FROM public.role_applications a
USING public.role_applications b
WHERE a.id < b.id
  AND a.user_id = b.user_id
  AND a.requested_role = b.requested_role;

-- Add unique constraint
ALTER TABLE public.role_applications
ADD CONSTRAINT role_applications_user_role_unique UNIQUE (user_id, requested_role);

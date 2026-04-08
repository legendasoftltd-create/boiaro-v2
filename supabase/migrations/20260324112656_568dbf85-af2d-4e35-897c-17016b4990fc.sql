
-- Add new roles to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'writer';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'publisher';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'narrator';

-- Create role applications table
CREATE TABLE public.role_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  requested_role public.app_role NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  message text,
  admin_notes text,
  reviewed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.role_applications ENABLE ROW LEVEL SECURITY;

-- Users can create their own applications
CREATE POLICY "Users can create role applications"
  ON public.role_applications FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can view their own applications
CREATE POLICY "Users can view own applications"
  ON public.role_applications FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can view all applications
CREATE POLICY "Admins can view all applications"
  ON public.role_applications FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- Admins can update applications
CREATE POLICY "Admins can update applications"
  ON public.role_applications FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

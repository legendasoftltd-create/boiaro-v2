
-- User permission overrides table for per-user format control
CREATE TABLE public.user_permission_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  permission_key text NOT NULL,
  is_allowed boolean NOT NULL DEFAULT true,
  granted_by uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, permission_key)
);

ALTER TABLE public.user_permission_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage overrides" ON public.user_permission_overrides
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view own overrides" ON public.user_permission_overrides
  FOR SELECT USING (auth.uid() = user_id);

CREATE INDEX idx_user_perm_overrides_user ON public.user_permission_overrides(user_id);

-- Add submission_status to book_formats for per-format approval
ALTER TABLE public.book_formats ADD COLUMN IF NOT EXISTS submission_status text NOT NULL DEFAULT 'approved';
ALTER TABLE public.book_formats ADD COLUMN IF NOT EXISTS submitted_by uuid;

CREATE INDEX idx_book_formats_submission ON public.book_formats(submission_status);

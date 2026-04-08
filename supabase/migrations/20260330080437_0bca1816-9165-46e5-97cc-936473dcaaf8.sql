
-- 1. Create role_change_logs table
CREATE TABLE public.role_change_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  action text NOT NULL, -- 'granted', 'revoked', 'updated'
  old_role text,
  new_role text,
  changed_by uuid, -- admin who made the change (from session)
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.role_change_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can read logs
CREATE POLICY "Admins can view role change logs"
  ON public.role_change_logs FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'));

-- System can insert (trigger runs as SECURITY DEFINER)
CREATE POLICY "System can insert role change logs"
  ON public.role_change_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Index for fast lookups
CREATE INDEX idx_role_change_logs_user ON public.role_change_logs (user_id);
CREATE INDEX idx_role_change_logs_created ON public.role_change_logs (created_at DESC);

-- 2. Create trigger function to auto-log role changes
CREATE OR REPLACE FUNCTION public.log_role_change()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.role_change_logs (user_id, action, new_role, changed_by)
    VALUES (NEW.user_id, 'granted', NEW.role::text, auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.role_change_logs (user_id, action, old_role, changed_by)
    VALUES (OLD.user_id, 'revoked', OLD.role::text, auth.uid());
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.role_change_logs (user_id, action, old_role, new_role, changed_by)
    VALUES (NEW.user_id, 'updated', OLD.role::text, NEW.role::text, auth.uid());
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

-- 3. Attach trigger to user_roles table
CREATE TRIGGER trg_log_role_change
  AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION log_role_change();

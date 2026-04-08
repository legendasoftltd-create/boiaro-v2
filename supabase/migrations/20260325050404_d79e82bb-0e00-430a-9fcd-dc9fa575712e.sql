ALTER TABLE public.admin_activity_logs
  ADD COLUMN IF NOT EXISTS action_type text DEFAULT 'update',
  ADD COLUMN IF NOT EXISTS target_type text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS old_value text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS new_value text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'success',
  ADD COLUMN IF NOT EXISTS risk_level text NOT NULL DEFAULT 'low',
  ADD COLUMN IF NOT EXISTS user_agent text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS actor_role text DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON public.admin_activity_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_module ON public.admin_activity_logs (module);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action_type ON public.admin_activity_logs (action_type);
CREATE INDEX IF NOT EXISTS idx_activity_logs_risk ON public.admin_activity_logs (risk_level);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON public.admin_activity_logs (user_id);
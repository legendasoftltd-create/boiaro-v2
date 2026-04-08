
-- Tighten the INSERT policy: only allow system/trigger inserts (no direct user inserts)
DROP POLICY "System can insert role change logs" ON public.role_change_logs;
-- No INSERT policy needed - the SECURITY DEFINER trigger function bypasses RLS

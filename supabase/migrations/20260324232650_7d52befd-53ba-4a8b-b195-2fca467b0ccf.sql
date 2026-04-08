
-- Fix permissive RLS: only admin or service role can insert email logs
DROP POLICY "System can insert email logs" ON public.email_logs;
CREATE POLICY "Admins can insert email logs"
ON public.email_logs FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

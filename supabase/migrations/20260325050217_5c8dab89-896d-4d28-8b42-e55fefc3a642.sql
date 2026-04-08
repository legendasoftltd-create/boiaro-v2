-- Prevent deletion of activity logs (append-only audit trail)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='admin_activity_logs' AND policyname='No delete on activity logs') THEN
    CREATE POLICY "No delete on activity logs" ON public.admin_activity_logs FOR DELETE TO public USING (false);
  END IF;
END $$;
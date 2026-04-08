
-- System Alerts table
CREATE TABLE public.system_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  alert_type TEXT NOT NULL DEFAULT 'system',
  severity TEXT NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  message TEXT,
  metric_value NUMERIC,
  threshold NUMERIC,
  is_resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.system_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all alerts"
  ON public.system_alerts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update alerts"
  ON public.system_alerts FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "System can insert alerts"
  ON public.system_alerts FOR INSERT
  WITH CHECK (true);

CREATE INDEX idx_system_alerts_unresolved ON public.system_alerts (is_resolved, created_at DESC) WHERE NOT is_resolved;
CREATE INDEX idx_system_alerts_type ON public.system_alerts (alert_type, created_at DESC);

-- System Performance Logs table
CREATE TABLE public.system_performance_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  function_name TEXT NOT NULL,
  response_time_ms INTEGER,
  status_code INTEGER,
  error_message TEXT,
  endpoint TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.system_performance_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view performance logs"
  ON public.system_performance_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "System can insert performance logs"
  ON public.system_performance_logs FOR INSERT
  WITH CHECK (true);

CREATE INDEX idx_perf_logs_function ON public.system_performance_logs (function_name, created_at DESC);
CREATE INDEX idx_perf_logs_errors ON public.system_performance_logs (created_at DESC) WHERE status_code >= 400;

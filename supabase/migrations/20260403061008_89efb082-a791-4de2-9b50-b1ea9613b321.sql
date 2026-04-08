
-- R2 rollout daily metrics
CREATE TABLE public.r2_rollout_metrics (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  stat_date date NOT NULL DEFAULT CURRENT_DATE,
  r2_requests integer NOT NULL DEFAULT 0,
  supabase_requests integer NOT NULL DEFAULT 0,
  r2_errors integer NOT NULL DEFAULT 0,
  supabase_errors integer NOT NULL DEFAULT 0,
  r2_signed_url_failures integer NOT NULL DEFAULT 0,
  playback_successes integer NOT NULL DEFAULT 0,
  playback_failures integer NOT NULL DEFAULT 0,
  rollout_percent integer NOT NULL DEFAULT 0,
  auto_adjusted boolean NOT NULL DEFAULT false,
  error_rate_r2 numeric(5,2) NOT NULL DEFAULT 0,
  error_rate_supabase numeric(5,2) NOT NULL DEFAULT 0,
  fallback_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_r2_metrics_date UNIQUE (stat_date)
);

ALTER TABLE public.r2_rollout_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view r2 metrics"
ON public.r2_rollout_metrics FOR SELECT
TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service can insert r2 metrics"
ON public.r2_rollout_metrics FOR INSERT WITH CHECK (true);

CREATE POLICY "Service can update r2 metrics"
ON public.r2_rollout_metrics FOR UPDATE USING (true);

CREATE INDEX idx_r2_metrics_date ON public.r2_rollout_metrics (stat_date DESC);

CREATE TRIGGER update_r2_metrics_updated_at
BEFORE UPDATE ON public.r2_rollout_metrics
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- R2 rollout config (singleton row)
CREATE TABLE public.r2_rollout_config (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  current_percent integer NOT NULL DEFAULT 0,
  auto_scale_enabled boolean NOT NULL DEFAULT false,
  min_percent integer NOT NULL DEFAULT 0,
  max_percent integer NOT NULL DEFAULT 100,
  scale_up_threshold numeric(5,2) NOT NULL DEFAULT 1.0,
  scale_down_threshold numeric(5,2) NOT NULL DEFAULT 3.0,
  step_size integer NOT NULL DEFAULT 10,
  last_adjusted_at timestamptz,
  last_adjustment_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.r2_rollout_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view r2 config"
ON public.r2_rollout_config FOR SELECT
TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update r2 config"
ON public.r2_rollout_config FOR UPDATE
TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service can manage r2 config"
ON public.r2_rollout_config FOR ALL USING (true);

CREATE TRIGGER update_r2_config_updated_at
BEFORE UPDATE ON public.r2_rollout_config
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default config row
INSERT INTO public.r2_rollout_config (id, current_percent, auto_scale_enabled) VALUES (1, 0, false);

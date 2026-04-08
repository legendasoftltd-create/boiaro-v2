
-- Daily bandwidth stats for media delivery monitoring
CREATE TABLE public.daily_bandwidth_stats (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  stat_date date NOT NULL DEFAULT CURRENT_DATE,
  total_bytes_served bigint NOT NULL DEFAULT 0,
  total_requests integer NOT NULL DEFAULT 0,
  avg_session_bytes bigint NOT NULL DEFAULT 0,
  cache_hits integer NOT NULL DEFAULT 0,
  cache_misses integer NOT NULL DEFAULT 0,
  signed_urls_generated integer NOT NULL DEFAULT 0,
  top_books_by_bandwidth jsonb DEFAULT '[]'::jsonb,
  alert_level text NOT NULL DEFAULT 'none',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_bandwidth_stat_date UNIQUE (stat_date),
  CONSTRAINT valid_alert_level CHECK (alert_level IN ('none', 'warn', 'critical'))
);

-- Enable RLS
ALTER TABLE public.daily_bandwidth_stats ENABLE ROW LEVEL SECURITY;

-- Only admins can view
CREATE POLICY "Admins can view bandwidth stats"
ON public.daily_bandwidth_stats FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Service role inserts (edge functions use service key)
CREATE POLICY "Service can insert bandwidth stats"
ON public.daily_bandwidth_stats FOR INSERT
WITH CHECK (true);

CREATE POLICY "Service can update bandwidth stats"
ON public.daily_bandwidth_stats FOR UPDATE
USING (true);

-- Index for date lookups
CREATE INDEX idx_bandwidth_stats_date ON public.daily_bandwidth_stats (stat_date DESC);

-- Timestamp trigger
CREATE TRIGGER update_bandwidth_stats_updated_at
BEFORE UPDATE ON public.daily_bandwidth_stats
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

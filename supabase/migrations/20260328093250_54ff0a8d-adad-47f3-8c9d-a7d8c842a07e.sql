
-- Daily book stats summary table for fast analytics
CREATE TABLE IF NOT EXISTS public.daily_book_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid REFERENCES public.books(id) ON DELETE CASCADE NOT NULL,
  stat_date date NOT NULL DEFAULT CURRENT_DATE,
  views integer NOT NULL DEFAULT 0,
  reads integer NOT NULL DEFAULT 0,
  unique_readers integer NOT NULL DEFAULT 0,
  purchases integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(book_id, stat_date)
);

-- Index for fast lookups
CREATE INDEX idx_daily_book_stats_date ON public.daily_book_stats(stat_date DESC);
CREATE INDEX idx_daily_book_stats_book ON public.daily_book_stats(book_id);

-- Enable RLS
ALTER TABLE public.daily_book_stats ENABLE ROW LEVEL SECURITY;

-- Admin read policy
CREATE POLICY "Admins can read daily_book_stats" ON public.daily_book_stats
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Index on activity logs for trending queries
CREATE INDEX IF NOT EXISTS idx_activity_logs_event_created ON public.user_activity_logs(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_book_created ON public.user_activity_logs(book_id, created_at DESC);

-- Index on admin_activity_logs for pagination  
CREATE INDEX IF NOT EXISTS idx_admin_activity_logs_created ON public.admin_activity_logs(created_at DESC);

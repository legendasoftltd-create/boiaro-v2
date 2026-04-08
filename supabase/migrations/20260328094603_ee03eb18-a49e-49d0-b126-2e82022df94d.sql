
-- Add unique constraint to prevent duplicates
ALTER TABLE public.daily_book_stats
  ADD CONSTRAINT daily_book_stats_book_date_uq UNIQUE (book_id, stat_date);

-- Add index for fast date-range queries
CREATE INDEX IF NOT EXISTS idx_daily_book_stats_date ON public.daily_book_stats (stat_date DESC);

-- Allow service_role to insert/update daily_book_stats
CREATE POLICY "Service role can manage daily_book_stats"
  ON public.daily_book_stats FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

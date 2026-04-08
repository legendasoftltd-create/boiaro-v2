-- Create user_presence table for live activity tracking
CREATE TABLE public.user_presence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  last_seen timestamptz NOT NULL DEFAULT now(),
  current_page text,
  current_book_id uuid REFERENCES public.books(id) ON DELETE SET NULL,
  activity_type text NOT NULL DEFAULT 'browsing',
  session_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Unique constraint: one presence row per user
CREATE UNIQUE INDEX idx_user_presence_user_id ON public.user_presence (user_id);

-- Index for quick "who's online" queries
CREATE INDEX idx_user_presence_last_seen ON public.user_presence (last_seen DESC);
CREATE INDEX idx_user_presence_activity ON public.user_presence (activity_type, last_seen DESC);

-- Enable RLS
ALTER TABLE public.user_presence ENABLE ROW LEVEL SECURITY;

-- Users can upsert their own presence
CREATE POLICY "Users can upsert own presence"
  ON public.user_presence FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Admins can read all presence
CREATE POLICY "Admins can read all presence"
  ON public.user_presence FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Add indexes to user_activity_logs for analytics queries
CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON public.user_activity_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_event_book ON public.user_activity_logs (event_type, book_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON public.user_activity_logs (user_id, created_at DESC);
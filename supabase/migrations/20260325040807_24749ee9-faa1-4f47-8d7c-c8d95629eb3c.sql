
CREATE TABLE public.user_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  event_type text NOT NULL,
  book_id uuid REFERENCES public.books(id) ON DELETE SET NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  session_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_activity_user ON public.user_activity_logs(user_id);
CREATE INDEX idx_activity_event ON public.user_activity_logs(event_type);
CREATE INDEX idx_activity_book ON public.user_activity_logs(book_id);
CREATE INDEX idx_activity_created ON public.user_activity_logs(created_at DESC);

ALTER TABLE public.user_activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own activity" ON public.user_activity_logs
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own activity" ON public.user_activity_logs
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all activity" ON public.user_activity_logs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

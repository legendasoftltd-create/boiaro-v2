
-- Content access tokens for DRM
CREATE TABLE IF NOT EXISTS public.content_access_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  content_type text NOT NULL DEFAULT 'ebook',
  token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.content_access_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tokens" ON public.content_access_tokens
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Service can manage tokens" ON public.content_access_tokens
  FOR ALL TO public USING (auth.role() = 'service_role');

CREATE POLICY "Admins can view all tokens" ON public.content_access_tokens
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'));

CREATE INDEX idx_cat_token ON public.content_access_tokens (token);
CREATE INDEX idx_cat_user_book ON public.content_access_tokens (user_id, book_id);
CREATE INDEX idx_cat_expires ON public.content_access_tokens (expires_at);

-- Content access logs
CREATE TABLE IF NOT EXISTS public.content_access_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  content_type text NOT NULL DEFAULT 'ebook',
  access_granted boolean NOT NULL DEFAULT false,
  denial_reason text,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.content_access_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own access logs" ON public.content_access_logs
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Service can manage access logs" ON public.content_access_logs
  FOR ALL TO public USING (auth.role() = 'service_role');

CREATE POLICY "Admins can view all access logs" ON public.content_access_logs
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can insert own logs" ON public.content_access_logs
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_cal_user ON public.content_access_logs (user_id);
CREATE INDEX idx_cal_book ON public.content_access_logs (book_id);
CREATE INDEX idx_cal_created ON public.content_access_logs (created_at DESC);

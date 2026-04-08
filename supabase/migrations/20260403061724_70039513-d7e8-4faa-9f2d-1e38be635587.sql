-- Add circuit breaker columns to r2_rollout_metrics
ALTER TABLE public.r2_rollout_metrics
ADD COLUMN IF NOT EXISTS circuit_breaker_tripped boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS circuit_breaker_safe_percent integer DEFAULT NULL;

-- Create retry queue table
CREATE TABLE IF NOT EXISTS public.r2_retry_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL DEFAULT 'signed_url',
  book_id uuid REFERENCES public.books(id) ON DELETE CASCADE,
  track_number integer,
  content_type text NOT NULL DEFAULT 'audiobook',
  error_message text,
  attempts integer DEFAULT 0,
  max_attempts integer DEFAULT 3,
  status text DEFAULT 'pending',
  resolved_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.r2_retry_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage retry queue"
ON public.r2_retry_queue
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Service role needs full access for edge functions
CREATE POLICY "Service role full access to retry queue"
ON public.r2_retry_queue
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_r2_retry_queue_status ON public.r2_retry_queue(status);
CREATE INDEX IF NOT EXISTS idx_r2_retry_queue_book ON public.r2_retry_queue(book_id);
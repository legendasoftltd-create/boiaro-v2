
-- System logs table for error/warning/critical events only
CREATE TABLE public.system_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level text NOT NULL DEFAULT 'error' CHECK (level IN ('warning', 'error', 'critical')),
  module text NOT NULL DEFAULT 'general',
  message text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  user_id uuid,
  fingerprint text,
  occurrence_count integer DEFAULT 1,
  first_seen_at timestamptz DEFAULT now(),
  last_seen_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Performance indexes
CREATE INDEX idx_system_logs_level ON public.system_logs (level);
CREATE INDEX idx_system_logs_module ON public.system_logs (module);
CREATE INDEX idx_system_logs_created_at ON public.system_logs (created_at DESC);
CREATE INDEX idx_system_logs_fingerprint ON public.system_logs (fingerprint);

-- Enable RLS
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can read system logs
CREATE POLICY "Admins can read system logs"
  ON public.system_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Authenticated users can insert logs (the edge function / app writes them)
CREATE POLICY "Authenticated users can insert system logs"
  ON public.system_logs FOR INSERT TO authenticated
  WITH CHECK (true);

-- Allow anon inserts for edge function / webhook error logging
CREATE POLICY "Anon can insert system logs"
  ON public.system_logs FOR INSERT TO anon
  WITH CHECK (true);

-- Auto-cleanup function: archive logs older than 90 days
CREATE OR REPLACE FUNCTION public.cleanup_old_system_logs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_deleted integer;
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  DELETE FROM public.system_logs WHERE created_at < now() - interval '90 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- Upsert function for throttling duplicate errors by fingerprint
CREATE OR REPLACE FUNCTION public.upsert_system_log(
  p_level text,
  p_module text,
  p_message text,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_user_id uuid DEFAULT NULL,
  p_fingerprint text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
  v_trimmed_metadata jsonb;
BEGIN
  -- Limit metadata size to 2KB
  v_trimmed_metadata := CASE
    WHEN length(p_metadata::text) > 2048 THEN '{"truncated": true}'::jsonb
    ELSE p_metadata
  END;

  -- If fingerprint provided, try to merge with recent duplicate (last 5 min)
  IF p_fingerprint IS NOT NULL THEN
    UPDATE public.system_logs
    SET occurrence_count = occurrence_count + 1,
        last_seen_at = now(),
        metadata = v_trimmed_metadata
    WHERE fingerprint = p_fingerprint
      AND created_at > now() - interval '5 minutes'
    RETURNING id INTO v_id;

    IF v_id IS NOT NULL THEN
      RETURN v_id;
    END IF;
  END IF;

  INSERT INTO public.system_logs (level, module, message, metadata, user_id, fingerprint)
  VALUES (p_level, p_module, p_message, v_trimmed_metadata, p_user_id, p_fingerprint)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

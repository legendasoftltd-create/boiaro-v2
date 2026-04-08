
-- 1. Voices table
CREATE TABLE public.voices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  language text NOT NULL DEFAULT 'bn-BD',
  provider_voice_id text NOT NULL,
  gender text DEFAULT 'male',
  sample_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.voices ENABLE ROW LEVEL SECURITY;

-- Public read for active voices
CREATE POLICY "Anyone can view active voices"
  ON public.voices FOR SELECT
  USING (is_active = true);

-- Admin full access
CREATE POLICY "Admin full access on voices"
  ON public.voices FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2. TTS Audio table
CREATE TABLE public.tts_audio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id uuid NOT NULL,
  voice_id uuid NOT NULL REFERENCES public.voices(id) ON DELETE CASCADE,
  audio_url text,
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  duration_seconds numeric,
  file_size_bytes bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chapter_id, voice_id)
);

ALTER TABLE public.tts_audio ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read their generated audio
CREATE POLICY "Authenticated users can read tts_audio"
  ON public.tts_audio FOR SELECT
  TO authenticated
  USING (true);

-- Only service role inserts/updates (edge function uses service role)
CREATE POLICY "Admin manage tts_audio"
  ON public.tts_audio FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3. Storage bucket for TTS audio
INSERT INTO storage.buckets (id, name, public)
VALUES ('tts-audio', 'tts-audio', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Public read tts-audio"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'tts-audio');

CREATE POLICY "Service role upload tts-audio"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'tts-audio' AND public.has_role(auth.uid(), 'admin'));

-- Updated_at trigger
CREATE TRIGGER update_voices_updated_at
  BEFORE UPDATE ON public.voices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tts_audio_updated_at
  BEFORE UPDATE ON public.tts_audio
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

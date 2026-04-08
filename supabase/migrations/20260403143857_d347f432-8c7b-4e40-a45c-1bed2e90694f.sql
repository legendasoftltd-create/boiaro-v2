
-- Table for caching paragraph-level TTS audio by text hash
CREATE TABLE public.tts_paragraph_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  text_hash TEXT NOT NULL,
  book_id UUID REFERENCES public.books(id) ON DELETE CASCADE,
  audio_url TEXT,
  file_size_bytes BIGINT,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(text_hash)
);

-- Enable RLS
ALTER TABLE public.tts_paragraph_cache ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read cached audio
CREATE POLICY "Authenticated users can read TTS cache"
ON public.tts_paragraph_cache
FOR SELECT
TO authenticated
USING (true);

-- Index for fast hash lookups
CREATE INDEX idx_tts_paragraph_cache_hash ON public.tts_paragraph_cache (text_hash);
CREATE INDEX idx_tts_paragraph_cache_book ON public.tts_paragraph_cache (book_id);

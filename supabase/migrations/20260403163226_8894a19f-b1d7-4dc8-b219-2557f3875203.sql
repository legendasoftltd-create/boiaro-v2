
-- Drop the old unique constraint on text_hash alone
ALTER TABLE public.tts_paragraph_cache DROP CONSTRAINT IF EXISTS tts_paragraph_cache_text_hash_key;

-- Add a composite cache_key column that combines all generation parameters
ALTER TABLE public.tts_paragraph_cache ADD COLUMN IF NOT EXISTS cache_key TEXT;
ALTER TABLE public.tts_paragraph_cache ADD COLUMN IF NOT EXISTS voice_id TEXT;
ALTER TABLE public.tts_paragraph_cache ADD COLUMN IF NOT EXISTS model_id TEXT;

-- Backfill cache_key for existing rows (text_hash only — marks them as legacy)
UPDATE public.tts_paragraph_cache SET cache_key = text_hash WHERE cache_key IS NULL;

-- Add unique constraint on cache_key
ALTER TABLE public.tts_paragraph_cache ADD CONSTRAINT tts_paragraph_cache_cache_key_key UNIQUE (cache_key);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_tts_paragraph_cache_key ON public.tts_paragraph_cache (cache_key);

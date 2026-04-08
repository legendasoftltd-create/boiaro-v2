ALTER TABLE public.authors ADD COLUMN IF NOT EXISTS linked_at timestamptz;
ALTER TABLE public.publishers ADD COLUMN IF NOT EXISTS linked_at timestamptz;
ALTER TABLE public.narrators ADD COLUMN IF NOT EXISTS linked_at timestamptz;

-- Add user_id to authors, publishers, narrators so we can link creator accounts
ALTER TABLE public.authors ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.publishers ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.narrators ADD COLUMN IF NOT EXISTS user_id uuid;

-- Add unique constraints to prevent duplicate user entries
CREATE UNIQUE INDEX IF NOT EXISTS authors_user_id_unique ON public.authors (user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS publishers_user_id_unique ON public.publishers (user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS narrators_user_id_unique ON public.narrators (user_id) WHERE user_id IS NOT NULL;

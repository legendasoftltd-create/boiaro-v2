-- Prevent one user from being linked to multiple authors (DB-level enforcement)
CREATE UNIQUE INDEX IF NOT EXISTS idx_authors_unique_user_id ON public.authors (user_id) WHERE user_id IS NOT NULL;

-- Same for publishers and narrators
CREATE UNIQUE INDEX IF NOT EXISTS idx_publishers_unique_user_id ON public.publishers (user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_narrators_unique_user_id ON public.narrators (user_id) WHERE user_id IS NOT NULL;
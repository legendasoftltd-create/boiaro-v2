CREATE UNIQUE INDEX IF NOT EXISTS idx_content_unlocks_user_book_format
ON public.content_unlocks (user_id, book_id, format);
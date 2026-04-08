-- Phase 1: Critical indexes for performance

-- book_formats: most queried table, always filtered by book_id + format
CREATE INDEX IF NOT EXISTS idx_book_formats_book_id ON public.book_formats (book_id);
CREATE INDEX IF NOT EXISTS idx_book_formats_book_format ON public.book_formats (book_id, format);

-- content_access_tokens: queried by token+user+book, and needs cleanup by expires_at
CREATE INDEX IF NOT EXISTS idx_content_access_tokens_lookup ON public.content_access_tokens (token, user_id, book_id);
CREATE INDEX IF NOT EXISTS idx_content_access_tokens_expires ON public.content_access_tokens (expires_at) WHERE used = false;

-- content_unlocks: access check queries
CREATE INDEX IF NOT EXISTS idx_content_unlocks_lookup ON public.content_unlocks (user_id, book_id, format);

-- order_items: access check queries
CREATE INDEX IF NOT EXISTS idx_order_items_book_format ON public.order_items (book_id, format);

-- audiobook_tracks: queried by book_format_id + track_number
CREATE INDEX IF NOT EXISTS idx_audiobook_tracks_format_track ON public.audiobook_tracks (book_format_id, track_number);

-- book_comments: queried by book_id, sorted by created_at
CREATE INDEX IF NOT EXISTS idx_book_comments_book_id ON public.book_comments (book_id, created_at DESC);

-- comment_likes: queried by comment_id
CREATE INDEX IF NOT EXISTS idx_comment_likes_comment ON public.comment_likes (comment_id);

-- coin_transactions: queried by user_id
CREATE INDEX IF NOT EXISTS idx_coin_transactions_user ON public.coin_transactions (user_id, created_at DESC);

-- narrators: filtered by status + priority
CREATE INDEX IF NOT EXISTS idx_narrators_status_priority ON public.narrators (status, priority);

-- books: filtered by submission_status, sorted by created_at
CREATE INDEX IF NOT EXISTS idx_books_approved ON public.books (submission_status, created_at DESC);

-- content_access_logs: queried by user_id + book_id
CREATE INDEX IF NOT EXISTS idx_content_access_logs_user_book ON public.content_access_logs (user_id, book_id);
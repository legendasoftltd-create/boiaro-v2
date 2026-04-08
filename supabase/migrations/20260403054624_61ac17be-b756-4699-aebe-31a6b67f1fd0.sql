-- Optimized composite indexes for access checks
-- These cover the exact WHERE clause: (user_id, book_id, format, status='active')

-- content_unlocks: partial index for active unlocks only
CREATE INDEX IF NOT EXISTS idx_content_unlocks_active_access
ON public.content_unlocks (user_id, book_id, format)
WHERE status = 'active';

-- user_purchases: partial index for active purchases only
CREATE INDEX IF NOT EXISTS idx_user_purchases_active_access
ON public.user_purchases (user_id, book_id, format)
WHERE status = 'active';

-- user_subscriptions: index for active subscription lookups
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_active
ON public.user_subscriptions (user_id, status)
WHERE status = 'active';
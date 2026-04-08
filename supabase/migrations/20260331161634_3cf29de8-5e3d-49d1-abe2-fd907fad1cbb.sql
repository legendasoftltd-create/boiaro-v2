
-- SAFE DATA RESET: Delete all transaction/commerce data
-- Preserves: books, users, profiles, creators, book_formats

-- 1. Children of notifications
DELETE FROM public.user_notifications;

-- 2. Children of orders
DELETE FROM public.contributor_earnings;
DELETE FROM public.coupon_usage;
DELETE FROM public.order_status_history;
DELETE FROM public.shipments;
DELETE FROM public.payment_events;
DELETE FROM public.payments;
DELETE FROM public.order_items;

-- 3. Accounting ledger
DELETE FROM public.accounting_ledger;

-- 4. Orders themselves
DELETE FROM public.orders;

-- 5. Independent tables
DELETE FROM public.content_unlocks;
DELETE FROM public.user_purchases;
DELETE FROM public.daily_book_stats;
DELETE FROM public.notifications;

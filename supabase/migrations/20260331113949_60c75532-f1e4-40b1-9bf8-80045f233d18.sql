
-- =============================================
-- FULL TEST DATA CLEANUP MIGRATION
-- Deletes ALL order-related test/demo data
-- Child tables first → parent tables last
-- =============================================

-- 1. User notifications (references notifications)
DELETE FROM public.user_notifications
WHERE notification_id IN (
  SELECT id FROM public.notifications WHERE type = 'order'
);

-- 2. Order-related notifications
DELETE FROM public.notifications WHERE type = 'order';

-- 3. Shipment events (references shipments)
DELETE FROM public.shipment_events;

-- 4. Shipments (references orders)
DELETE FROM public.shipments;

-- 5. Contributor earnings (references orders, order_items)
DELETE FROM public.contributor_earnings;

-- 6. Coupon usage (references orders)
DELETE FROM public.coupon_usage WHERE order_id IS NOT NULL;

-- 7. Order status history (references orders)
DELETE FROM public.order_status_history;

-- 8. Payment events (references orders)
DELETE FROM public.payment_events;

-- 9. Payments (references orders)
DELETE FROM public.payments;

-- 10. Content unlocks (purchase-based only, preserve coin unlocks)
DELETE FROM public.content_unlocks WHERE unlock_method = 'purchase';

-- 11. User purchases
DELETE FROM public.user_purchases;

-- 12. Accounting ledger (order-related entries only)
DELETE FROM public.accounting_ledger WHERE order_id IS NOT NULL OR reference_type IN ('order', 'order_reversal');

-- 13. Order items (references orders)
DELETE FROM public.order_items;

-- 14. Orders (parent table - last)
DELETE FROM public.orders;

-- 15. Reset daily book stats (purchase counts from test orders)
UPDATE public.daily_book_stats SET purchases = 0;


DELETE FROM public.contributor_earnings;
DELETE FROM public.payment_events;
DELETE FROM public.coupon_usage WHERE order_id IS NOT NULL;
DELETE FROM public.accounting_ledger WHERE reference_type IN ('order','withdrawal','fulfillment') OR order_id IS NOT NULL;
DELETE FROM public.order_items;
DELETE FROM public.payments;
DELETE FROM public.orders;

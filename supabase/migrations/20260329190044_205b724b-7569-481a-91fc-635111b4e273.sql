-- Remove duplicate ledger trigger (keep column-specific trg_auto_ledger_order_paid)
DROP TRIGGER IF EXISTS trg_auto_ledger_on_order_paid ON public.orders;

-- Remove duplicate earnings reversal trigger (keep column-specific trg_reverse_earnings_on_cancel)
DROP TRIGGER IF EXISTS trg_reverse_order_earnings ON public.orders;
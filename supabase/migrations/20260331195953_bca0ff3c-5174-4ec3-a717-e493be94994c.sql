
-- Fix: Online hardcopy orders should get status 'paid', not 'confirmed'
-- This ensures they appear in revenue reports (MONEY_RECEIVED_STATUSES includes 'paid')
-- COD logic is NOT touched.

CREATE OR REPLACE FUNCTION public.sync_order_on_payment_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order RECORD;
  v_has_digital boolean;
  v_has_hardcopy boolean;
  v_new_order_status text;
BEGIN
  -- Only fire when status transitions TO 'paid' from something else
  IF NEW.status != 'paid' OR OLD.status = 'paid' THEN
    RETURN NEW;
  END IF;

  -- Get the order
  SELECT id, status, user_id, total_amount, payment_method
  INTO v_order
  FROM public.orders
  WHERE id = NEW.order_id;

  IF v_order IS NULL THEN
    RETURN NEW;
  END IF;

  -- Skip if order already in a terminal paid state (idempotency)
  IF v_order.status IN ('paid', 'completed', 'access_granted', 'delivered') THEN
    RETURN NEW;
  END IF;

  -- DO NOT touch COD orders — they have their own lifecycle
  IF v_order.payment_method = 'cod' THEN
    RETURN NEW;
  END IF;

  -- Determine if order has digital/hardcopy items
  SELECT
    EXISTS(SELECT 1 FROM public.order_items WHERE order_id = NEW.order_id AND format IN ('ebook', 'audiobook')),
    EXISTS(SELECT 1 FROM public.order_items WHERE order_id = NEW.order_id AND format = 'hardcopy')
  INTO v_has_digital, v_has_hardcopy;

  -- Set appropriate order status
  IF v_has_digital AND NOT v_has_hardcopy THEN
    -- Fully digital: grant access immediately
    v_new_order_status := 'access_granted';
  ELSE
    -- Hardcopy or mixed: mark as 'paid' (money received, awaiting fulfillment)
    v_new_order_status := 'paid';
  END IF;

  -- Update order status (triggers auto_ledger_on_order_paid and deduct_stock_on_confirm)
  UPDATE public.orders
  SET status = v_new_order_status
  WHERE id = NEW.order_id
    AND status NOT IN ('paid', 'completed', 'access_granted', 'delivered');

  -- Debug log
  INSERT INTO public.system_logs (level, module, message, fingerprint, metadata)
  VALUES (
    'warning', 'payment_sync',
    'Order synced on payment paid',
    'pay_sync_' || LEFT(NEW.order_id::text, 8),
    jsonb_build_object(
      'order_id', NEW.order_id,
      'payment_id', NEW.id,
      'old_order_status', v_order.status,
      'new_order_status', v_new_order_status,
      'has_digital', v_has_digital,
      'has_hardcopy', v_has_hardcopy,
      'payment_method', v_order.payment_method
    )
  );

  RETURN NEW;
END;
$function$;

-- Backfill: Fix existing online hardcopy orders stuck at 'confirmed' when payment is already 'paid'
-- This updates orders where online payment was received but order status never moved to 'paid'
-- COD orders are explicitly excluded.
UPDATE public.orders o
SET status = 'paid'
WHERE o.status = 'confirmed'
  AND o.payment_method != 'cod'
  AND o.payment_method IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.payments p
    WHERE p.order_id = o.id AND p.status = 'paid'
  );

-- Backfill missing ledger entries for online paid orders that have no income entry
-- Uses ON CONFLICT to prevent duplicates (unique index on order_id + type + category)
INSERT INTO public.accounting_ledger (type, category, description, amount, entry_date, order_id, reference_type, reference_id)
SELECT
  'income', 'book_sale',
  'Order #' || LEFT(o.id::text, 8) || ' payment received (backfill)',
  o.total_amount, CURRENT_DATE, o.id, 'order', o.id
FROM public.orders o
WHERE o.status IN ('paid', 'access_granted', 'completed', 'delivered')
  AND o.payment_method != 'cod'
  AND NOT EXISTS (
    SELECT 1 FROM public.accounting_ledger al
    WHERE al.order_id = o.id AND al.type = 'income' AND al.category = 'book_sale'
  )
ON CONFLICT (order_id, type, category) WHERE order_id IS NOT NULL AND type = 'income' AND category = 'book_sale' AND reference_type = 'order'
DO NOTHING;

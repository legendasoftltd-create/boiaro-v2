
-- Trigger: When payments.status becomes 'paid', sync the order and ensure ledger entry
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

  -- Determine if order has digital/hardcopy items
  SELECT
    EXISTS(SELECT 1 FROM public.order_items WHERE order_id = NEW.order_id AND format IN ('ebook', 'audiobook')),
    EXISTS(SELECT 1 FROM public.order_items WHERE order_id = NEW.order_id AND format = 'hardcopy')
  INTO v_has_digital, v_has_hardcopy;

  -- Set appropriate order status
  IF v_has_digital AND NOT v_has_hardcopy THEN
    v_new_order_status := 'access_granted';
  ELSIF v_order.status = 'pending' THEN
    v_new_order_status := 'confirmed';
  ELSE
    v_new_order_status := 'paid';
  END IF;

  -- Update order status (this will trigger auto_ledger_on_order_paid and deduct_stock_on_confirm)
  UPDATE public.orders
  SET status = v_new_order_status
  WHERE id = NEW.order_id
    AND status NOT IN ('paid', 'completed', 'access_granted', 'delivered');

  RETURN NEW;
END;
$function$;

-- Create trigger on payments table
DROP TRIGGER IF EXISTS trg_sync_order_on_payment_paid ON public.payments;
CREATE TRIGGER trg_sync_order_on_payment_paid
  AFTER UPDATE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_order_on_payment_paid();

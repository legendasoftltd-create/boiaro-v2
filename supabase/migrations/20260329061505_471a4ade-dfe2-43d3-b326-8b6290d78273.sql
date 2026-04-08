
-- Auto-create ledger entries on order payment (confirmed/paid)
CREATE OR REPLACE FUNCTION public.auto_ledger_on_order_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only trigger when status changes to confirmed or paid
  IF NEW.status IN ('confirmed', 'paid') AND OLD.status NOT IN ('confirmed', 'paid', 'completed', 'delivered') THEN
    INSERT INTO public.accounting_ledger (type, category, description, amount, entry_date, order_id, reference_type, reference_id)
    VALUES (
      'income',
      'book_sale',
      'Order #' || LEFT(NEW.id::text, 8) || ' payment received',
      NEW.total_amount,
      CURRENT_DATE,
      NEW.id,
      'order',
      NEW.id::text
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_ledger_order_paid
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_ledger_on_order_paid();

-- Auto-create expense entry on withdrawal approval
CREATE OR REPLACE FUNCTION public.auto_ledger_on_withdrawal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    INSERT INTO public.accounting_ledger (type, category, description, amount, entry_date, reference_type, reference_id)
    VALUES (
      'expense',
      'payout',
      'Creator payout: ' || NEW.payment_method || ' #' || LEFT(NEW.id::text, 8),
      NEW.amount,
      CURRENT_DATE,
      'withdrawal',
      NEW.id::text
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_ledger_withdrawal
  AFTER UPDATE OF status ON public.withdrawal_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_ledger_on_withdrawal();

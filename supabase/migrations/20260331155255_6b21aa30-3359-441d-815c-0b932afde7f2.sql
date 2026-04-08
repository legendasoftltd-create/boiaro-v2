
-- Fix 1: Update auto_ledger_on_order_paid to also fire on 'access_granted' status
CREATE OR REPLACE FUNCTION public.auto_ledger_on_order_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- For COD orders, only record revenue when delivered (payment received)
  IF NEW.payment_method = 'cod' THEN
    IF NEW.status = 'delivered' AND OLD.status != 'delivered' THEN
      INSERT INTO public.accounting_ledger (type, category, description, amount, entry_date, order_id, reference_type, reference_id)
      VALUES (
        'income',
        'book_sale',
        'Order #' || LEFT(NEW.id::text, 8) || ' COD payment received on delivery',
        NEW.total_amount,
        CURRENT_DATE,
        NEW.id,
        'order',
        NEW.id
      );
    END IF;
    RETURN NEW;
  END IF;

  -- For online/demo payments: record when status reaches confirmed, paid, or access_granted
  IF NEW.status IN ('confirmed', 'paid', 'access_granted') AND OLD.status NOT IN ('confirmed', 'paid', 'completed', 'delivered', 'access_granted') THEN
    INSERT INTO public.accounting_ledger (type, category, description, amount, entry_date, order_id, reference_type, reference_id)
    VALUES (
      'income',
      'book_sale',
      'Order #' || LEFT(NEW.id::text, 8) || ' payment received',
      NEW.total_amount,
      CURRENT_DATE,
      NEW.id,
      'order',
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$function$;

-- Fix 2: Re-attach all critical triggers to orders table
DROP TRIGGER IF EXISTS trg_auto_ledger_order_paid ON public.orders;
CREATE TRIGGER trg_auto_ledger_order_paid
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_ledger_on_order_paid();

DROP TRIGGER IF EXISTS trg_deduct_stock_on_confirm ON public.orders;
CREATE TRIGGER trg_deduct_stock_on_confirm
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.deduct_stock_on_confirm();

DROP TRIGGER IF EXISTS trg_reverse_order_earnings ON public.orders;
CREATE TRIGGER trg_reverse_order_earnings
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.reverse_order_earnings();

DROP TRIGGER IF EXISTS trg_revoke_access_on_cancel ON public.orders;
CREATE TRIGGER trg_revoke_access_on_cancel
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.revoke_access_on_cancel();

DROP TRIGGER IF EXISTS trg_generate_order_number ON public.orders;
CREATE TRIGGER trg_generate_order_number
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_order_number();

DROP TRIGGER IF EXISTS trg_sync_cod_payment_on_settle ON public.orders;
CREATE TRIGGER trg_sync_cod_payment_on_settle
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_cod_payment_on_settle();

-- Fix 3: Add admin INSERT policy for payments (admin Mark Paid needs to insert if no payment exists)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'payments' AND policyname = 'Admins can insert payments') THEN
    CREATE POLICY "Admins can insert payments" ON public.payments FOR INSERT TO authenticated
    WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
  END IF;
END $$;

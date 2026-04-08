-- Trigger: when COD order is settled, update payment status to 'paid'
CREATE OR REPLACE FUNCTION public.sync_cod_payment_on_settle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- When cod_payment_status changes to settled_to_merchant, mark payment as paid
  IF NEW.cod_payment_status = 'settled_to_merchant' 
     AND (OLD.cod_payment_status IS DISTINCT FROM 'settled_to_merchant') THEN
    UPDATE public.payments
    SET status = 'paid',
        transaction_id = COALESCE(NEW.cod_settlement_reference, 'COD-SETTLED-' || LEFT(NEW.id::text, 8))
    WHERE order_id = NEW.id AND method = 'cod' AND status != 'paid';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_cod_payment_on_settle ON public.orders;
CREATE TRIGGER trg_sync_cod_payment_on_settle
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_cod_payment_on_settle();

-- Also ensure triggers are attached (re-verify critical triggers)
DROP TRIGGER IF EXISTS trg_handle_new_user ON auth.users;
CREATE TRIGGER trg_handle_new_user
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS trg_generate_order_number ON public.orders;
CREATE TRIGGER trg_generate_order_number
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_order_number();

DROP TRIGGER IF EXISTS trg_auto_ledger_on_order_paid ON public.orders;
CREATE TRIGGER trg_auto_ledger_on_order_paid
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_ledger_on_order_paid();

DROP TRIGGER IF EXISTS trg_reverse_order_earnings ON public.orders;
CREATE TRIGGER trg_reverse_order_earnings
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.reverse_order_earnings();

DROP TRIGGER IF EXISTS trg_auto_ledger_on_withdrawal ON public.withdrawal_requests;
CREATE TRIGGER trg_auto_ledger_on_withdrawal
  AFTER UPDATE ON public.withdrawal_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_ledger_on_withdrawal();
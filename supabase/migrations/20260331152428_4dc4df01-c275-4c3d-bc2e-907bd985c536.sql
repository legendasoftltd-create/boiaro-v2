
-- Re-attach order number trigger
DROP TRIGGER IF EXISTS trg_generate_order_number ON public.orders;
CREATE TRIGGER trg_generate_order_number
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_order_number();

-- Re-attach withdrawal trigger only if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'withdrawal_requests') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_auto_ledger_on_withdrawal ON public.withdrawal_requests';
    EXECUTE 'CREATE TRIGGER trg_auto_ledger_on_withdrawal AFTER UPDATE ON public.withdrawal_requests FOR EACH ROW EXECUTE FUNCTION public.auto_ledger_on_withdrawal()';
  END IF;
END$$;

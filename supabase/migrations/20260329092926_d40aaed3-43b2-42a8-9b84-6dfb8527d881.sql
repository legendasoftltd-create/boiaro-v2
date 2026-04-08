
CREATE OR REPLACE FUNCTION public.auto_ledger_on_order_paid()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
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
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.auto_ledger_on_withdrawal()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$function$;

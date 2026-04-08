-- Step 1: Clean up existing duplicates FIRST
DELETE FROM public.accounting_ledger
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY created_at ASC) as rn
    FROM public.accounting_ledger
    WHERE type = 'income' AND category = 'book_sale' AND order_id IS NOT NULL AND reference_type = 'order'
  ) sub WHERE rn > 1
);

-- Step 2: Now create the unique index
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_income_per_order 
ON public.accounting_ledger (order_id, type, category) 
WHERE order_id IS NOT NULL AND type = 'income' AND category = 'book_sale' AND reference_type = 'order';

-- Step 3: Update the trigger with ON CONFLICT guard
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
        'income', 'book_sale',
        'Order #' || LEFT(NEW.id::text, 8) || ' COD payment received on delivery',
        NEW.total_amount, CURRENT_DATE, NEW.id, 'order', NEW.id
      )
      ON CONFLICT (order_id, type, category) WHERE order_id IS NOT NULL AND type = 'income' AND category = 'book_sale' AND reference_type = 'order'
      DO NOTHING;
    END IF;
    RETURN NEW;
  END IF;

  -- For online/demo payments: record once when status first reaches confirmed/paid/access_granted
  IF NEW.status IN ('confirmed', 'paid', 'access_granted') AND OLD.status NOT IN ('confirmed', 'paid', 'completed', 'delivered', 'access_granted') THEN
    INSERT INTO public.accounting_ledger (type, category, description, amount, entry_date, order_id, reference_type, reference_id)
    VALUES (
      'income', 'book_sale',
      'Order #' || LEFT(NEW.id::text, 8) || ' payment received',
      NEW.total_amount, CURRENT_DATE, NEW.id, 'order', NEW.id
    )
    ON CONFLICT (order_id, type, category) WHERE order_id IS NOT NULL AND type = 'income' AND category = 'book_sale' AND reference_type = 'order'
    DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;
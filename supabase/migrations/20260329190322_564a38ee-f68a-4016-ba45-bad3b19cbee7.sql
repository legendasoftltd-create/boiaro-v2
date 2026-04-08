
-- Replace the existing reverse_order_earnings function with full financial reversal logic
CREATE OR REPLACE FUNCTION public.reverse_order_earnings()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item RECORD;
  v_total_qty integer;
  v_already_reversed boolean;
BEGIN
  -- Only trigger when status changes to cancelled or returned
  IF NEW.status NOT IN ('cancelled', 'returned') OR OLD.status IN ('cancelled', 'returned') THEN
    RETURN NEW;
  END IF;

  -- 1. Reverse contributor earnings (existing logic)
  UPDATE public.contributor_earnings
  SET status = 'reversed'
  WHERE order_id = NEW.id AND status IN ('pending', 'confirmed');

  -- 2. Check if reversal ledger entries already exist (prevent duplicates)
  SELECT EXISTS (
    SELECT 1 FROM public.accounting_ledger
    WHERE reference_id = NEW.id::text
      AND reference_type = 'order_reversal'
  ) INTO v_already_reversed;

  IF v_already_reversed THEN
    RETURN NEW;
  END IF;

  -- 3. Reverse income ledger entry (negative amount for the original book_sale income)
  -- Only reverse if an income entry exists for this order
  IF EXISTS (
    SELECT 1 FROM public.accounting_ledger
    WHERE order_id = NEW.id AND type = 'income' AND category = 'book_sale'
  ) THEN
    INSERT INTO public.accounting_ledger (type, category, description, amount, entry_date, order_id, reference_type, reference_id)
    VALUES (
      'income',
      'book_sale',
      'REVERSED: Order #' || LEFT(NEW.id::text, 8) || ' ' || NEW.status,
      -(NEW.total_amount),
      CURRENT_DATE,
      NEW.id,
      'order_reversal',
      NEW.id::text
    );
  END IF;

  -- 4. Reverse cost_of_goods_sold if order was purchased (order-based model)
  IF NEW.is_purchased = true AND (NEW.purchase_cost_per_unit IS NOT NULL AND NEW.purchase_cost_per_unit > 0) THEN
    SELECT COALESCE(SUM(quantity), 0) INTO v_total_qty
    FROM public.order_items WHERE order_id = NEW.id;

    IF v_total_qty > 0 THEN
      INSERT INTO public.accounting_ledger (type, category, description, amount, entry_date, order_id, reference_type, reference_id)
      VALUES (
        'expense',
        'cost_of_goods_sold',
        'REVERSED: Purchase cost for order #' || LEFT(NEW.id::text, 8) || ' ' || NEW.status,
        -(NEW.purchase_cost_per_unit * v_total_qty),
        CURRENT_DATE,
        NEW.id,
        'order_reversal',
        NEW.id::text || '_cogs'
      );
    END IF;
  END IF;

  -- 5. Restore hardcopy stock
  FOR v_item IN
    SELECT oi.book_id, oi.format, oi.quantity
    FROM public.order_items oi
    WHERE oi.order_id = NEW.id AND oi.format = 'hardcopy'
  LOOP
    UPDATE public.book_formats
    SET stock_count = COALESCE(stock_count, 0) + COALESCE(v_item.quantity, 1)
    WHERE book_id = v_item.book_id AND format = 'hardcopy';
  END LOOP;

  RETURN NEW;
END;
$function$;

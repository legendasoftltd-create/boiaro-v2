
-- 1. Prevent negative stock at DB level
ALTER TABLE public.book_formats ADD CONSTRAINT chk_stock_non_negative CHECK (stock_count >= 0 OR stock_count IS NULL);

-- 2. RPC for atomic stock reservation (used by checkout)
CREATE OR REPLACE FUNCTION public.reserve_stock(p_book_id uuid, p_format text, p_quantity integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_updated integer;
BEGIN
  UPDATE public.book_formats
  SET stock_count = stock_count - p_quantity
  WHERE book_id = p_book_id
    AND format = p_format::book_format_type
    AND COALESCE(stock_count, 0) >= p_quantity;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

-- 3. RPC to check stock availability (read-only, for UI)
CREATE OR REPLACE FUNCTION public.check_stock(p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_item jsonb;
  v_result jsonb := '[]'::jsonb;
  v_stock integer;
  v_available boolean;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT COALESCE(bf.stock_count, 0) INTO v_stock
    FROM public.book_formats bf
    WHERE bf.book_id = (v_item->>'book_id')::uuid
      AND bf.format = (v_item->>'format')::book_format_type
    LIMIT 1;

    v_available := COALESCE(v_stock, 0) >= COALESCE((v_item->>'quantity')::int, 1);

    v_result := v_result || jsonb_build_object(
      'book_id', v_item->>'book_id',
      'format', v_item->>'format',
      'requested', COALESCE((v_item->>'quantity')::int, 1),
      'available', COALESCE(v_stock, 0),
      'in_stock', v_available
    );
  END LOOP;

  RETURN v_result;
END;
$$;

-- 4. Trigger to deduct stock when order status moves to confirmed/processing/shipped/access_granted
CREATE OR REPLACE FUNCTION public.deduct_stock_on_confirm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_item RECORD;
BEGIN
  -- Only fire when status transitions TO a confirmed state FROM a non-confirmed state
  IF NEW.status NOT IN ('confirmed', 'processing', 'access_granted') THEN
    RETURN NEW;
  END IF;
  -- Don't re-deduct if old status was already in a deducted state
  IF OLD.status IN ('confirmed', 'processing', 'ready_for_pickup', 'pickup_received', 'in_transit', 'shipped', 'delivered', 'access_granted') THEN
    RETURN NEW;
  END IF;

  -- Deduct stock for hardcopy items only
  FOR v_item IN
    SELECT oi.book_id, oi.format, COALESCE(oi.quantity, 1) AS qty
    FROM public.order_items oi
    WHERE oi.order_id = NEW.id
      AND oi.format = 'hardcopy'
  LOOP
    UPDATE public.book_formats
    SET stock_count = COALESCE(stock_count, 0) - v_item.qty
    WHERE book_id = v_item.book_id
      AND format = 'hardcopy'
      AND COALESCE(stock_count, 0) >= v_item.qty;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_deduct_stock_on_confirm
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.deduct_stock_on_confirm();

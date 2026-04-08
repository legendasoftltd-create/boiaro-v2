
-- 1. Add order_number column
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_number text;

-- 2. Create unique index
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_order_number ON public.orders (order_number);

-- 3. Create function to generate order number
CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_date text;
  v_serial integer;
  v_order_number text;
BEGIN
  v_date := to_char(NOW() AT TIME ZONE 'Asia/Dhaka', 'YYYYMMDD');
  
  -- Get next serial for today
  SELECT COALESCE(MAX(
    CASE 
      WHEN order_number LIKE 'BOI-' || v_date || '-%' 
      THEN CAST(SUBSTRING(order_number FROM 14) AS integer)
      ELSE 0 
    END
  ), 0) + 1
  INTO v_serial
  FROM public.orders
  WHERE order_number LIKE 'BOI-' || v_date || '-%';
  
  v_order_number := 'BOI-' || v_date || '-' || LPAD(v_serial::text, 4, '0');
  
  NEW.order_number := v_order_number;
  RETURN NEW;
END;
$$;

-- 4. Create trigger for new orders
DROP TRIGGER IF EXISTS trg_generate_order_number ON public.orders;
CREATE TRIGGER trg_generate_order_number
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  WHEN (NEW.order_number IS NULL)
  EXECUTE FUNCTION public.generate_order_number();

-- 5. Backfill existing orders
WITH numbered AS (
  SELECT id, created_at,
    'BOI-' || to_char(created_at AT TIME ZONE 'Asia/Dhaka', 'YYYYMMDD') || '-' || 
    LPAD(ROW_NUMBER() OVER (
      PARTITION BY to_char(created_at AT TIME ZONE 'Asia/Dhaka', 'YYYYMMDD') 
      ORDER BY created_at
    )::text, 4, '0') AS gen_number
  FROM public.orders
  WHERE order_number IS NULL
)
UPDATE public.orders o
SET order_number = n.gen_number
FROM numbered n
WHERE o.id = n.id;

-- 6. Make NOT NULL after backfill
ALTER TABLE public.orders ALTER COLUMN order_number SET NOT NULL;

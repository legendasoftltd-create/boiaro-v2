
-- 1. Add packaging_cost and fulfillment_cost columns to orders table
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS packaging_cost numeric DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS fulfillment_cost numeric DEFAULT 0;

-- 2. Create secure RPC for admin earnings confirmation
CREATE OR REPLACE FUNCTION public.admin_confirm_earnings(p_earning_ids uuid[])
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  UPDATE public.contributor_earnings
  SET status = 'confirmed'
  WHERE id = ANY(p_earning_ids) AND status = 'pending';

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN json_build_object('success', true, 'confirmed_count', v_count);
END;
$$;

-- 3. Create function to reverse earnings on order cancel/return
CREATE OR REPLACE FUNCTION public.reverse_order_earnings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only trigger when status changes to cancelled or returned
  IF NEW.status IN ('cancelled', 'returned') AND OLD.status NOT IN ('cancelled', 'returned') THEN
    UPDATE public.contributor_earnings
    SET status = 'reversed'
    WHERE order_id = NEW.id AND status IN ('pending', 'confirmed');
  END IF;
  RETURN NEW;
END;
$$;

-- 4. Attach the trigger to orders table
CREATE TRIGGER trg_reverse_earnings_on_cancel
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.reverse_order_earnings();

-- 5. Add COD lifecycle columns (cod_payment_status already exists, add settlement tracking)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cod_collected_amount numeric DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cod_settled_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cod_settlement_reference text;

-- 6. Add a default packaging cost setting to site_settings if it exists or create a simple config
-- We'll store packaging_cost_per_order in the orders table directly (already added above)

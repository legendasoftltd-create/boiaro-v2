
-- Create a secure function for adjusting coin balances
-- This runs as SECURITY DEFINER so it bypasses RLS
-- Only authenticated users can call it, and it validates ownership

CREATE OR REPLACE FUNCTION public.adjust_user_coins(
  p_user_id uuid,
  p_amount integer,
  p_type text,
  p_description text DEFAULT NULL,
  p_reference_id text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_admin boolean;
  v_current_balance integer;
  v_new_balance integer;
BEGIN
  -- Must be authenticated
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Check if caller is admin
  v_is_admin := has_role(v_caller, 'admin');

  -- Non-admins can only adjust their own coins for specific types
  IF NOT v_is_admin THEN
    IF p_user_id != v_caller THEN
      RAISE EXCEPTION 'Cannot modify another user''s coins';
    END IF;
    -- Non-admins can only do 'spend' and 'earn' types
    IF p_type NOT IN ('spend', 'earn') THEN
      RAISE EXCEPTION 'Invalid transaction type';
    END IF;
  END IF;

  -- Get current balance
  SELECT balance INTO v_current_balance
  FROM public.user_coins
  WHERE user_id = p_user_id;

  IF v_current_balance IS NULL THEN
    RAISE EXCEPTION 'Wallet not found';
  END IF;

  -- For spend, check sufficient balance
  IF p_amount < 0 AND (v_current_balance + p_amount) < 0 THEN
    RAISE EXCEPTION 'Insufficient coin balance';
  END IF;

  v_new_balance := v_current_balance + p_amount;

  -- Update balance
  UPDATE public.user_coins
  SET 
    balance = v_new_balance,
    total_earned = CASE WHEN p_amount > 0 THEN total_earned + p_amount ELSE total_earned END,
    total_spent = CASE WHEN p_amount < 0 THEN total_spent + ABS(p_amount) ELSE total_spent END,
    updated_at = now()
  WHERE user_id = p_user_id;

  -- Insert transaction record
  INSERT INTO public.coin_transactions (user_id, amount, type, description, reference_id)
  VALUES (p_user_id, p_amount, p_type, p_description, p_reference_id);

  RETURN json_build_object(
    'success', true,
    'new_balance', v_new_balance,
    'amount', p_amount
  );
END;
$$;

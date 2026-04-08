
-- Add expires_at and source to coin_transactions
ALTER TABLE public.coin_transactions 
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS source TEXT NULL DEFAULT 'system';

-- Add daily_reward_last_claimed to profiles for tracking
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS daily_reward_last_claimed DATE NULL;

-- Create index for expiry queries
CREATE INDEX IF NOT EXISTS idx_coin_transactions_expires_at 
  ON public.coin_transactions(expires_at) WHERE expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_coin_transactions_source 
  ON public.coin_transactions(source);

-- RPC: Claim daily login reward (prevents double-claim)
CREATE OR REPLACE FUNCTION public.claim_daily_login_reward()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_today date := CURRENT_DATE;
  v_last_claimed date;
  v_reward_amount integer;
  v_daily_limit integer;
  v_today_earned integer;
  v_expiry_days integer;
  v_expires_at timestamptz;
  v_new_balance integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Get settings
  SELECT COALESCE((SELECT value::int FROM platform_settings WHERE key = 'coin_daily_login_reward'), 5) INTO v_reward_amount;
  SELECT COALESCE((SELECT value::int FROM platform_settings WHERE key = 'coin_daily_limit'), 50) INTO v_daily_limit;
  SELECT COALESCE((SELECT value::int FROM platform_settings WHERE key = 'coin_expiry_days'), 30) INTO v_expiry_days;

  -- Check if already claimed today
  SELECT daily_reward_last_claimed INTO v_last_claimed
  FROM profiles WHERE user_id = v_user_id;

  IF v_last_claimed = v_today THEN
    RETURN json_build_object('success', false, 'reason', 'already_claimed');
  END IF;

  -- Check daily limit
  SELECT COALESCE(SUM(amount), 0) INTO v_today_earned
  FROM coin_transactions
  WHERE user_id = v_user_id AND type = 'earn' AND created_at::date = v_today;

  IF v_today_earned >= v_daily_limit THEN
    RETURN json_build_object('success', false, 'reason', 'daily_limit_reached');
  END IF;

  -- Calculate expiry
  v_expires_at := now() + (v_expiry_days || ' days')::interval;

  -- Update balance
  UPDATE user_coins
  SET balance = balance + v_reward_amount,
      total_earned = total_earned + v_reward_amount,
      updated_at = now()
  WHERE user_id = v_user_id
  RETURNING balance INTO v_new_balance;

  -- Log transaction with expiry and source
  INSERT INTO coin_transactions (user_id, amount, type, description, reference_id, expires_at, source)
  VALUES (v_user_id, v_reward_amount, 'earn', 'Daily login reward', 'daily_' || v_today::text, v_expires_at, 'daily_login');

  -- Mark claimed
  UPDATE profiles SET daily_reward_last_claimed = v_today WHERE user_id = v_user_id;

  RETURN json_build_object('success', true, 'reward', v_reward_amount, 'new_balance', v_new_balance);
END;
$$;

-- RPC: Claim ad reward (with daily limit check)
CREATE OR REPLACE FUNCTION public.claim_ad_reward(p_ad_placement TEXT DEFAULT 'general')
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_reward_amount integer;
  v_daily_limit integer;
  v_today_earned integer;
  v_expiry_days integer;
  v_expires_at timestamptz;
  v_new_balance integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT COALESCE((SELECT value::int FROM platform_settings WHERE key = 'coin_ad_reward'), 5) INTO v_reward_amount;
  SELECT COALESCE((SELECT value::int FROM platform_settings WHERE key = 'coin_daily_limit'), 50) INTO v_daily_limit;
  SELECT COALESCE((SELECT value::int FROM platform_settings WHERE key = 'coin_expiry_days'), 30) INTO v_expiry_days;

  -- Check daily limit
  SELECT COALESCE(SUM(amount), 0) INTO v_today_earned
  FROM coin_transactions
  WHERE user_id = v_user_id AND type = 'earn' AND created_at::date = CURRENT_DATE;

  IF v_today_earned + v_reward_amount > v_daily_limit THEN
    RETURN json_build_object('success', false, 'reason', 'daily_limit_reached');
  END IF;

  v_expires_at := now() + (v_expiry_days || ' days')::interval;

  UPDATE user_coins
  SET balance = balance + v_reward_amount,
      total_earned = total_earned + v_reward_amount,
      updated_at = now()
  WHERE user_id = v_user_id
  RETURNING balance INTO v_new_balance;

  INSERT INTO coin_transactions (user_id, amount, type, description, reference_id, expires_at, source)
  VALUES (v_user_id, v_reward_amount, 'earn', 'Rewarded ad - ' || p_ad_placement, 'ad_' || gen_random_uuid()::text, v_expires_at, 'ad_reward');

  RETURN json_build_object('success', true, 'reward', v_reward_amount, 'new_balance', v_new_balance);
END;
$$;

-- Update handle_new_user to give signup bonus
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_signup_bonus integer;
  v_expiry_days integer;
BEGIN
  INSERT INTO public.profiles (user_id, display_name, referral_code)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email), UPPER(SUBSTR(MD5(NEW.id::text || NOW()::text), 1, 8)));
  
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  
  -- Get signup bonus from settings
  SELECT COALESCE((SELECT value::int FROM platform_settings WHERE key = 'coin_signup_bonus'), 10) INTO v_signup_bonus;
  SELECT COALESCE((SELECT value::int FROM platform_settings WHERE key = 'coin_expiry_days'), 30) INTO v_expiry_days;
  
  INSERT INTO public.user_coins (user_id, balance, total_earned) VALUES (NEW.id, v_signup_bonus, v_signup_bonus);
  
  -- Log the signup bonus transaction
  IF v_signup_bonus > 0 THEN
    INSERT INTO public.coin_transactions (user_id, amount, type, description, source, expires_at)
    VALUES (NEW.id, v_signup_bonus, 'earn', 'Welcome signup bonus', 'signup_bonus', now() + (v_expiry_days || ' days')::interval);
  END IF;
  
  RETURN NEW;
END;
$$;

-- Update adjust_user_coins to support expiry and source
CREATE OR REPLACE FUNCTION public.adjust_user_coins(
  p_user_id uuid, p_amount integer, p_type text, 
  p_description text DEFAULT NULL, p_reference_id text DEFAULT NULL,
  p_source text DEFAULT 'system'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_admin boolean;
  v_current_balance integer;
  v_new_balance integer;
  v_expiry_days integer;
  v_expires_at timestamptz;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_is_admin := has_role(v_caller, 'admin');

  IF NOT v_is_admin THEN
    IF p_user_id != v_caller THEN
      RAISE EXCEPTION 'Cannot modify another user''s coins';
    END IF;
    IF p_type NOT IN ('spend', 'earn') THEN
      RAISE EXCEPTION 'Invalid transaction type';
    END IF;
  END IF;

  SELECT balance INTO v_current_balance FROM public.user_coins WHERE user_id = p_user_id;
  IF v_current_balance IS NULL THEN
    RAISE EXCEPTION 'Wallet not found';
  END IF;

  IF p_amount < 0 AND (v_current_balance + p_amount) < 0 THEN
    RAISE EXCEPTION 'Insufficient coin balance';
  END IF;

  v_new_balance := v_current_balance + p_amount;

  -- Get expiry for earn transactions
  IF p_amount > 0 THEN
    SELECT COALESCE((SELECT value::int FROM platform_settings WHERE key = 'coin_expiry_days'), 30) INTO v_expiry_days;
    v_expires_at := now() + (v_expiry_days || ' days')::interval;
  END IF;

  UPDATE public.user_coins
  SET 
    balance = v_new_balance,
    total_earned = CASE WHEN p_amount > 0 THEN total_earned + p_amount ELSE total_earned END,
    total_spent = CASE WHEN p_amount < 0 THEN total_spent + ABS(p_amount) ELSE total_spent END,
    updated_at = now()
  WHERE user_id = p_user_id;

  INSERT INTO public.coin_transactions (user_id, amount, type, description, reference_id, expires_at, source)
  VALUES (p_user_id, p_amount, p_type, p_description, p_reference_id, v_expires_at, p_source);

  RETURN json_build_object('success', true, 'new_balance', v_new_balance, 'amount', p_amount);
END;
$$;

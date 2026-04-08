
-- 1. Re-attach triggers safely using DROP IF EXISTS + CREATE

-- generate_order_number
DROP TRIGGER IF EXISTS trg_generate_order_number ON public.orders;
CREATE TRIGGER trg_generate_order_number
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.generate_order_number();

-- auto_ledger_on_order_paid
DROP TRIGGER IF EXISTS trg_auto_ledger_on_order_paid ON public.orders;
CREATE TRIGGER trg_auto_ledger_on_order_paid
  AFTER UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.auto_ledger_on_order_paid();

-- reverse_order_earnings
DROP TRIGGER IF EXISTS trg_reverse_order_earnings ON public.orders;
CREATE TRIGGER trg_reverse_order_earnings
  AFTER UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.reverse_order_earnings();

-- auto_ledger_on_withdrawal
DROP TRIGGER IF EXISTS trg_auto_ledger_on_withdrawal ON public.withdrawal_requests;
CREATE TRIGGER trg_auto_ledger_on_withdrawal
  AFTER UPDATE ON public.withdrawal_requests
  FOR EACH ROW EXECUTE FUNCTION public.auto_ledger_on_withdrawal();

-- handle_new_user (already exists, just ensure it's correct)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. content_consumption_time table + RPC
CREATE TABLE IF NOT EXISTS public.content_consumption_time (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  format text NOT NULL,
  duration_seconds integer NOT NULL DEFAULT 0,
  session_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, book_id, format, session_date)
);
ALTER TABLE public.content_consumption_time ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'content_consumption_time' AND policyname = 'Users can read own consumption') THEN
    CREATE POLICY "Users can read own consumption" ON public.content_consumption_time FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'content_consumption_time' AND policyname = 'Users can insert own consumption') THEN
    CREATE POLICY "Users can insert own consumption" ON public.content_consumption_time FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'content_consumption_time' AND policyname = 'Users can update own consumption') THEN
    CREATE POLICY "Users can update own consumption" ON public.content_consumption_time FOR UPDATE TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.log_consumption_time(p_book_id uuid, p_format text, p_seconds integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Auth required'; END IF;
  IF p_seconds <= 0 THEN RETURN; END IF;
  INSERT INTO public.content_consumption_time (user_id, book_id, format, duration_seconds, session_date)
  VALUES (v_user_id, p_book_id, p_format, p_seconds, CURRENT_DATE)
  ON CONFLICT (user_id, book_id, format, session_date)
  DO UPDATE SET duration_seconds = content_consumption_time.duration_seconds + EXCLUDED.duration_seconds, updated_at = now();
END;
$$;

-- 3. check_hybrid_access RPC
CREATE OR REPLACE FUNCTION public.check_hybrid_access(p_user_id uuid, p_book_id uuid, p_format text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE v_is_free boolean; v_sub_access text;
BEGIN
  SELECT is_free INTO v_is_free FROM public.books WHERE id = p_book_id;
  IF v_is_free IS TRUE THEN RETURN json_build_object('granted', true, 'method', 'free'); END IF;

  SELECT sp.access_type INTO v_sub_access
  FROM public.user_subscriptions us JOIN public.subscription_plans sp ON sp.id = us.plan_id
  WHERE us.user_id = p_user_id AND us.status = 'active' LIMIT 1;
  IF v_sub_access IS NOT NULL AND (v_sub_access = 'premium' OR v_sub_access = 'both' OR v_sub_access = p_format) THEN
    RETURN json_build_object('granted', true, 'method', 'subscription');
  END IF;

  IF EXISTS (SELECT 1 FROM public.content_unlocks WHERE user_id = p_user_id AND book_id = p_book_id AND format = p_format) THEN
    RETURN json_build_object('granted', true, 'method', 'coin');
  END IF;

  IF EXISTS (SELECT 1 FROM public.user_purchases WHERE user_id = p_user_id AND book_id = p_book_id AND format = p_format AND status = 'completed') THEN
    RETURN json_build_object('granted', true, 'method', 'purchase');
  END IF;

  IF EXISTS (SELECT 1 FROM public.order_items oi JOIN public.orders o ON o.id = oi.order_id WHERE oi.book_id = p_book_id AND oi.format = p_format AND o.user_id = p_user_id AND o.status IN ('paid','completed','delivered')) THEN
    RETURN json_build_object('granted', true, 'method', 'purchase');
  END IF;

  IF p_format = 'ebook' THEN RETURN json_build_object('granted', true, 'method', 'preview'); END IF;
  RETURN json_build_object('granted', false, 'method', 'none');
END;
$$;

-- 4. Add missing columns
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS coin_price integer DEFAULT 0;
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS is_premium boolean DEFAULT false;
ALTER TABLE public.book_formats ADD COLUMN IF NOT EXISTS coin_price integer DEFAULT 0;

-- 5. Fix accounting_ledger.reference_id to text
ALTER TABLE public.accounting_ledger ALTER COLUMN reference_id TYPE text USING reference_id::text;

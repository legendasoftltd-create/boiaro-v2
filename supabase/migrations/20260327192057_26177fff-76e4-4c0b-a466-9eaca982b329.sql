-- Batch access-check function: replaces 5 sequential queries with 1 call
CREATE OR REPLACE FUNCTION public.check_content_access(
  p_user_id uuid,
  p_book_id uuid,
  p_format text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_is_free boolean;
  v_price numeric;
  v_has_unlock boolean;
  v_has_order boolean;
  v_sub_access text;
BEGIN
  -- 1. Check if book is free
  SELECT is_free INTO v_is_free FROM public.books WHERE id = p_book_id;
  IF v_is_free IS TRUE THEN
    RETURN jsonb_build_object('granted', true, 'reason', 'free_book');
  END IF;

  -- 2. Check format price
  SELECT price INTO v_price FROM public.book_formats
    WHERE book_id = p_book_id AND format = p_format::book_format_type LIMIT 1;
  IF v_price IS NULL OR v_price = 0 THEN
    RETURN jsonb_build_object('granted', true, 'reason', 'free_format');
  END IF;

  -- 3. Check coin unlock
  SELECT EXISTS(
    SELECT 1 FROM public.content_unlocks
    WHERE user_id = p_user_id AND book_id = p_book_id AND format = p_format
  ) INTO v_has_unlock;
  IF v_has_unlock THEN
    RETURN jsonb_build_object('granted', true, 'reason', 'coin_unlock');
  END IF;

  -- 4. Check order purchase
  SELECT EXISTS(
    SELECT 1 FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE oi.book_id = p_book_id AND oi.format = p_format
      AND o.user_id = p_user_id AND o.status = 'completed'
  ) INTO v_has_order;
  IF v_has_order THEN
    RETURN jsonb_build_object('granted', true, 'reason', 'purchased');
  END IF;

  -- 5. Check subscription
  SELECT sp.access_type INTO v_sub_access
  FROM public.user_subscriptions us
  JOIN public.subscription_plans sp ON sp.id = us.plan_id
  WHERE us.user_id = p_user_id AND us.status = 'active'
  LIMIT 1;

  IF v_sub_access IS NOT NULL THEN
    IF v_sub_access = 'premium' THEN
      RETURN jsonb_build_object('granted', true, 'reason', 'subscription');
    END IF;
    IF v_sub_access = p_format THEN
      RETURN jsonb_build_object('granted', true, 'reason', 'subscription');
    END IF;
  END IF;

  -- 6. Ebooks: allow preview access (client enforces paywall)
  IF p_format = 'ebook' THEN
    RETURN jsonb_build_object('granted', true, 'reason', 'preview_allowed');
  END IF;

  RETURN jsonb_build_object('granted', false, 'reason', 'No valid purchase, unlock, or subscription found');
END;
$$;
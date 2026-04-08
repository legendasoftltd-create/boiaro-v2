
-- 1. Add 'status' column to content_unlocks (default 'active', keeps audit trail)
ALTER TABLE public.content_unlocks
ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

-- 2. Create the access revocation function
CREATE OR REPLACE FUNCTION public.revoke_access_on_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_item RECORD;
  v_user_id uuid;
BEGIN
  -- Only trigger when status changes to cancelled or returned or refunded
  IF NEW.status NOT IN ('cancelled', 'returned', 'refunded') OR OLD.status IN ('cancelled', 'returned', 'refunded') THEN
    RETURN NEW;
  END IF;

  -- Get the order's user_id
  v_user_id := NEW.user_id;

  -- Loop through digital order items and revoke access
  FOR v_item IN
    SELECT oi.book_id, oi.format
    FROM public.order_items oi
    WHERE oi.order_id = NEW.id
      AND oi.format IN ('ebook', 'audiobook')
  LOOP
    -- Only revoke if the user does NOT have another valid (non-cancelled/refunded) order for the same book+format
    IF NOT EXISTS (
      SELECT 1
      FROM public.order_items oi2
      JOIN public.orders o2 ON o2.id = oi2.order_id
      WHERE oi2.book_id = v_item.book_id
        AND oi2.format = v_item.format
        AND o2.user_id = v_user_id
        AND o2.id != NEW.id
        AND o2.status NOT IN ('cancelled', 'returned', 'refunded', 'payment_failed')
    ) THEN
      -- Revoke content_unlocks (mark as revoked, not delete)
      UPDATE public.content_unlocks
      SET status = 'revoked'
      WHERE user_id = v_user_id
        AND book_id = v_item.book_id
        AND format = v_item.format
        AND unlock_method = 'purchase'
        AND status = 'active';

      -- Revoke user_purchases
      UPDATE public.user_purchases
      SET status = 'refunded'
      WHERE user_id = v_user_id
        AND book_id = v_item.book_id
        AND format = v_item.format
        AND status = 'completed';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

-- 3. Create the trigger
DROP TRIGGER IF EXISTS trg_revoke_access_on_cancel ON public.orders;
CREATE TRIGGER trg_revoke_access_on_cancel
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.revoke_access_on_cancel();

-- 4. Update check_hybrid_access to exclude revoked records
CREATE OR REPLACE FUNCTION public.check_hybrid_access(p_user_id uuid, p_book_id uuid, p_format text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_is_free boolean; v_sub_access text;
BEGIN
  -- 1. Free book
  SELECT is_free INTO v_is_free FROM public.books WHERE id = p_book_id;
  IF v_is_free IS TRUE THEN RETURN json_build_object('granted', true, 'method', 'free'); END IF;

  -- 2. Active subscription
  SELECT sp.access_type INTO v_sub_access
  FROM public.user_subscriptions us JOIN public.subscription_plans sp ON sp.id = us.plan_id
  WHERE us.user_id = p_user_id AND us.status = 'active' LIMIT 1;
  IF v_sub_access IS NOT NULL AND (v_sub_access = 'premium' OR v_sub_access = 'both' OR v_sub_access = p_format) THEN
    RETURN json_build_object('granted', true, 'method', 'subscription');
  END IF;

  -- 3. Coin unlock (only active, not revoked)
  IF EXISTS (SELECT 1 FROM public.content_unlocks WHERE user_id = p_user_id AND book_id = p_book_id AND format = p_format AND status = 'active') THEN
    RETURN json_build_object('granted', true, 'method', 'coin');
  END IF;

  -- 4. User purchase (only completed, not refunded)
  IF EXISTS (SELECT 1 FROM public.user_purchases WHERE user_id = p_user_id AND book_id = p_book_id AND format = p_format AND status = 'completed') THEN
    RETURN json_build_object('granted', true, 'method', 'purchase');
  END IF;

  -- 5. Order-based access (only non-cancelled/refunded orders)
  IF EXISTS (SELECT 1 FROM public.order_items oi JOIN public.orders o ON o.id = oi.order_id WHERE oi.book_id = p_book_id AND oi.format = p_format AND o.user_id = p_user_id AND o.status IN ('paid','confirmed','access_granted','completed','delivered')) THEN
    RETURN json_build_object('granted', true, 'method', 'purchase');
  END IF;

  -- 6. Ebook preview
  IF p_format = 'ebook' THEN RETURN json_build_object('granted', true, 'method', 'preview'); END IF;
  RETURN json_build_object('granted', false, 'method', 'none');
END;
$$;

-- 5. Also update check_content_access for consistency
CREATE OR REPLACE FUNCTION public.check_content_access(p_user_id uuid, p_book_id uuid, p_format text)
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
  SELECT is_free INTO v_is_free FROM public.books WHERE id = p_book_id;
  IF v_is_free IS TRUE THEN
    RETURN jsonb_build_object('granted', true, 'reason', 'free_book');
  END IF;

  SELECT price INTO v_price FROM public.book_formats
    WHERE book_id = p_book_id AND format = p_format::book_format_type LIMIT 1;
  IF v_price IS NULL OR v_price = 0 THEN
    RETURN jsonb_build_object('granted', true, 'reason', 'free_format');
  END IF;

  -- Only active unlocks
  SELECT EXISTS(
    SELECT 1 FROM public.content_unlocks
    WHERE user_id = p_user_id AND book_id = p_book_id AND format = p_format AND status = 'active'
  ) INTO v_has_unlock;
  IF v_has_unlock THEN
    RETURN jsonb_build_object('granted', true, 'reason', 'coin_unlock');
  END IF;

  -- Only completed purchases
  IF EXISTS (SELECT 1 FROM public.user_purchases WHERE user_id = p_user_id AND book_id = p_book_id AND format = p_format AND status = 'completed') THEN
    RETURN jsonb_build_object('granted', true, 'reason', 'purchased');
  END IF;

  -- Only valid orders
  SELECT EXISTS(
    SELECT 1 FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE oi.book_id = p_book_id AND oi.format = p_format
      AND o.user_id = p_user_id AND o.status IN ('paid','confirmed','access_granted','completed','delivered')
  ) INTO v_has_order;
  IF v_has_order THEN
    RETURN jsonb_build_object('granted', true, 'reason', 'purchased');
  END IF;

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

  IF p_format = 'ebook' THEN
    RETURN jsonb_build_object('granted', true, 'reason', 'preview_allowed');
  END IF;

  RETURN jsonb_build_object('granted', false, 'reason', 'No valid purchase, unlock, or subscription found');
END;
$$;

-- 6. Update user_has_book_access for consistency
CREATE OR REPLACE FUNCTION public.user_has_book_access(p_user_id uuid, p_book_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.books WHERE id = p_book_id AND is_free = true
  ) OR EXISTS (
    SELECT 1 FROM public.content_unlocks WHERE user_id = p_user_id AND book_id = p_book_id AND status = 'active'
  ) OR EXISTS (
    SELECT 1 FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE oi.book_id = p_book_id AND o.user_id = p_user_id
      AND o.status IN ('completed', 'paid', 'confirmed', 'access_granted', 'delivered')
  ) OR EXISTS (
    SELECT 1 FROM public.user_subscriptions
    WHERE user_id = p_user_id AND status = 'active'
  ) OR EXISTS (
    SELECT 1 FROM public.user_purchases
    WHERE user_id = p_user_id AND book_id = p_book_id AND status = 'completed'
  )
$$;

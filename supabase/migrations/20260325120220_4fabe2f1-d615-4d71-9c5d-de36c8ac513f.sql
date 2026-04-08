-- API-style RPC for ratings (one user per book)
CREATE OR REPLACE FUNCTION public.post_rating(p_book_id uuid, p_rating integer)
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_payload json;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Please login to rate or review';
  END IF;

  IF p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'Rating must be between 1 and 5';
  END IF;

  INSERT INTO public.reviews (book_id, user_id, rating, comment)
  VALUES (p_book_id, v_user_id, p_rating, NULL)
  ON CONFLICT (user_id, book_id)
  DO UPDATE SET
    rating = EXCLUDED.rating,
    updated_at = now();

  SELECT public.refresh_book_review_stats(p_book_id) INTO v_payload;
  RETURN v_payload;
END;
$$;

-- API-style RPC for full review submit/update
CREATE OR REPLACE FUNCTION public.post_review(p_book_id uuid, p_rating integer, p_review_text text)
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_payload json;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Please login to rate or review';
  END IF;

  IF p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'Rating must be between 1 and 5';
  END IF;

  IF btrim(COALESCE(p_review_text, '')) = '' THEN
    RAISE EXCEPTION 'Please write a review before submitting';
  END IF;

  INSERT INTO public.reviews (book_id, user_id, rating, comment)
  VALUES (p_book_id, v_user_id, p_rating, btrim(p_review_text))
  ON CONFLICT (user_id, book_id)
  DO UPDATE SET
    rating = EXCLUDED.rating,
    comment = EXCLUDED.comment,
    updated_at = now();

  SELECT public.refresh_book_review_stats(p_book_id) INTO v_payload;
  RETURN v_payload;
END;
$$;

-- API-style RPC for reads increment with dedupe + live total
CREATE OR REPLACE FUNCTION public.post_read_increment(p_book_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_inserted boolean := false;
  v_reads integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Please login to rate or review';
  END IF;

  INSERT INTO public.book_reads (user_id, book_id)
  VALUES (v_user_id, p_book_id)
  ON CONFLICT (user_id, book_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted THEN
    PERFORM public.increment_book_reads(p_book_id);
  END IF;

  SELECT COUNT(*)::int INTO v_reads
  FROM public.book_reads
  WHERE book_id = p_book_id;

  RETURN json_build_object('inserted', v_inserted, 'reads_count', v_reads);
END;
$$;

GRANT EXECUTE ON FUNCTION public.post_rating(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_review(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_read_increment(uuid) TO authenticated;
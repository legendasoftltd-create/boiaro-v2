-- Table to deduplicate reads per user per book
CREATE TABLE IF NOT EXISTS public.book_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, book_id)
);

ALTER TABLE public.book_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view reads" ON public.book_reads FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert own reads" ON public.book_reads FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Function to increment total_reads on books
CREATE OR REPLACE FUNCTION public.increment_book_reads(p_book_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.books SET total_reads = COALESCE(total_reads, 0) + 1 WHERE id = p_book_id;
END;
$$;

-- Function to refresh book rating and reviews_count from reviews table
CREATE OR REPLACE FUNCTION public.refresh_book_review_stats(p_book_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_avg numeric;
  v_count integer;
BEGIN
  SELECT COALESCE(AVG(rating), 0), COUNT(*) INTO v_avg, v_count
  FROM public.reviews WHERE book_id = p_book_id;

  UPDATE public.books
  SET rating = ROUND(v_avg, 1), reviews_count = v_count
  WHERE id = p_book_id;

  RETURN json_build_object('avg_rating', ROUND(v_avg, 1), 'reviews_count', v_count);
END;
$$;
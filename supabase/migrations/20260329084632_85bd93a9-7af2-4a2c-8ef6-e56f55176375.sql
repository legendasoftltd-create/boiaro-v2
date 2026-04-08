
-- 1. Add publisher_id to book_formats (format-level publisher)
ALTER TABLE public.book_formats 
  ADD COLUMN IF NOT EXISTS publisher_id uuid REFERENCES public.publishers(id);

-- 2. Add payout_model to book_formats
ALTER TABLE public.book_formats 
  ADD COLUMN IF NOT EXISTS payout_model text NOT NULL DEFAULT 'revenue_share';

-- 3. Backfill: copy book-level publisher_id into existing formats
UPDATE public.book_formats bf
SET publisher_id = b.publisher_id
FROM public.books b
WHERE bf.book_id = b.id 
  AND b.publisher_id IS NOT NULL 
  AND bf.publisher_id IS NULL;

-- 4. Set payout_model = 'inventory_resale' for existing hardcopy formats
UPDATE public.book_formats
SET payout_model = 'inventory_resale'
WHERE format = 'hardcopy' AND payout_model = 'revenue_share';

-- 5. Add index for lookups
CREATE INDEX IF NOT EXISTS idx_book_formats_publisher_id ON public.book_formats(publisher_id);

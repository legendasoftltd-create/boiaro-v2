-- Create a public view with ONLY safe columns (excludes printing_cost, unit_cost, publisher_commission_percent, weight_kg_per_copy, file_url, submitted_by)
CREATE OR REPLACE VIEW public.book_formats_public
WITH (security_invoker = false)
AS
SELECT
  id,
  book_id,
  format,
  price,
  original_price,
  discount,
  pages,
  duration,
  file_size,
  chapters_count,
  preview_chapters,
  preview_percentage,
  audio_quality,
  binding,
  dimensions,
  weight,
  delivery_days,
  in_stock,
  stock_count,
  is_available,
  narrator_id,
  submission_status,
  created_at,
  updated_at
FROM public.book_formats;

-- Grant SELECT on the view to anon and authenticated
GRANT SELECT ON public.book_formats_public TO anon;
GRANT SELECT ON public.book_formats_public TO authenticated;
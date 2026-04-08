GRANT SELECT ON TABLE public.book_formats TO authenticated;
REVOKE SELECT ON TABLE public.book_formats FROM anon;

DROP POLICY IF EXISTS "Formats viewable by everyone" ON public.book_formats;
CREATE POLICY "Authenticated users can read formats"
ON public.book_formats
FOR SELECT
TO authenticated
USING (true);
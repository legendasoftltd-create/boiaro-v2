
-- Add submission tracking to books
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS submission_status text NOT NULL DEFAULT 'approved';
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS submitted_by uuid;

-- RLS: Allow creators to insert books (as pending)
CREATE POLICY "Writers can insert books"
ON public.books FOR INSERT TO authenticated
WITH CHECK (
  submitted_by = auth.uid() AND
  submission_status = 'pending' AND
  (public.has_role(auth.uid(), 'writer') OR public.has_role(auth.uid(), 'publisher') OR public.has_role(auth.uid(), 'narrator'))
);

-- RLS: Allow creators to update their own pending books
CREATE POLICY "Creators can update own pending books"
ON public.books FOR UPDATE TO authenticated
USING (
  submitted_by = auth.uid() AND
  submission_status IN ('pending', 'draft') AND
  (public.has_role(auth.uid(), 'writer') OR public.has_role(auth.uid(), 'publisher') OR public.has_role(auth.uid(), 'narrator'))
);

-- RLS: Allow creators to insert formats on their own books
CREATE POLICY "Creators can insert formats on own books"
ON public.book_formats FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.books WHERE id = book_id AND submitted_by = auth.uid()
  )
);

-- RLS: Allow creators to update formats on their own books
CREATE POLICY "Creators can update formats on own books"
ON public.book_formats FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.books WHERE id = book_id AND submitted_by = auth.uid()
  )
);

-- RLS: Allow creators to delete formats on their own books
CREATE POLICY "Creators can delete formats on own books"
ON public.book_formats FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.books WHERE id = book_id AND submitted_by = auth.uid()
  )
);

-- RLS: Allow creators to insert tracks on their own audiobook formats
CREATE POLICY "Creators can insert tracks on own formats"
ON public.audiobook_tracks FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.book_formats bf
    JOIN public.books b ON b.id = bf.book_id
    WHERE bf.id = book_format_id AND b.submitted_by = auth.uid()
  )
);

-- RLS: Allow creators to delete tracks on their own formats
CREATE POLICY "Creators can delete tracks on own formats"
ON public.audiobook_tracks FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.book_formats bf
    JOIN public.books b ON b.id = bf.book_id
    WHERE bf.id = book_format_id AND b.submitted_by = auth.uid()
  )
);

-- RLS: Allow creators to manage their own book_contributors
CREATE POLICY "Creators can insert own contributors"
ON public.book_contributors FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.books WHERE id = book_id AND submitted_by = auth.uid()
  )
);

-- Storage: Allow creators to upload to ebooks bucket
CREATE POLICY "Creators can upload ebooks"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'ebooks');

-- Storage: Allow creators to upload to audiobooks bucket
CREATE POLICY "Creators can upload audiobooks"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'audiobooks');

-- Storage: Allow creators to upload book covers
CREATE POLICY "Creators can upload covers"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'book-covers');

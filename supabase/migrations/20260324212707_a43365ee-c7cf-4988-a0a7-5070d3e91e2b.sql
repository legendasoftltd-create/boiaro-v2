DROP POLICY IF EXISTS "Writers can insert books" ON public.books;
CREATE POLICY "Writers can insert books" ON public.books
  FOR INSERT TO authenticated
  WITH CHECK (
    submitted_by = auth.uid()
    AND submission_status IN ('pending', 'draft')
    AND (
      has_role(auth.uid(), 'writer')
      OR has_role(auth.uid(), 'publisher')
      OR has_role(auth.uid(), 'narrator')
    )
  );

DROP POLICY IF EXISTS "Creators can update own pending books" ON public.books;
CREATE POLICY "Creators can update own pending books" ON public.books
  FOR UPDATE TO authenticated
  USING (
    submitted_by = auth.uid()
    AND submission_status IN ('pending', 'draft', 'rejected')
    AND (
      has_role(auth.uid(), 'writer')
      OR has_role(auth.uid(), 'publisher')
      OR has_role(auth.uid(), 'narrator')
    )
  )
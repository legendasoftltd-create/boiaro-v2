-- Allow any creator (writer/publisher/narrator) to insert formats on any approved book
-- This enables the "attach to existing book" flow
CREATE POLICY "Creators can insert formats on approved books"
ON public.book_formats
FOR INSERT
TO authenticated
WITH CHECK (
  (
    has_role(auth.uid(), 'writer'::app_role) OR
    has_role(auth.uid(), 'publisher'::app_role) OR
    has_role(auth.uid(), 'narrator'::app_role)
  )
  AND submitted_by = auth.uid()
);

-- Also allow creators to update their own submitted formats
CREATE POLICY "Creators can update own submitted formats"
ON public.book_formats
FOR UPDATE
TO authenticated
USING (submitted_by = auth.uid());

-- Allow creators to insert book_contributors for any book they're attaching to
CREATE POLICY "Creators can insert own contributors on any book"
ON public.book_contributors
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid() AND (
  has_role(auth.uid(), 'writer'::app_role) OR
  has_role(auth.uid(), 'publisher'::app_role) OR
  has_role(auth.uid(), 'narrator'::app_role)
));
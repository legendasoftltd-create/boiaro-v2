
-- Remove the blanket public SELECT policy
DROP POLICY IF EXISTS "Ebook chapters viewable by everyone" ON public.ebook_chapters;

-- Creators can read their own chapters (for the chapter manager UI)
CREATE POLICY "Creators can view own chapters"
  ON public.ebook_chapters FOR SELECT
  USING (created_by = auth.uid() OR has_role(auth.uid(), 'admin'));

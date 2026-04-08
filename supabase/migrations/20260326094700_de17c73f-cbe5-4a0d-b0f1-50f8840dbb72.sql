
-- Create ebook_chapters table
CREATE TABLE public.ebook_chapters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_format_id UUID NOT NULL REFERENCES public.book_formats(id) ON DELETE CASCADE,
  chapter_title TEXT NOT NULL,
  content TEXT,
  file_url TEXT,
  chapter_order INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add status and created_by to audiobook_tracks
ALTER TABLE public.audiobook_tracks 
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS created_by UUID;

-- RLS for ebook_chapters
ALTER TABLE public.ebook_chapters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ebook chapters viewable by everyone"
  ON public.ebook_chapters FOR SELECT TO public
  USING (true);

CREATE POLICY "Admins can manage ebook_chapters"
  ON public.ebook_chapters FOR ALL TO public
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Creators can insert own chapters"
  ON public.ebook_chapters FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid() AND
    (has_role(auth.uid(), 'writer'::app_role) OR has_role(auth.uid(), 'publisher'::app_role))
  );

CREATE POLICY "Creators can update own draft chapters"
  ON public.ebook_chapters FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid() AND status = 'draft'
  );

CREATE POLICY "Creators can delete own draft chapters"
  ON public.ebook_chapters FOR DELETE TO authenticated
  USING (
    created_by = auth.uid() AND status = 'draft'
  );

-- Add index
CREATE INDEX idx_ebook_chapters_format ON public.ebook_chapters(book_format_id);
CREATE INDEX idx_audiobook_tracks_status ON public.audiobook_tracks(status);

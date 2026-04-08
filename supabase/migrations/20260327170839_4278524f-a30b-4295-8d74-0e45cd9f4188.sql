
-- Add parent_id for reply threading
ALTER TABLE public.book_comments
ADD COLUMN parent_id uuid REFERENCES public.book_comments(id) ON DELETE CASCADE DEFAULT NULL;

CREATE INDEX idx_book_comments_parent_id ON public.book_comments(parent_id);

-- Create comment_likes table
CREATE TABLE public.comment_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES public.book_comments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(comment_id, user_id)
);

CREATE INDEX idx_comment_likes_comment_id ON public.comment_likes(comment_id);
CREATE INDEX idx_comment_likes_user_id ON public.comment_likes(user_id);

ALTER TABLE public.comment_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Likes viewable by everyone"
ON public.comment_likes FOR SELECT TO public
USING (true);

CREATE POLICY "Users can insert own likes"
ON public.comment_likes FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own likes"
ON public.comment_likes FOR DELETE TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage likes"
ON public.comment_likes FOR ALL TO public
USING (has_role(auth.uid(), 'admin'::app_role));

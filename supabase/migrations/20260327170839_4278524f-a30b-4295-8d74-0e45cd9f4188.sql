-- Create book_comments table
CREATE TABLE public.book_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_book_comments_book_id ON public.book_comments(book_id);
CREATE INDEX idx_book_comments_user_id ON public.book_comments(user_id);

ALTER TABLE public.book_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Comments viewable by everyone"
ON public.book_comments FOR SELECT TO public
USING (true);

CREATE POLICY "Users can insert own comments"
ON public.book_comments FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own comments"
ON public.book_comments FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own comments"
ON public.book_comments FOR DELETE TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage comments"
ON public.book_comments FOR ALL TO public
USING (has_role(auth.uid(), 'admin'::app_role));

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
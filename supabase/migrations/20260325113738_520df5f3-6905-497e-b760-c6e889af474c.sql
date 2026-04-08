
-- Create follows table
CREATE TABLE public.follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL,
  profile_type text NOT NULL CHECK (profile_type IN ('author', 'narrator')),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, profile_id, profile_type)
);

-- Enable RLS
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

-- Everyone can read follows (for follower counts)
CREATE POLICY "Follows viewable by everyone" ON public.follows
  FOR SELECT USING (true);

-- Authenticated users can follow
CREATE POLICY "Users can insert own follows" ON public.follows
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can unfollow
CREATE POLICY "Users can delete own follows" ON public.follows
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Admins can manage all follows
CREATE POLICY "Admins can manage follows" ON public.follows
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

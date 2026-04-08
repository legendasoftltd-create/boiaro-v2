-- Monetization: Coin system
CREATE TABLE IF NOT EXISTS public.user_coins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  balance integer NOT NULL DEFAULT 0,
  total_earned integer NOT NULL DEFAULT 0,
  total_spent integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

CREATE TABLE IF NOT EXISTS public.coin_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount integer NOT NULL,
  type text NOT NULL DEFAULT 'purchase',
  description text,
  reference_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.content_unlocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  format text NOT NULL,
  unlock_method text NOT NULL DEFAULT 'coin',
  coins_spent integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, book_id, format)
);

CREATE TABLE IF NOT EXISTS public.revenue_splits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  author_percentage numeric NOT NULL DEFAULT 50,
  narrator_percentage numeric NOT NULL DEFAULT 20,
  platform_percentage numeric NOT NULL DEFAULT 30,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(book_id)
);

ALTER TABLE public.user_coins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coin_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_unlocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revenue_splits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own coins" ON public.user_coins FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage coins" ON public.user_coins FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can insert own coins" ON public.user_coins FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own coins" ON public.user_coins FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own transactions" ON public.coin_transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage transactions" ON public.coin_transactions FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can insert own transactions" ON public.coin_transactions FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own unlocks" ON public.content_unlocks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage unlocks" ON public.content_unlocks FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can insert own unlocks" ON public.content_unlocks FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Revenue splits viewable by admins" ON public.revenue_splits FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Revenue splits viewable by everyone" ON public.revenue_splits FOR SELECT USING (true);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  INSERT INTO public.user_coins (user_id, balance) VALUES (NEW.id, 0);
  RETURN NEW;
END;
$$;
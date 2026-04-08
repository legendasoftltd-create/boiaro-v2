
-- Drop existing revenue_splits table to replace with format-wise system
DROP TABLE IF EXISTS public.revenue_splits;

-- Format-wise revenue splits per book
CREATE TABLE public.format_revenue_splits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  format text NOT NULL CHECK (format IN ('ebook', 'audiobook', 'hardcopy')),
  writer_percentage numeric NOT NULL DEFAULT 40,
  publisher_percentage numeric NOT NULL DEFAULT 20,
  narrator_percentage numeric NOT NULL DEFAULT 10,
  platform_percentage numeric NOT NULL DEFAULT 30,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (book_id, format)
);

-- Default revenue rules by format (admin-configurable)
CREATE TABLE public.default_revenue_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  format text NOT NULL UNIQUE CHECK (format IN ('ebook', 'audiobook', 'hardcopy')),
  writer_percentage numeric NOT NULL DEFAULT 40,
  publisher_percentage numeric NOT NULL DEFAULT 20,
  narrator_percentage numeric NOT NULL DEFAULT 10,
  platform_percentage numeric NOT NULL DEFAULT 30,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Seed default rules
INSERT INTO public.default_revenue_rules (format, writer_percentage, publisher_percentage, narrator_percentage, platform_percentage)
VALUES 
  ('ebook', 50, 15, 5, 30),
  ('audiobook', 30, 10, 30, 30),
  ('hardcopy', 35, 30, 5, 30);

-- Contributor earnings ledger
CREATE TABLE public.contributor_earnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('writer', 'publisher', 'narrator', 'platform')),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  format text NOT NULL,
  sale_amount numeric NOT NULL DEFAULT 0,
  percentage numeric NOT NULL DEFAULT 0,
  earned_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Withdrawal requests
CREATE TABLE public.withdrawal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount numeric NOT NULL,
  method text NOT NULL DEFAULT 'bkash',
  account_info text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'paid')),
  admin_notes text,
  reviewed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS for format_revenue_splits
ALTER TABLE public.format_revenue_splits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage format_revenue_splits" ON public.format_revenue_splits FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Format revenue splits viewable by everyone" ON public.format_revenue_splits FOR SELECT USING (true);

-- RLS for default_revenue_rules
ALTER TABLE public.default_revenue_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage default_revenue_rules" ON public.default_revenue_rules FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Default revenue rules viewable by everyone" ON public.default_revenue_rules FOR SELECT USING (true);

-- RLS for contributor_earnings
ALTER TABLE public.contributor_earnings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage earnings" ON public.contributor_earnings FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can view own earnings" ON public.contributor_earnings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "System can insert earnings" ON public.contributor_earnings FOR INSERT WITH CHECK (true);

-- RLS for withdrawal_requests
ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage withdrawals" ON public.withdrawal_requests FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can view own withdrawals" ON public.withdrawal_requests FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create withdrawal requests" ON public.withdrawal_requests FOR INSERT WITH CHECK (auth.uid() = user_id);

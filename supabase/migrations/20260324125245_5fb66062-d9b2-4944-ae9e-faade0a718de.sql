
-- Add fulfillment_cost_percentage to revenue tables
ALTER TABLE public.default_revenue_rules ADD COLUMN IF NOT EXISTS fulfillment_cost_percentage numeric NOT NULL DEFAULT 0;
ALTER TABLE public.format_revenue_splits ADD COLUMN IF NOT EXISTS fulfillment_cost_percentage numeric NOT NULL DEFAULT 0;

-- Update default revenue rules with exact business percentages
UPDATE public.default_revenue_rules SET 
  writer_percentage = 35, publisher_percentage = 30, narrator_percentage = 0, 
  platform_percentage = 35, fulfillment_cost_percentage = 0
WHERE format = 'ebook';

UPDATE public.default_revenue_rules SET 
  writer_percentage = 25, publisher_percentage = 15, narrator_percentage = 25, 
  platform_percentage = 35, fulfillment_cost_percentage = 0
WHERE format = 'audiobook';

UPDATE public.default_revenue_rules SET 
  writer_percentage = 20, publisher_percentage = 35, narrator_percentage = 0, 
  platform_percentage = 20, fulfillment_cost_percentage = 25
WHERE format = 'hardcopy';

-- Add fulfillment_cost_percentage to contributor_earnings
ALTER TABLE public.contributor_earnings ADD COLUMN IF NOT EXISTS fulfillment_amount numeric NOT NULL DEFAULT 0;

-- Book contributors table (links users to books by role and format)
CREATE TABLE IF NOT EXISTS public.book_contributors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('writer', 'publisher', 'narrator')),
  format text CHECK (format IN ('ebook', 'audiobook', 'hardcopy')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (book_id, user_id, role, format)
);

ALTER TABLE public.book_contributors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage book_contributors" ON public.book_contributors FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Book contributors viewable by everyone" ON public.book_contributors FOR SELECT USING (true);

-- Add minimum_withdrawal_amount to a platform_settings table
CREATE TABLE IF NOT EXISTS public.platform_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.platform_settings (key, value) VALUES ('minimum_withdrawal_amount', '500') ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage platform_settings" ON public.platform_settings FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Platform settings viewable by everyone" ON public.platform_settings FOR SELECT USING (true);

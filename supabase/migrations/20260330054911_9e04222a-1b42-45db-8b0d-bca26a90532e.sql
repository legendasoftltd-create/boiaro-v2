
-- Coin packages table (admin-managed)
CREATE TABLE public.coin_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  coins integer NOT NULL,
  price numeric NOT NULL,
  bonus_coins integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  is_featured boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.coin_packages ENABLE ROW LEVEL SECURITY;

-- Anyone can read active packages
CREATE POLICY "Anyone can read active coin packages"
  ON public.coin_packages FOR SELECT
  USING (is_active = true);

-- Admin full access
CREATE POLICY "Admins can manage coin packages"
  ON public.coin_packages FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Coin purchases tracking table
CREATE TABLE public.coin_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  package_id uuid REFERENCES public.coin_packages(id),
  coins_amount integer NOT NULL,
  price numeric NOT NULL,
  payment_method text NOT NULL DEFAULT 'sslcommerz',
  payment_status text NOT NULL DEFAULT 'pending',
  transaction_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.coin_purchases ENABLE ROW LEVEL SECURITY;

-- Users can read their own purchases
CREATE POLICY "Users can read own coin purchases"
  ON public.coin_purchases FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Service role inserts (edge function)
CREATE POLICY "Service can insert coin purchases"
  ON public.coin_purchases FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Admin can read all
CREATE POLICY "Admins can read all coin purchases"
  ON public.coin_purchases FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Admin can update
CREATE POLICY "Admins can update coin purchases"
  ON public.coin_purchases FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Insert default packages
INSERT INTO public.coin_packages (name, coins, price, bonus_coins, sort_order, is_featured) VALUES
  ('Starter', 100, 100, 20, 1, false),
  ('Popular', 250, 200, 60, 2, true),
  ('Best Value', 650, 500, 200, 3, false);

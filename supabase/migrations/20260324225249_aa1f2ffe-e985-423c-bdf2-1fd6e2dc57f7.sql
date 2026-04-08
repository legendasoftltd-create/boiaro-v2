
-- Subscription plans
CREATE TABLE public.subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  description text,
  price numeric NOT NULL DEFAULT 0,
  billing_type text NOT NULL DEFAULT 'monthly',
  access_type text NOT NULL DEFAULT 'both',
  status text NOT NULL DEFAULT 'active',
  sort_order integer NOT NULL DEFAULT 0,
  is_featured boolean NOT NULL DEFAULT false,
  trial_days integer DEFAULT 0,
  benefits jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage subscription_plans" ON public.subscription_plans FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Active plans viewable by everyone" ON public.subscription_plans FOR SELECT USING (status = 'active');

-- User subscriptions
CREATE TABLE public.user_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  plan_id uuid NOT NULL REFERENCES public.subscription_plans(id),
  start_date timestamptz NOT NULL DEFAULT now(),
  end_date timestamptz,
  status text NOT NULL DEFAULT 'active',
  coupon_code text,
  discount_amount numeric DEFAULT 0,
  amount_paid numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own subscriptions" ON public.user_subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own subscriptions" ON public.user_subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can manage subscriptions" ON public.user_subscriptions FOR ALL USING (has_role(auth.uid(), 'admin'));

-- Coupons
CREATE TABLE public.coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  description text,
  discount_type text NOT NULL DEFAULT 'percentage',
  discount_value numeric NOT NULL DEFAULT 0,
  applies_to text NOT NULL DEFAULT 'all',
  min_order_amount numeric DEFAULT 0,
  usage_limit integer,
  per_user_limit integer DEFAULT 1,
  used_count integer NOT NULL DEFAULT 0,
  start_date timestamptz NOT NULL DEFAULT now(),
  end_date timestamptz,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage coupons" ON public.coupons FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Active coupons viewable by authenticated" ON public.coupons FOR SELECT TO authenticated USING (status = 'active');

-- Coupon usage tracking
CREATE TABLE public.coupon_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES public.coupons(id),
  user_id uuid NOT NULL,
  order_id uuid REFERENCES public.orders(id),
  subscription_id uuid REFERENCES public.user_subscriptions(id),
  discount_amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.coupon_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own coupon usage" ON public.coupon_usage FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own coupon usage" ON public.coupon_usage FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can manage coupon_usage" ON public.coupon_usage FOR ALL USING (has_role(auth.uid(), 'admin'));

-- Add coupon fields to orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS coupon_code text,
  ADD COLUMN IF NOT EXISTS discount_amount numeric DEFAULT 0;

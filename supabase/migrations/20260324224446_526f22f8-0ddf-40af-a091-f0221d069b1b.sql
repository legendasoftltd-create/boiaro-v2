
-- Create shipping_methods table
CREATE TABLE public.shipping_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  type text NOT NULL DEFAULT 'standard',
  carrier text,
  base_cost numeric NOT NULL DEFAULT 0,
  cost_per_kg numeric NOT NULL DEFAULT 0,
  free_threshold numeric DEFAULT NULL,
  estimated_days text,
  status text NOT NULL DEFAULT 'active',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shipping_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage shipping_methods" ON public.shipping_methods FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Active shipping methods viewable by authenticated" ON public.shipping_methods FOR SELECT TO authenticated USING (status = 'active');

-- Add shipping fields to orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS shipping_method_id uuid REFERENCES public.shipping_methods(id),
  ADD COLUMN IF NOT EXISTS shipping_method_name text,
  ADD COLUMN IF NOT EXISTS shipping_carrier text,
  ADD COLUMN IF NOT EXISTS shipping_cost numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estimated_delivery_days text;

-- Seed default shipping methods
INSERT INTO public.shipping_methods (name, code, type, carrier, base_cost, cost_per_kg, free_threshold, estimated_days, status, sort_order) VALUES
  ('Standard Delivery (Inside Dhaka)', 'STD_DHAKA', 'standard', 'Sundarban Courier', 70, 5, 1000, '1-3 days', 'active', 1),
  ('Standard Delivery (Outside Dhaka)', 'STD_OUTSIDE', 'standard', 'Sundarban Courier', 120, 8, 1500, '3-7 days', 'active', 2),
  ('Express Delivery (Inside Dhaka)', 'EXP_DHAKA', 'express', 'Pathao', 150, 10, 2000, '1 day', 'active', 3),
  ('Express Delivery (Outside Dhaka)', 'EXP_OUTSIDE', 'express', 'Pathao', 220, 12, 2500, '2-3 days', 'active', 4),
  ('Same Day Delivery (Dhaka Only)', 'SAME_DAY', 'same_day', 'RedX', 200, 15, 3000, '0 day', 'active', 5),
  ('Next Day Delivery (Major Cities)', 'NEXT_DAY', 'next_day', 'Paperfly', 180, 12, 2500, '1 day', 'active', 6),
  ('Free Shipping', 'FREE_SHIP', 'standard', 'Sundarban Courier', 0, 0, NULL, '3-7 days', 'active', 7),
  ('International Shipping', 'INTL', 'international', 'DHL', 1500, 200, NULL, '5-15 days', 'active', 8)
ON CONFLICT (code) DO NOTHING;


CREATE TABLE public.payment_gateways (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway_key text NOT NULL UNIQUE,
  label text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT false,
  mode text DEFAULT 'test',
  sort_priority integer NOT NULL DEFAULT 0,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_gateways ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage payment_gateways" ON public.payment_gateways
  FOR ALL TO public USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Enabled gateways viewable by authenticated" ON public.payment_gateways
  FOR SELECT TO authenticated USING (is_enabled = true);

INSERT INTO public.payment_gateways (gateway_key, label, is_enabled, mode, sort_priority, config) VALUES
  ('cod', 'Cash on Delivery', true, 'live', 1, '{"note": "Pay when you receive your order"}'::jsonb),
  ('bkash', 'bKash', true, 'live', 2, '{"description": "Mobile payment via bKash"}'::jsonb),
  ('nagad', 'Nagad', true, 'live', 3, '{"description": "Mobile payment via Nagad"}'::jsonb),
  ('sslcommerz', 'SSLCOMMERZ', false, 'test', 4, '{"store_id": "", "success_url": "/checkout/success", "fail_url": "/checkout/fail", "cancel_url": "/checkout/cancel"}'::jsonb),
  ('stripe', 'Stripe', false, 'test', 5, '{"publishable_key": ""}'::jsonb),
  ('paypal', 'PayPal', false, 'test', 6, '{"client_id": ""}'::jsonb),
  ('razorpay', 'Razorpay', false, 'test', 7, '{"key_id": ""}'::jsonb);

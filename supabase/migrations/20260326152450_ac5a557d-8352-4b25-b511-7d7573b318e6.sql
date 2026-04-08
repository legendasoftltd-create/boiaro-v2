
CREATE TABLE public.payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  gateway text NOT NULL DEFAULT 'sslcommerz',
  event_type text NOT NULL DEFAULT 'initiate',
  status text NOT NULL DEFAULT 'pending',
  transaction_id text,
  amount numeric DEFAULT 0,
  currency text DEFAULT 'BDT',
  raw_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage payment_events" ON public.payment_events FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can view own payment events" ON public.payment_events FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.orders WHERE orders.id = payment_events.order_id AND orders.user_id = auth.uid())
);
CREATE POLICY "Service role full access" ON public.payment_events FOR ALL USING (auth.role() = 'service_role');

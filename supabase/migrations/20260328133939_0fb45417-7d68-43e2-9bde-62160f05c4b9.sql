
-- Free Shipping Campaigns table
CREATE TABLE public.free_shipping_campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  min_order_amount NUMERIC NOT NULL DEFAULT 0,
  area_type TEXT NOT NULL DEFAULT 'all',
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.free_shipping_campaigns ENABLE ROW LEVEL SECURITY;

-- Public read for checkout
CREATE POLICY "Anyone can read active free shipping campaigns"
  ON public.free_shipping_campaigns FOR SELECT
  USING (is_active = true);

-- Admin full access
CREATE POLICY "Admins can manage free shipping campaigns"
  ON public.free_shipping_campaigns FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Updated_at trigger
CREATE TRIGGER update_free_shipping_campaigns_updated_at
  BEFORE UPDATE ON public.free_shipping_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

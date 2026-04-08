
-- Drop old shipping_methods table if exists and recreate with new schema
DROP TABLE IF EXISTS public.shipping_methods CASCADE;

CREATE TABLE public.shipping_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  area_type text NOT NULL DEFAULT 'inside_dhaka' CHECK (area_type IN ('inside_dhaka', 'outside_dhaka')),
  base_charge numeric NOT NULL DEFAULT 60,
  base_weight_kg numeric NOT NULL DEFAULT 1,
  extra_charge_per_kg numeric NOT NULL DEFAULT 10,
  delivery_time text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  provider_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shipping_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active shipping methods"
  ON public.shipping_methods FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can manage shipping methods"
  ON public.shipping_methods FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Insert default methods
INSERT INTO public.shipping_methods (name, code, area_type, base_charge, base_weight_kg, extra_charge_per_kg, delivery_time, is_active, sort_order) VALUES
  ('ঢাকার ভিতরে ডেলিভারি', 'DHAKA_STD', 'inside_dhaka', 60, 1, 10, '1-3 দিন', true, 1),
  ('ঢাকার বাইরে ডেলিভারি', 'OUTSIDE_STD', 'outside_dhaka', 120, 1, 20, '3-7 দিন', true, 2);

-- Shipments table
CREATE TABLE public.shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  provider_code text,
  shipping_method_code text,
  parcel_id text,
  tracking_code text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'created', 'picked_up', 'in_transit', 'delivered', 'cancelled', 'returned')),
  total_weight numeric NOT NULL DEFAULT 0,
  delivery_charge numeric NOT NULL DEFAULT 0,
  recipient_name text,
  recipient_phone text,
  address text,
  district text,
  area text,
  postal_code text,
  request_payload jsonb,
  response_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own shipments"
  ON public.shipments FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.orders WHERE orders.id = shipments.order_id AND orders.user_id = auth.uid())
  );

CREATE POLICY "Admins can manage shipments"
  ON public.shipments FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Shipment events table
CREATE TABLE public.shipment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
  status text NOT NULL,
  message text,
  raw_payload jsonb,
  event_time timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shipment_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own shipment events"
  ON public.shipment_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.shipments s
      JOIN public.orders o ON o.id = s.order_id
      WHERE s.id = shipment_events.shipment_id AND o.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage shipment events"
  ON public.shipment_events FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Add weight_kg_per_copy to book_formats
ALTER TABLE public.book_formats ADD COLUMN IF NOT EXISTS weight_kg_per_copy numeric DEFAULT 0.25;

-- Add shipping weight and district fields to orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_district text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_area text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS total_weight numeric DEFAULT 0;

-- Update triggers
CREATE TRIGGER update_shipping_methods_updated_at BEFORE UPDATE ON public.shipping_methods
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_shipments_updated_at BEFORE UPDATE ON public.shipments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS purchase_cost_per_unit numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_purchased boolean DEFAULT false;


ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS updated_by_admin boolean DEFAULT false;

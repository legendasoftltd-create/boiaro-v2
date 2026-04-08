
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cod_payment_status text NOT NULL DEFAULT 'not_applicable';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_method text;

COMMENT ON COLUMN public.orders.cod_payment_status IS 'COD payment lifecycle: not_applicable, unpaid, cod_pending_collection, collected_by_courier, settled_to_merchant, paid';
COMMENT ON COLUMN public.orders.payment_method IS 'Payment method used: online, cod';

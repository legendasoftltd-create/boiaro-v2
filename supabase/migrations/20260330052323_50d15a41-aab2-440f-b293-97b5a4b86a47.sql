ALTER TABLE public.shipments ADD COLUMN IF NOT EXISTS courier_name text;
COMMENT ON COLUMN public.shipments.courier_name IS 'Human-readable courier name for display';
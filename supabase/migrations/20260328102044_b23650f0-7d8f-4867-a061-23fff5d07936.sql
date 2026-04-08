
CREATE OR REPLACE FUNCTION public.admin_get_payment_gateways()
RETURNS TABLE (
  id uuid, gateway_key text, label text, is_enabled boolean, mode text,
  sort_priority integer, config jsonb, notes text, created_at timestamptz, updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  RETURN QUERY SELECT pg.id, pg.gateway_key, pg.label, pg.is_enabled, pg.mode,
    pg.sort_priority, pg.config, pg.notes, pg.created_at, pg.updated_at
    FROM public.payment_gateways pg
    ORDER BY pg.sort_priority ASC;
END;
$$;

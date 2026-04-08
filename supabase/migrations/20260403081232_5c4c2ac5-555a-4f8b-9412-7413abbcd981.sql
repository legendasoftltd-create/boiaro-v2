
-- Step 1: Drop the overly permissive public SELECT policy
DROP POLICY IF EXISTS "Enabled gateways viewable by authenticated" ON public.payment_gateways;

-- Step 2: Create a safe public-facing RPC that excludes config/secrets
CREATE OR REPLACE FUNCTION public.get_enabled_gateways()
RETURNS TABLE(
  gateway_key text,
  label text,
  sort_priority integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT pg.gateway_key, pg.label, pg.sort_priority
  FROM public.payment_gateways pg
  WHERE pg.is_enabled = true
  ORDER BY pg.sort_priority ASC;
$$;

-- Fix radio station admin RLS to use canonical role check
ALTER POLICY "Admins can manage radio stations"
ON public.radio_stations
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
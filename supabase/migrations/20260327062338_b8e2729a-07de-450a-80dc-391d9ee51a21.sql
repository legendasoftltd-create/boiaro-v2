DROP POLICY "Anyone can view active radio stations" ON public.radio_stations;

CREATE POLICY "Anyone can view active radio stations"
  ON public.radio_stations FOR SELECT
  TO anon, authenticated
  USING (is_active = true);
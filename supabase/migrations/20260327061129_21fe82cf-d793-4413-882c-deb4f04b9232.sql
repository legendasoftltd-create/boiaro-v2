CREATE TABLE public.radio_stations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  stream_url TEXT NOT NULL,
  artwork_url TEXT,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.radio_stations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active radio stations"
  ON public.radio_stations FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can manage radio stations"
  ON public.radio_stations FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_user_roles aur
      JOIN public.admin_roles ar ON ar.id = aur.admin_role_id
      WHERE aur.user_id = auth.uid() AND aur.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_user_roles aur
      JOIN public.admin_roles ar ON ar.id = aur.admin_role_id
      WHERE aur.user_id = auth.uid() AND aur.is_active = true
    )
  );
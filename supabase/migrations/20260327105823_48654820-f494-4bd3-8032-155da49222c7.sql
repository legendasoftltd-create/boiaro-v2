
-- RJ profiles table
CREATE TABLE public.rj_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  stage_name text NOT NULL,
  bio text,
  avatar_url text,
  specialty text,
  is_approved boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rj_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "RJ can read own profile" ON public.rj_profiles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "RJ can update own profile" ON public.rj_profiles
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can manage rj_profiles" ON public.rj_profiles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Live sessions table
CREATE TABLE public.live_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rj_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  station_id uuid REFERENCES public.radio_stations(id) ON DELETE SET NULL,
  stream_url text,
  show_title text,
  status text NOT NULL DEFAULT 'live',
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  disconnect_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.live_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "RJ can read own sessions" ON public.live_sessions
  FOR SELECT TO authenticated
  USING (rj_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "RJ can insert own sessions" ON public.live_sessions
  FOR INSERT TO authenticated
  WITH CHECK (rj_user_id = auth.uid() AND public.has_role(auth.uid(), 'rj'));

CREATE POLICY "RJ can update own sessions" ON public.live_sessions
  FOR UPDATE TO authenticated
  USING (rj_user_id = auth.uid());

CREATE POLICY "Admins can manage live_sessions" ON public.live_sessions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone can read live sessions" ON public.live_sessions
  FOR SELECT USING (status = 'live');

-- Show schedules table
CREATE TABLE public.show_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rj_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  show_title text NOT NULL,
  day_of_week int NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.show_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active schedules" ON public.show_schedules
  FOR SELECT USING (is_active = true);

CREATE POLICY "RJ can manage own schedules" ON public.show_schedules
  FOR ALL TO authenticated
  USING (rj_user_id = auth.uid());

CREATE POLICY "Admins can manage show_schedules" ON public.show_schedules
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Enable realtime for live_sessions
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_sessions;

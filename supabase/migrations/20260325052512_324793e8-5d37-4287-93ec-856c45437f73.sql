
-- Badge definitions (admin-managed)
CREATE TABLE public.badge_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  title text NOT NULL,
  description text,
  icon_url text,
  category text NOT NULL DEFAULT 'general',
  condition_type text NOT NULL DEFAULT 'manual',
  condition_value integer DEFAULT 0,
  coin_reward integer DEFAULT 0,
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.badge_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Badges viewable by everyone" ON public.badge_definitions FOR SELECT USING (true);
CREATE POLICY "Admins can manage badges" ON public.badge_definitions FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- User badges (earned)
CREATE TABLE public.user_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  badge_id uuid NOT NULL REFERENCES public.badge_definitions(id) ON DELETE CASCADE,
  earned_at timestamptz DEFAULT now(),
  UNIQUE(user_id, badge_id)
);
ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own badges" ON public.user_badges FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can view all badges for leaderboard" ON public.user_badges FOR SELECT USING (true);
CREATE POLICY "Service can manage badges" ON public.user_badges FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Users can insert own badges" ON public.user_badges FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can manage user_badges" ON public.user_badges FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- User streaks
CREATE TABLE public.user_streaks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE NOT NULL,
  current_streak integer DEFAULT 0,
  best_streak integer DEFAULT 0,
  last_activity_date date,
  streak_updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.user_streaks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own streaks" ON public.user_streaks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can upsert own streaks" ON public.user_streaks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own streaks" ON public.user_streaks FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "All streaks viewable for leaderboard" ON public.user_streaks FOR SELECT USING (true);
CREATE POLICY "Admins can manage streaks" ON public.user_streaks FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- User goals
CREATE TABLE public.user_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  goal_type text NOT NULL DEFAULT 'read_minutes',
  target_value integer NOT NULL DEFAULT 30,
  current_value integer DEFAULT 0,
  period text NOT NULL DEFAULT 'daily',
  status text NOT NULL DEFAULT 'active',
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.user_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own goals" ON public.user_goals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own goals" ON public.user_goals FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own goals" ON public.user_goals FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage goals" ON public.user_goals FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Gamification points log
CREATE TABLE public.gamification_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  points integer NOT NULL DEFAULT 0,
  event_type text NOT NULL,
  reference_id text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.gamification_points ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own points" ON public.gamification_points FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own points" ON public.gamification_points FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "All points viewable for leaderboard" ON public.gamification_points FOR SELECT USING (true);
CREATE POLICY "Admins can manage points" ON public.gamification_points FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Indexes
CREATE INDEX idx_user_badges_user ON public.user_badges(user_id);
CREATE INDEX idx_user_streaks_user ON public.user_streaks(user_id);
CREATE INDEX idx_user_goals_user ON public.user_goals(user_id);
CREATE INDEX idx_gamification_points_user ON public.gamification_points(user_id);
CREATE INDEX idx_gamification_points_event ON public.gamification_points(event_type);

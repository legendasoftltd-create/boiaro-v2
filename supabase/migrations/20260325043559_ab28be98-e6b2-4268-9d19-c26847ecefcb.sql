-- Ad Placements
CREATE TABLE public.ad_placements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  placement_key text NOT NULL UNIQUE,
  label text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT false,
  ad_type text NOT NULL DEFAULT 'banner',
  frequency text DEFAULT 'always',
  device_visibility text DEFAULT 'both',
  display_priority integer DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ad_placements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ad placements viewable by everyone" ON public.ad_placements FOR SELECT USING (true);
CREATE POLICY "Admins can manage ad_placements" ON public.ad_placements FOR ALL USING (has_role(auth.uid(), 'admin'));

-- Ad Banners
CREATE TABLE public.ad_banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text,
  image_url text,
  destination_url text,
  placement_key text NOT NULL,
  start_date timestamptz DEFAULT now(),
  end_date timestamptz,
  status text NOT NULL DEFAULT 'active',
  display_order integer DEFAULT 0,
  impressions integer DEFAULT 0,
  clicks integer DEFAULT 0,
  device text DEFAULT 'both',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ad_banners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Active banners viewable by everyone" ON public.ad_banners FOR SELECT USING (true);
CREATE POLICY "Admins can manage ad_banners" ON public.ad_banners FOR ALL USING (has_role(auth.uid(), 'admin'));

-- Ad Campaigns
CREATE TABLE public.ad_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  ad_type text NOT NULL DEFAULT 'banner',
  placement_key text,
  start_date timestamptz DEFAULT now(),
  end_date timestamptz,
  status text NOT NULL DEFAULT 'active',
  target_page text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ad_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage ad_campaigns" ON public.ad_campaigns FOR ALL USING (has_role(auth.uid(), 'admin'));

-- Rewarded Ad Logs
CREATE TABLE public.rewarded_ad_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  ad_event_id text NOT NULL,
  coins_rewarded integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'completed',
  placement_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, ad_event_id)
);

ALTER TABLE public.rewarded_ad_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own rewarded logs" ON public.rewarded_ad_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own rewarded logs" ON public.rewarded_ad_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can manage rewarded_ad_logs" ON public.rewarded_ad_logs FOR ALL USING (has_role(auth.uid(), 'admin'));

CREATE INDEX idx_rewarded_ad_logs_user ON public.rewarded_ad_logs(user_id, created_at DESC);
CREATE INDEX idx_ad_banners_placement ON public.ad_banners(placement_key, status);

-- Seed placements
INSERT INTO public.ad_placements (placement_key, label, ad_type) VALUES
  ('homepage_banner', 'Home Page Banner', 'banner'),
  ('book_details', 'Book Details Page', 'banner'),
  ('before_reading', 'Before Reading Ebook', 'rewarded'),
  ('before_audiobook', 'Before Audiobook Play', 'rewarded'),
  ('dashboard', 'User Dashboard', 'banner'),
  ('wallet_page', 'Wallet Page', 'banner'),
  ('reward_center', 'Reward Center', 'rewarded');

-- Seed ad settings
INSERT INTO public.platform_settings (key, value) VALUES
  ('ad_system_enabled', 'true'),
  ('ad_rewarded_coins', '5'),
  ('ad_max_per_day', '10'),
  ('ad_cooldown_minutes', '5')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE public.site_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key text NOT NULL UNIQUE,
  setting_value text DEFAULT '',
  setting_type text NOT NULL DEFAULT 'text',
  category text NOT NULL DEFAULT 'general',
  label text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Site settings viewable by everyone" ON public.site_settings
  FOR SELECT TO public USING (true);

CREATE POLICY "Admins can manage site_settings" ON public.site_settings
  FOR ALL TO public USING (has_role(auth.uid(), 'admin'::app_role));

-- Seed default values
INSERT INTO public.site_settings (setting_key, setting_value, setting_type, category, label, sort_order) VALUES
-- Brand
('brand_name', 'BoiAro', 'text', 'brand', 'Brand Name', 1),
('brand_tagline', 'Your Digital Destination for Bengali Literature', 'text', 'brand', 'Brand Tagline', 2),
('logo_url', '', 'image', 'brand', 'Logo', 3),
('favicon_url', '', 'image', 'brand', 'Favicon', 4),
-- Footer About
('footer_about', 'BoiAro is your digital destination for Bengali literature — read eBooks, listen to audiobooks, and order hard copies in one place.', 'textarea', 'footer', 'About Text', 1),
('footer_trust_line', 'Trusted by readers across Bangladesh.', 'text', 'footer', 'Trust Line', 2),
-- Contact
('contact_email', 'support@boiaro.com', 'text', 'contact', 'Email', 1),
('contact_phone', '+880 1732821824', 'text', 'contact', 'Phone', 2),
('contact_address', 'Dhaka, Bangladesh', 'text', 'contact', 'Address', 3),
-- Social
('social_facebook', 'https://facebook.com/boiaro', 'text', 'social', 'Facebook', 1),
('social_youtube', '', 'text', 'social', 'YouTube', 2),
('social_instagram', '', 'text', 'social', 'Instagram', 3),
('social_twitter', '', 'text', 'social', 'Twitter/X', 4),
-- Copyright
('copyright_text', '© 2026 BoiAro. All rights reserved.', 'text', 'copyright', 'Copyright Text', 1),
('bottom_tagline', 'Built for readers. Powered by passion.', 'text', 'copyright', 'Bottom Tagline', 2),
-- Follow Us
('follow_us_text', 'Stay connected with us for new releases, updates, and exclusive content.', 'textarea', 'social', 'Follow Us Description', 0),
-- App Download
('app_android_url', '', 'text', 'app', 'Android App URL', 1),
('app_ios_url', '', 'text', 'app', 'iOS App URL', 2),
('app_download_enabled', 'false', 'boolean', 'app', 'Show App Download', 0),
-- Newsletter
('newsletter_enabled', 'false', 'boolean', 'footer', 'Show Newsletter', 3);

-- Add logo variants
INSERT INTO public.site_settings (setting_key, setting_value, setting_type, category, label, sort_order) VALUES
  ('logo_mobile_url', '', 'image', 'brand', 'Mobile Logo', 5),
  ('logo_dark_url', '', 'image', 'brand', 'Dark Mode Logo', 6),
  ('logo_footer_url', '', 'image', 'brand', 'Footer Logo', 7);

-- Add section visibility toggles
INSERT INTO public.site_settings (setting_key, setting_value, setting_type, category, label, sort_order) VALUES
  ('footer_section_about', 'true', 'boolean', 'footer', 'Show About Section', 0),
  ('footer_section_quicklinks', 'true', 'boolean', 'footer', 'Show Quick Links', 4),
  ('footer_section_support', 'true', 'boolean', 'footer', 'Show Support Section', 5),
  ('footer_section_contact', 'true', 'boolean', 'footer', 'Show Contact Section', 6),
  ('footer_section_social', 'true', 'boolean', 'footer', 'Show Social Section', 7);

-- Add coin_unlock revenue settings to platform_settings instead
INSERT INTO public.platform_settings (key, value) VALUES
  ('coin_unlock_platform_pct', '30'),
  ('coin_unlock_creator_pct', '70'),
  ('subscription_pool_platform_pct', '40'),
  ('subscription_pool_creator_pct', '60')
ON CONFLICT (key) DO NOTHING;

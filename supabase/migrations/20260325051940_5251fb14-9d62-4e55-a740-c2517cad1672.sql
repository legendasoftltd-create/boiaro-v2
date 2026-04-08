
-- Fix the overly permissive insert policy
DROP POLICY IF EXISTS "Authenticated can insert referrals" ON public.referrals;
CREATE POLICY "Users can insert referrals they refer" ON public.referrals
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = referrer_id);

-- Update handle_new_user to generate referral codes
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, display_name, referral_code)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email), UPPER(SUBSTR(MD5(NEW.id::text || NOW()::text), 1, 8)));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  INSERT INTO public.user_coins (user_id, balance) VALUES (NEW.id, 0);
  RETURN NEW;
END;
$function$;

-- Seed referral settings
INSERT INTO platform_settings (key, value) VALUES
  ('referral_enabled', 'true'),
  ('referral_signup_reward', '10'),
  ('referral_first_read_reward', '20'),
  ('referral_first_unlock_reward', '30'),
  ('referral_referred_bonus', '5'),
  ('referral_max_per_day', '10'),
  ('referral_max_rewards_per_day', '50')
ON CONFLICT (key) DO NOTHING;

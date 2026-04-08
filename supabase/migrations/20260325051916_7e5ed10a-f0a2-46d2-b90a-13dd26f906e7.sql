
-- Referrals table
CREATE TABLE IF NOT EXISTS public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL,
  referred_user_id uuid,
  referral_code text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  reward_amount integer NOT NULL DEFAULT 0,
  reward_status text NOT NULL DEFAULT 'pending',
  source text DEFAULT 'link',
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE(referred_user_id)
);

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own referrals as referrer" ON public.referrals
  FOR SELECT TO authenticated USING (auth.uid() = referrer_id);

CREATE POLICY "Users can view own referrals as referred" ON public.referrals
  FOR SELECT TO authenticated USING (auth.uid() = referred_user_id);

CREATE POLICY "Service can manage referrals" ON public.referrals
  FOR ALL TO public USING (auth.role() = 'service_role');

CREATE POLICY "Admins can manage referrals" ON public.referrals
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated can insert referrals" ON public.referrals
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE INDEX idx_referrals_referrer ON public.referrals (referrer_id);
CREATE INDEX idx_referrals_code ON public.referrals (referral_code);
CREATE INDEX idx_referrals_status ON public.referrals (status);

-- Add referral_code to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referral_code text UNIQUE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referred_by uuid;

-- Generate referral codes for existing profiles
UPDATE public.profiles SET referral_code = UPPER(SUBSTR(MD5(RANDOM()::text), 1, 8))
WHERE referral_code IS NULL;


-- Fix the overly permissive insert policy on contributor_earnings
DROP POLICY IF EXISTS "System can insert earnings" ON public.contributor_earnings;
-- Only admins should insert earnings (via admin actions or edge functions)
CREATE POLICY "Admins can insert earnings" ON public.contributor_earnings FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'));

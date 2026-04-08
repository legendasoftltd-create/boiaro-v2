
-- ============================================================
-- FIX #1: user_coins — Remove dangerous self-update & self-insert
-- Users should NOT be able to modify their own coin balance.
-- Only admin and service_role should mutate coin records.
-- ============================================================

-- Drop the dangerous user self-update policy
DROP POLICY IF EXISTS "Users can update own coins" ON public.user_coins;

-- Drop the user self-insert policy (prevents fake coin records)
DROP POLICY IF EXISTS "Users can insert own coins" ON public.user_coins;

-- Add service_role full access so edge functions can manage coins
CREATE POLICY "Service role can manage coins"
  ON public.user_coins FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- FIX #2: email_logs — Allow any authenticated user to insert
-- The emailService.ts runs in authenticated user context.
-- ============================================================

-- Drop the admin-only insert policy
DROP POLICY IF EXISTS "Admins can insert email logs" ON public.email_logs;

-- Allow any authenticated user to insert email logs
CREATE POLICY "Authenticated users can insert email logs"
  ON public.email_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ============================================================
-- FIX #3: payments — Add admin update policy
-- ============================================================

CREATE POLICY "Admins can update payments"
  ON public.payments FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- ============================================================
-- FIX #4: platform_settings — Restrict to authenticated only
-- ============================================================

-- Drop the overly permissive public SELECT
DROP POLICY IF EXISTS "Platform settings viewable by everyone" ON public.platform_settings;

-- Replace with authenticated-only read
CREATE POLICY "Platform settings viewable by authenticated"
  ON public.platform_settings FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================
-- FIX #5: listening_progress — Fix INSERT check
-- ============================================================

-- Drop the existing INSERT policy that has no WITH CHECK
DROP POLICY IF EXISTS "Users can upsert listening progress" ON public.listening_progress;

-- Recreate with proper user_id check
CREATE POLICY "Users can upsert listening progress"
  ON public.listening_progress FOR INSERT
  WITH CHECK (auth.uid() = user_id);

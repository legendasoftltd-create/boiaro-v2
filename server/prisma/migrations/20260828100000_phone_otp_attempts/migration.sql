-- Wrong-guess counter for phone OTP verification.
-- Without it, a live OTP stayed guessable for its entire 5-minute window and
-- was throttled only by the IP-scoped auth rate limiter.
ALTER TABLE "phone_otps" ADD COLUMN IF NOT EXISTS "attempts" INTEGER NOT NULL DEFAULT 0;

-- Kill switch for stateless JWT sessions.
--
-- Refresh tokens issued before this instant are refused, which is how
-- "sign out from all devices", a password change and a security revoke end
-- every session at once. Left NULL for existing users so nobody is signed
-- out by the migration itself.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "sessions_valid_from" TIMESTAMP(3);

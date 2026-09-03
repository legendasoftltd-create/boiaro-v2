-- Social Broadcast Rights on the Studio Music Library.
--
-- Purely additive and nullable: every existing track keeps working with these
-- unset. Null means "not stated", which the warning-first policy treats as
-- "not cleared for social" — it warns the RJ and writes an audit entry, and
-- deliberately does NOT block playback in this phase.
ALTER TABLE "studio_audio_assets" ADD COLUMN IF NOT EXISTS "social_rights_app" BOOLEAN;
ALTER TABLE "studio_audio_assets" ADD COLUMN IF NOT EXISTS "social_rights_website" BOOLEAN;
ALTER TABLE "studio_audio_assets" ADD COLUMN IF NOT EXISTS "social_rights_facebook" BOOLEAN;
ALTER TABLE "studio_audio_assets" ADD COLUMN IF NOT EXISTS "social_rights_youtube" BOOLEAN;
ALTER TABLE "studio_audio_assets" ADD COLUMN IF NOT EXISTS "social_rights_other" BOOLEAN;

-- Mixer library approval/publish workflow — existing rows all default to
-- "approved" (they were already live before this feature existed).
ALTER TABLE "studio_audio_assets" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'approved';

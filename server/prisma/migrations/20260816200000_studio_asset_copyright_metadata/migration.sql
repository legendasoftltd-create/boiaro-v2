-- Mixer library copyright metadata — was previously just a single
-- license_acknowledged_at timestamp with no detail behind it.
ALTER TABLE "studio_audio_assets" ADD COLUMN "rights_holder" TEXT;
ALTER TABLE "studio_audio_assets" ADD COLUMN "license_type" TEXT;
ALTER TABLE "studio_audio_assets" ADD COLUMN "license_document_url" TEXT;
ALTER TABLE "studio_audio_assets" ADD COLUMN "allowed_usage" TEXT;

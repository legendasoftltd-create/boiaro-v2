-- Automatic Live Recording: lifecycle status/metadata on LiveSession, plus a
-- station-level toggle alongside the existing global + per-session ones.
-- Existing manually-attached recordings are backfilled as already-published
-- (they were already showing in catch-up) so the new status column doesn't
-- silently hide anything that was visible before this migration.

BEGIN;

-- AlterTable
ALTER TABLE "live_sessions" ADD COLUMN     "recording_approved_at" TIMESTAMP(3),
ADD COLUMN     "recording_approved_by" TEXT,
ADD COLUMN     "recording_duration_seconds" INTEGER,
ADD COLUMN     "recording_file_size_bytes" INTEGER,
ADD COLUMN     "recording_published_at" TIMESTAMP(3),
ADD COLUMN     "recording_source" TEXT,
ADD COLUMN     "recording_status" TEXT;

-- AlterTable
ALTER TABLE "radio_stations" ADD COLUMN     "auto_recording_enabled" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: recordings that already existed (manually attached, already
-- visible in catch-up) are treated as published so nothing disappears.
UPDATE "live_sessions"
SET "recording_status" = 'published', "recording_source" = 'manual', "recording_published_at" = "created_at"
WHERE "recording_url" IS NOT NULL;

COMMIT;

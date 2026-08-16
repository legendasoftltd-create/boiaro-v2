-- Adds best-effort city geo and reported playback quality-tier tracking
-- to listener_sessions, both nullable and backfilled as NULL for existing rows.
ALTER TABLE "listener_sessions" ADD COLUMN "city" TEXT;
ALTER TABLE "listener_sessions" ADD COLUMN "quality" TEXT;

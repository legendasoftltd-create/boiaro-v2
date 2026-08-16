-- AlterTable
ALTER TABLE "song_requests" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "song_requests_live_session_id_position_idx" ON "song_requests"("live_session_id", "position");

-- Backfill position from creation order per session, so existing queues
-- keep a sane order before anyone manually reorders them.
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY live_session_id ORDER BY created_at ASC) - 1 AS rn
  FROM "song_requests"
)
UPDATE "song_requests" sr
SET "position" = ordered.rn
FROM ordered
WHERE sr.id = ordered.id;

-- Catch-up playback tracking: resume progress, total/unique plays,
-- completion rate — one row per (user, recording).

BEGIN;

ALTER TABLE "live_sessions" ADD COLUMN     "catchup_play_count" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "catchup_progress" (
    "id" TEXT NOT NULL,
    "live_session_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "position_seconds" INTEGER NOT NULL DEFAULT 0,
    "duration_seconds" INTEGER,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "total_plays" INTEGER NOT NULL DEFAULT 1,
    "last_played_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "catchup_progress_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "catchup_progress_live_session_id_idx" ON "catchup_progress"("live_session_id");

CREATE UNIQUE INDEX "catchup_progress_user_id_live_session_id_key" ON "catchup_progress"("user_id", "live_session_id");

ALTER TABLE "catchup_progress" ADD CONSTRAINT "catchup_progress_live_session_id_fkey" FOREIGN KEY ("live_session_id") REFERENCES "live_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;

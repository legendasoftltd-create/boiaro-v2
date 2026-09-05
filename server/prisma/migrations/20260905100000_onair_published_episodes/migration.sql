-- BoiAro On Air — published recorded shows.
--
-- Purely additive: two new tables, nothing existing is touched. The raw
-- recording columns on live_sessions/studio_sessions stay exactly as they
-- were and remain the master/backup copy.
CREATE TABLE IF NOT EXISTS "onair_episodes" (
  "id"                TEXT NOT NULL,
  "studio_session_id" TEXT,
  "live_session_id"   TEXT,
  "show_schedule_id"  TEXT,
  "station_id"        TEXT,
  "rj_user_id"        TEXT NOT NULL,
  "title"             TEXT NOT NULL,
  "episode_title"     TEXT,
  "description"       TEXT,
  "cover_image_url"   TEXT,
  "master_audio_url"  TEXT,
  "stream_audio_url"  TEXT,
  "stream_mime_type"  TEXT,
  "stream_size_bytes" INTEGER,
  "duration_seconds"  INTEGER,
  "recording_type"    TEXT NOT NULL DEFAULT 'mixed',
  "status"            TEXT NOT NULL DEFAULT 'draft',
  "visibility"        TEXT NOT NULL DEFAULT 'public',
  "recorded_at"       TIMESTAMP(3) NOT NULL,
  "publish_at"        TIMESTAMP(3),
  "published_at"      TIMESTAMP(3),
  "transcode_status"  TEXT,
  "transcode_error"   TEXT,
  "play_count"        INTEGER NOT NULL DEFAULT 0,
  "created_by"        TEXT,
  "updated_by"        TEXT,
  "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "onair_episodes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "onair_episodes_studio_session_id_key" ON "onair_episodes"("studio_session_id");
CREATE INDEX IF NOT EXISTS "onair_episodes_status_published_at_idx" ON "onair_episodes"("status", "published_at");
CREATE INDEX IF NOT EXISTS "onair_episodes_status_publish_at_idx" ON "onair_episodes"("status", "publish_at");
CREATE INDEX IF NOT EXISTS "onair_episodes_show_schedule_id_idx" ON "onair_episodes"("show_schedule_id");
CREATE INDEX IF NOT EXISTS "onair_episodes_rj_user_id_idx" ON "onair_episodes"("rj_user_id");

CREATE TABLE IF NOT EXISTS "onair_episode_progress" (
  "id"               TEXT NOT NULL,
  "episode_id"       TEXT NOT NULL,
  "user_id"          TEXT NOT NULL,
  "position_seconds" INTEGER NOT NULL DEFAULT 0,
  "duration_seconds" INTEGER,
  "completed"        BOOLEAN NOT NULL DEFAULT false,
  "total_plays"      INTEGER NOT NULL DEFAULT 1,
  "last_played_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "onair_episode_progress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "onair_episode_progress_user_id_episode_id_key" ON "onair_episode_progress"("user_id", "episode_id");
CREATE INDEX IF NOT EXISTS "onair_episode_progress_episode_id_idx" ON "onair_episode_progress"("episode_id");

ALTER TABLE "onair_episode_progress"
  ADD CONSTRAINT "onair_episode_progress_episode_id_fkey"
  FOREIGN KEY ("episode_id") REFERENCES "onair_episodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

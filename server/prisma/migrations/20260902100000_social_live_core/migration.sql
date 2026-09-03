-- BoiAro On Air — Social Live Broadcasting, core tables.
--
-- Purely additive: four new tables, no existing table is altered and no
-- existing row is touched, so rolling this back is a clean DROP. The feature
-- stays inert until the `social_live_enabled` platform setting is turned on.

CREATE TABLE "social_platform_connections" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "platform" TEXT NOT NULL,
    "account_name" TEXT NOT NULL,
    "account_ref" TEXT,
    "rtmp_url" TEXT NOT NULL,
    "stream_key_encrypted" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'unconfigured',
    "last_tested_at" TIMESTAMP(3),
    "last_error" TEXT,

    CONSTRAINT "social_platform_connections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "social_broadcasts" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "live_session_id" TEXT,
    "show_schedule_id" TEXT,
    "station_id" TEXT,
    "trigger" TEXT NOT NULL DEFAULT 'manual',
    "started_by" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "state" TEXT NOT NULL DEFAULT 'STARTING',
    "stop_reason" TEXT,
    "social_title" TEXT,
    "social_description" TEXT,
    "cover_url" TEXT,

    CONSTRAINT "social_broadcasts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "social_broadcast_destinations" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "broadcast_id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'STARTING',
    "encoder_pid" INTEGER,
    "reconnect_attempts" INTEGER NOT NULL DEFAULT 0,
    "last_disconnect_at" TIMESTAMP(3),
    "last_reconnect_at" TIMESTAMP(3),
    "last_error" TEXT,
    "platform_watch_url" TEXT,
    "ended_at" TIMESTAMP(3),

    CONSTRAINT "social_broadcast_destinations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "show_social_settings" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "show_schedule_id" TEXT NOT NULL,
    "facebook_enabled" BOOLEAN NOT NULL DEFAULT false,
    "youtube_enabled" BOOLEAN NOT NULL DEFAULT false,
    "auto_start" BOOLEAN NOT NULL DEFAULT false,
    "auto_stop" BOOLEAN NOT NULL DEFAULT false,
    "start_before_minutes" INTEGER NOT NULL DEFAULT 5,
    "stop_after_minutes" INTEGER NOT NULL DEFAULT 5,
    "social_title" TEXT,
    "social_description" TEXT,
    "cover_url" TEXT,

    CONSTRAINT "show_social_settings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "social_platform_connections_platform_enabled_idx" ON "social_platform_connections"("platform", "enabled");
CREATE INDEX "social_broadcasts_state_started_at_idx" ON "social_broadcasts"("state", "started_at");
CREATE INDEX "social_broadcasts_live_session_id_idx" ON "social_broadcasts"("live_session_id");
CREATE INDEX "social_broadcast_destinations_broadcast_id_idx" ON "social_broadcast_destinations"("broadcast_id");
CREATE INDEX "social_broadcast_destinations_connection_id_state_idx" ON "social_broadcast_destinations"("connection_id", "state");
CREATE UNIQUE INDEX "show_social_settings_show_schedule_id_key" ON "show_social_settings"("show_schedule_id");

-- The duplicate-encoder guard that survives a process restart. The in-memory
-- registry and the start-time preflight both vanish when the process does;
-- this does not. "Non-terminal" means the leg still believes it owns a
-- running ffmpeg, so a second start against the same platform connection is
-- refused by the database rather than by hopeful application logic.
--
-- Expressed as raw SQL because Prisma's schema language has no way to put a
-- WHERE clause on a unique index.
CREATE UNIQUE INDEX "social_broadcast_destinations_one_active_per_connection"
    ON "social_broadcast_destinations"("connection_id")
    WHERE "state" IN ('STARTING', 'LIVE', 'RECONNECTING', 'STOPPING');

ALTER TABLE "social_broadcast_destinations"
    ADD CONSTRAINT "social_broadcast_destinations_broadcast_id_fkey"
    FOREIGN KEY ("broadcast_id") REFERENCES "social_broadcasts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "social_broadcast_destinations"
    ADD CONSTRAINT "social_broadcast_destinations_connection_id_fkey"
    FOREIGN KEY ("connection_id") REFERENCES "social_platform_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

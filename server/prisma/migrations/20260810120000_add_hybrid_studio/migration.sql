-- AlterTable
ALTER TABLE "listener_sessions" ADD COLUMN     "country" TEXT;

-- CreateTable
CREATE TABLE "studio_sessions" (
    "id" TEXT NOT NULL,
    "room_name" TEXT NOT NULL,
    "show_schedule_id" TEXT,
    "host_user_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "media_type" TEXT NOT NULL DEFAULT 'audio',
    "live_session_id" TEXT,
    "master_recording_url" TEXT,
    "master_recording_status" TEXT,

    CONSTRAINT "studio_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_participants" (
    "id" TEXT NOT NULL,
    "studio_session_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMP(3),

    CONSTRAINT "studio_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_invite_links" (
    "id" TEXT NOT NULL,
    "studio_session_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "studio_invite_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "icecast_listener_samples" (
    "id" TEXT NOT NULL,
    "live_session_id" TEXT,
    "listener_count" INTEGER NOT NULL,
    "sampled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "icecast_listener_samples_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "studio_sessions_room_name_key" ON "studio_sessions"("room_name");

-- CreateIndex
CREATE UNIQUE INDEX "studio_sessions_live_session_id_key" ON "studio_sessions"("live_session_id");

-- CreateIndex
CREATE INDEX "studio_participants_studio_session_id_idx" ON "studio_participants"("studio_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "studio_participants_studio_session_id_user_id_key" ON "studio_participants"("studio_session_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "studio_invite_links_token_key" ON "studio_invite_links"("token");

-- CreateIndex
CREATE INDEX "studio_invite_links_studio_session_id_idx" ON "studio_invite_links"("studio_session_id");

-- CreateIndex
CREATE INDEX "icecast_listener_samples_live_session_id_sampled_at_idx" ON "icecast_listener_samples"("live_session_id", "sampled_at");

-- AddForeignKey
ALTER TABLE "studio_sessions" ADD CONSTRAINT "studio_sessions_live_session_id_fkey" FOREIGN KEY ("live_session_id") REFERENCES "live_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_participants" ADD CONSTRAINT "studio_participants_studio_session_id_fkey" FOREIGN KEY ("studio_session_id") REFERENCES "studio_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_invite_links" ADD CONSTRAINT "studio_invite_links_studio_session_id_fkey" FOREIGN KEY ("studio_session_id") REFERENCES "studio_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecast_listener_samples" ADD CONSTRAINT "icecast_listener_samples_live_session_id_fkey" FOREIGN KEY ("live_session_id") REFERENCES "live_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Live radio: chat, song requests, catch-up recording link, multi-bitrate mounts.
BEGIN;

-- AlterTable
ALTER TABLE "live_sessions" ADD COLUMN     "recording_url" TEXT;

-- AlterTable
ALTER TABLE "radio_stations" ADD COLUMN     "stream_url_low" TEXT,
ADD COLUMN     "stream_url_medium" TEXT;

-- CreateTable
CREATE TABLE "live_chat_messages" (
    "id" TEXT NOT NULL,
    "live_session_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "live_chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "song_requests" (
    "id" TEXT NOT NULL,
    "live_session_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "request_text" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "song_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "live_chat_messages_live_session_id_created_at_idx" ON "live_chat_messages"("live_session_id", "created_at");

-- CreateIndex
CREATE INDEX "song_requests_live_session_id_created_at_idx" ON "song_requests"("live_session_id", "created_at");

-- AddForeignKey
ALTER TABLE "live_chat_messages" ADD CONSTRAINT "live_chat_messages_live_session_id_fkey" FOREIGN KEY ("live_session_id") REFERENCES "live_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "song_requests" ADD CONSTRAINT "song_requests_live_session_id_fkey" FOREIGN KEY ("live_session_id") REFERENCES "live_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;

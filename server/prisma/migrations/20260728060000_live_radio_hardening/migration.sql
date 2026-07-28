-- Live Radio hardening pass: test-broadcast mode, reconnect heartbeat,
-- session-level feature toggles, listener-session analytics, moderation
-- (mutes/reports), RJ broadcast credentials + terms acceptance + approval
-- history, and the call-in state machine (DB/API only, no audio transport).

BEGIN;

-- AlterTable
ALTER TABLE "live_sessions" ADD COLUMN     "callin_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "category" TEXT,
ADD COLUMN     "chat_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "is_test" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "last_heartbeat_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "reaction_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "recording_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "requests_enabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "rj_profiles" ADD COLUMN     "broadcast_token_created_at" TIMESTAMP(3),
ADD COLUMN     "broadcast_token_hash" TEXT,
ADD COLUMN     "broadcast_token_revoked_at" TIMESTAMP(3),
ADD COLUMN     "terms_accepted_at" TIMESTAMP(3),
ADD COLUMN     "terms_accepted_version" TEXT;

-- CreateTable
CREATE TABLE "listener_sessions" (
    "id" TEXT NOT NULL,
    "live_session_id" TEXT NOT NULL,
    "user_id" TEXT,
    "device_id" TEXT,
    "platform" TEXT,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listener_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "radio_mutes" (
    "id" TEXT NOT NULL,
    "live_session_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "muted_by" TEXT NOT NULL,
    "reason" TEXT,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "radio_mutes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "live_reports" (
    "id" TEXT NOT NULL,
    "live_session_id" TEXT NOT NULL,
    "reporter_id" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "live_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_in_requests" (
    "id" TEXT NOT NULL,
    "live_session_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMP(3),
    "on_air_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "consent_given_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "call_in_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rj_approval_logs" (
    "id" TEXT NOT NULL,
    "rj_user_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "actor_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rj_approval_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "listener_sessions_live_session_id_joined_at_idx" ON "listener_sessions"("live_session_id", "joined_at");

-- CreateIndex
CREATE INDEX "radio_mutes_live_session_id_user_id_idx" ON "radio_mutes"("live_session_id", "user_id");

-- CreateIndex
CREATE INDEX "live_reports_status_created_at_idx" ON "live_reports"("status", "created_at");

-- CreateIndex
CREATE INDEX "call_in_requests_live_session_id_status_idx" ON "call_in_requests"("live_session_id", "status");

-- CreateIndex
CREATE INDEX "rj_approval_logs_rj_user_id_created_at_idx" ON "rj_approval_logs"("rj_user_id", "created_at");

-- AddForeignKey
ALTER TABLE "listener_sessions" ADD CONSTRAINT "listener_sessions_live_session_id_fkey" FOREIGN KEY ("live_session_id") REFERENCES "live_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "radio_mutes" ADD CONSTRAINT "radio_mutes_live_session_id_fkey" FOREIGN KEY ("live_session_id") REFERENCES "live_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_reports" ADD CONSTRAINT "live_reports_live_session_id_fkey" FOREIGN KEY ("live_session_id") REFERENCES "live_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_in_requests" ADD CONSTRAINT "call_in_requests_live_session_id_fkey" FOREIGN KEY ("live_session_id") REFERENCES "live_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;

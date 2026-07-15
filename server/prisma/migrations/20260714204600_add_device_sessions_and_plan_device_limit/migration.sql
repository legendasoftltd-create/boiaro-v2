-- Per-plan device count limits: track a session row per (user, device) so
-- logins can be counted and capped against the user's active plan.
-- device_limit is nullable on subscription_plans — NULL means unlimited, so
-- every existing plan keeps today's (unrestricted) behavior until an admin
-- explicitly sets a limit.
ALTER TABLE "subscription_plans"
  ADD COLUMN "device_limit" INTEGER;

CREATE TABLE "device_sessions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "device_id" TEXT NOT NULL,
  "device_name" TEXT,
  "platform" TEXT,
  "last_active_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "device_sessions_user_id_device_id_key" ON "device_sessions"("user_id", "device_id");
CREATE INDEX "device_sessions_user_id_idx" ON "device_sessions"("user_id");

CREATE TABLE IF NOT EXISTS "device_push_tokens" (
  "id"         TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "user_id"    TEXT NOT NULL,
  "token"      TEXT NOT NULL,
  "platform"   TEXT NOT NULL DEFAULT 'android',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "device_push_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "device_push_tokens_user_id_token_key" ON "device_push_tokens"("user_id", "token");
CREATE INDEX IF NOT EXISTS "device_push_tokens_user_id_idx" ON "device_push_tokens"("user_id");

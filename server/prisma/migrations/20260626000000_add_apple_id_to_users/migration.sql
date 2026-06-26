-- AlterTable
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "apple_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "users_apple_id_key" ON "users"("apple_id");

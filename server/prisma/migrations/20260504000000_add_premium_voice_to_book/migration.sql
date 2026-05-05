-- AlterTable
ALTER TABLE "books" ADD COLUMN IF NOT EXISTS "premium_voice_enabled" BOOLEAN DEFAULT false;
ALTER TABLE "books" ADD COLUMN IF NOT EXISTS "voice_access_type" TEXT DEFAULT 'paid';
ALTER TABLE "books" ADD COLUMN IF NOT EXISTS "voice_coin_price" INTEGER;

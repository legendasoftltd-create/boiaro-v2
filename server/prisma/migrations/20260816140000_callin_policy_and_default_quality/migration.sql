-- AlterTable
ALTER TABLE "radio_stations" ADD COLUMN "callin_enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "radio_stations" ADD COLUMN "default_quality" TEXT NOT NULL DEFAULT 'high';

-- AlterTable
ALTER TABLE "rj_profiles" ADD COLUMN "callin_enabled" BOOLEAN NOT NULL DEFAULT true;

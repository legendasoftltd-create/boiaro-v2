-- AlterTable
ALTER TABLE "default_revenue_rules" ADD COLUMN IF NOT EXISTS "translator_percentage" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "format_revenue_splits" ADD COLUMN IF NOT EXISTS "translator_pct" DOUBLE PRECISION NOT NULL DEFAULT 0;

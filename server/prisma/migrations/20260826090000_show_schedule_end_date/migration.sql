-- Purely additive: nullable, existing rows keep their current (same-day)
-- meaning with no backfill needed.
ALTER TABLE "show_schedules" ADD COLUMN "end_date" TIMESTAMP(3);

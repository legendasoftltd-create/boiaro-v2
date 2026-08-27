-- Speeds up the new paginated/filtered admin.listNotifications query
-- (order by created_at desc, filter by status/type/audience) against a
-- 7,000+ row table. Plain CREATE INDEX (not CONCURRENTLY) is fine here —
-- the table is small enough that building these takes milliseconds, and
-- CONCURRENTLY can't safely run inside the transaction Prisma wraps
-- migrations in.
CREATE INDEX IF NOT EXISTS "notifications_created_at_idx" ON "notifications" ("created_at");
CREATE INDEX IF NOT EXISTS "notifications_status_idx" ON "notifications" ("status");
CREATE INDEX IF NOT EXISTS "notifications_type_idx" ON "notifications" ("type");
CREATE INDEX IF NOT EXISTS "notifications_audience_idx" ON "notifications" ("audience");

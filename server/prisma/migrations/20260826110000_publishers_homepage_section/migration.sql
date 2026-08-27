-- Seeds the new "publishers" homepage section row, appended after whatever
-- sort_order is currently highest so it doesn't disturb existing admin
-- customization (drag-reorder, enable/disable). Idempotent — safe to re-run.
INSERT INTO "homepage_sections" ("id", "section_key", "title", "subtitle", "is_enabled", "sort_order", "updated_at")
SELECT gen_random_uuid(), 'publishers', 'জনপ্রিয় প্রকাশক', NULL, true, base.next_order, now()
FROM (SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order FROM "homepage_sections") AS base
ON CONFLICT ("section_key") DO NOTHING;

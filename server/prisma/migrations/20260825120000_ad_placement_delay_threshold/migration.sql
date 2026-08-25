-- Purely additive: new nullable columns, and two new placement rows seeded
-- disabled (is_enabled = false) so nothing shows on the live site until an
-- admin explicitly turns them on from Admin -> Ad Placements.
ALTER TABLE "ad_placements" ADD COLUMN "delay_seconds" INTEGER;
ALTER TABLE "ad_placements" ADD COLUMN "min_progress_percent" INTEGER;

INSERT INTO "ad_placements" ("id", "placement_key", "label", "ad_type", "device_visibility", "display_priority", "is_enabled", "delay_seconds", "updated_at")
VALUES
  (gen_random_uuid(), 'reader_delayed', 'Ebook Reader — Delayed', 'banner', 'all', 0, false, 60, now()),
  (gen_random_uuid(), 'player_delayed', 'Audiobook Player — Delayed', 'banner', 'all', 0, false, 90, now())
ON CONFLICT ("placement_key") DO NOTHING;

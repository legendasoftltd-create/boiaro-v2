-- Data-only migration: register the new Home Screen leaderboard section so
-- it actually renders (Index.tsx only shows section_keys present in this
-- table). Placed right after Continue Listening — early, alongside the
-- other personal-engagement sections.
BEGIN;

UPDATE "homepage_sections" SET sort_order = sort_order + 1 WHERE sort_order >= 4;

INSERT INTO "homepage_sections" (id, section_key, title, subtitle, is_enabled, sort_order, display_source, created_at, updated_at)
VALUES (gen_random_uuid()::text, 'leaderboard', 'লিডারবোর্ড', 'সবচেয়ে বেশি পড়া ও শোনা ইউজাররা', true, 4, NULL, now(), now())
ON CONFLICT (section_key) DO NOTHING;

COMMIT;

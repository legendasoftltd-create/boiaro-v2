-- Four new automatically-ranked homepage sections (real sales/listening
-- data, not manual admin flags — see server/src/services/books.service.ts):
-- Best Sellers + Special Offers (hard copy), Trending Now + Top 10
-- Audiobooks (audiobook). Appended after whatever the current max sort_order
-- is (rather than a fixed number) so this doesn't assume/disturb however an
-- admin has already reordered the existing rows — drag-reorder them into
-- place from Admin > Homepage Sections afterward. ON CONFLICT DO NOTHING
-- makes this safe to apply even if a row with the same key already exists.
INSERT INTO "homepage_sections" ("id", "section_key", "title", "subtitle", "is_enabled", "sort_order", "updated_at")
SELECT gen_random_uuid(), v.section_key, v.title, v.subtitle, true, base.next_order + v.rank_offset, now()
FROM (VALUES
  ('best_sellers', 'বেস্ট সেলার', 'সবচেয়ে বেশি বিক্রি হওয়া বই', 1),
  ('special_offers', 'বিশেষ অফার', 'ছাড়ে পাওয়া বই', 2),
  ('trending_audiobooks', 'ট্রেন্ডিং নাও', 'সাম্প্রতিক সবচেয়ে বেশি শোনা অডিওবুক', 3),
  ('top_audiobooks', 'টপ ১০ অডিওবুক', 'সর্বকালের সবচেয়ে বেশি শোনা অডিওবুক', 4)
) AS v(section_key, title, subtitle, rank_offset),
(SELECT COALESCE(MAX(sort_order), 0) AS next_order FROM "homepage_sections") AS base
ON CONFLICT ("section_key") DO NOTHING;

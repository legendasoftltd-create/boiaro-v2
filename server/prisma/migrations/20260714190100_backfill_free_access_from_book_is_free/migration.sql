-- Preserve existing "book-level is_free" behavior at the format level, since
-- the consolidated access engine checks format.free_access exclusively and
-- never reads the legacy whole-book is_free flag for access decisions.
UPDATE "book_formats" bf
SET "free_access" = true
FROM "books" b
WHERE bf."book_id" = b."id" AND b."is_free" = true;

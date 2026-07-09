-- Sync book.subscriber_access=true for any book whose ebook or audiobook format
-- already has subscriber_access=true (catches admin enabling format-level directly).
UPDATE "books"
SET "subscriber_access" = true
WHERE "subscriber_access" = false
  AND "id" IN (
    SELECT DISTINCT "book_id"
    FROM "book_formats"
    WHERE "subscriber_access" = true
      AND "format" IN ('ebook', 'audiobook')
  );

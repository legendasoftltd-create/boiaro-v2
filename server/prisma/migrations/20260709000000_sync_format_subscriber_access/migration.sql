-- Sync book_formats.subscriber_access with their parent book's setting.
-- Books with subscriber_access=true should have their ebook/audiobook formats enabled too.
UPDATE "book_formats"
SET "subscriber_access" = true
WHERE "format" IN ('ebook', 'audiobook')
  AND "book_id" IN (
    SELECT "id" FROM "books" WHERE "subscriber_access" = true
  );

-- Set all existing books and formats to subscriber_access = false
UPDATE "books" SET "subscriber_access" = false;
UPDATE "book_formats" SET "subscriber_access" = false;

-- Change column defaults to false
ALTER TABLE "books" ALTER COLUMN "subscriber_access" SET DEFAULT false;
ALTER TABLE "book_formats" ALTER COLUMN "subscriber_access" SET DEFAULT false;

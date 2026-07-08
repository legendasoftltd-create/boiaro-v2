-- AddColumn: subscriber_access to book_formats
ALTER TABLE "book_formats" ADD COLUMN IF NOT EXISTS "subscriber_access" BOOLEAN DEFAULT true;

-- AddColumn: subscriber_access to books
ALTER TABLE "books" ADD COLUMN IF NOT EXISTS "subscriber_access" BOOLEAN DEFAULT true;

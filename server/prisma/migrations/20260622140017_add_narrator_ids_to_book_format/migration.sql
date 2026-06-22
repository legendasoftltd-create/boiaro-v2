-- AlterTable
ALTER TABLE "book_formats" ADD COLUMN "narrator_ids" TEXT[] NOT NULL DEFAULT '{}';

-- Admin-managed display priority for books, mirroring the existing
-- priority field on Category/Author/Translator/Narrator/Publisher.
-- Default 0 preserves today's ordering (recency/popularity) for every
-- existing book until an admin explicitly sets a higher priority.
ALTER TABLE "books" ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 0;

-- Fix Read Count: previously every reader-open/click created a new book_reads
-- row and incremented books.total_reads, so the number reflected open events,
-- not unique readers. Dedupe existing data (keep the earliest row per
-- user_id+book_id — i.e. as if the new unique-reader rule had applied from
-- the start), recompute total_reads from the deduped rows, then enforce
-- uniqueness going forward. This is a best-effort recalculation: it corrects
-- the "counted every open" inflation, but the new engagement threshold
-- (>=60s or >=3 pages, see readTracking.ts) can't be verified retroactively
-- since no historical session-duration data exists — reads recorded before
-- this migration are treated as already-qualifying.

-- DropIndexes are not needed; book_reads had no prior unique constraint.

BEGIN;

-- Keep only the earliest book_reads row per (user_id, book_id).
DELETE FROM "book_reads" a
USING "book_reads" b
WHERE a.user_id = b.user_id
  AND a.book_id = b.book_id
  AND a.created_at > b.created_at;

-- Tie-break: if two rows share the exact same created_at, keep the lowest id.
DELETE FROM "book_reads" a
USING "book_reads" b
WHERE a.user_id = b.user_id
  AND a.book_id = b.book_id
  AND a.created_at = b.created_at
  AND a.id > b.id;

-- Recompute total_reads from the deduped rows.
UPDATE "books" b
SET total_reads = COALESCE(r.cnt, 0)
FROM (
  SELECT book_id, COUNT(*) AS cnt FROM "book_reads" GROUP BY book_id
) r
WHERE b.id = r.book_id;

UPDATE "books"
SET total_reads = 0
WHERE id NOT IN (SELECT DISTINCT book_id FROM "book_reads");

-- AlterTable
ALTER TABLE "books" ADD COLUMN "total_views" INTEGER DEFAULT 0;

-- CreateTable
CREATE TABLE "book_views" (
    "id" TEXT NOT NULL,
    "book_id" TEXT NOT NULL,
    "user_id" TEXT,
    "device_id" TEXT,
    "view_count" INTEGER NOT NULL DEFAULT 1,
    "last_viewed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "book_views_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "book_views_book_id_user_id_key" ON "book_views"("book_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "book_views_book_id_device_id_key" ON "book_views"("book_id", "device_id");

-- AddForeignKey
ALTER TABLE "book_views" ADD CONSTRAINT "book_views_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex (enforce uniqueness on book_reads now that duplicates are gone)
CREATE UNIQUE INDEX "book_reads_user_id_book_id_key" ON "book_reads"("user_id", "book_id");

COMMIT;

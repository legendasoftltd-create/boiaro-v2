-- Book.priority switches from "higher shows first" (default 0) to
-- "lower shows first, ascending" with unset books sorting last via SQL
-- NULLS LAST. Under the old default, every untouched book had priority=0
-- and relied on descending order to push it behind explicitly-boosted
-- books; under ascending order that same 0 would instead sort FIRST,
-- burying every deliberately-prioritized book behind the entire rest of
-- the catalog. Making the column nullable and backfilling existing 0s to
-- NULL preserves "untouched books keep their old relative position" while
-- letting explicit priorities (1, 2, 3, ...) sort ascending at the front.
ALTER TABLE "books" ALTER COLUMN "priority" DROP DEFAULT;
ALTER TABLE "books" ALTER COLUMN "priority" DROP NOT NULL;
UPDATE "books" SET "priority" = NULL WHERE "priority" = 0;

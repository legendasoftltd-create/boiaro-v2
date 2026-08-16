-- Adds a real up/down signal per Icecast poll sample, distinct from
-- listener_count (which was ambiguous: 0 listeners vs. source not found at
-- all read identically). Existing rows default to true since streamHealth
-- only ever looks at the most recent few samples going forward.
ALTER TABLE "icecast_listener_samples" ADD COLUMN "source_up" BOOLEAN NOT NULL DEFAULT true;

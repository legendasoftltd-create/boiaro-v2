-- Closes a TOCTOU race in both goLive (rj.ts) and Studio's startBroadcast
-- (studio.ts): each only checked "is anyone else live on this station"
-- with a findFirst before create(), with nothing atomic stopping two
-- concurrent requests from both passing that check and both going live on
-- the same station — reproduced in production as two overlapping
-- LiveSession rows on the same station_id, which means two RJs' encoders
-- (or two Studio Egress jobs) fighting over the same Icecast mount, with
-- one of them silently never actually reaching listeners.
--
-- A partial unique index makes "at most one live/reconnecting, non-test
-- session per station" an atomic database guarantee instead of an
-- application-level check that can race.
CREATE UNIQUE INDEX "live_sessions_one_live_per_station"
ON "live_sessions" ("station_id")
WHERE "status" IN ('live', 'reconnecting') AND "is_test" = false AND "station_id" IS NOT NULL;

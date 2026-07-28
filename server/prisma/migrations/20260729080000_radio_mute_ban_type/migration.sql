-- Distinguish a listen-level "ban" from the existing chat/request-only "mute".

BEGIN;

ALTER TABLE "radio_mutes" ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'mute';

COMMIT;

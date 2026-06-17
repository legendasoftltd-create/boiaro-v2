-- Stores the trimmed, server-generated preview clip URL for is_preview tracks
-- so playback can be hard-capped to the preview window regardless of any
-- client-side enforcement (background playback, throttled timers, etc.).
ALTER TABLE "audiobook_tracks" ADD COLUMN "preview_audio_url" TEXT;

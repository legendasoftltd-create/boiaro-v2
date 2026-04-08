ALTER TABLE public.audiobook_tracks 
ADD COLUMN media_type text NOT NULL DEFAULT 'audio' 
CHECK (media_type IN ('audio', 'video'));
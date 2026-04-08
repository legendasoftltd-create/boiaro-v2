
-- Create the background-music storage bucket (public for playback)
INSERT INTO storage.buckets (id, name, public)
VALUES ('background-music', 'background-music', true)
ON CONFLICT (id) DO NOTHING;

-- Public read access for all users
CREATE POLICY "Background music is publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'background-music');

-- Only admins can upload background music
CREATE POLICY "Admins can upload background music"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'background-music'
  AND public.has_role(auth.uid(), 'admin')
);

-- Only admins can update background music
CREATE POLICY "Admins can update background music"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'background-music'
  AND public.has_role(auth.uid(), 'admin')
);

-- Only admins can delete background music
CREATE POLICY "Admins can delete background music"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'background-music'
  AND public.has_role(auth.uid(), 'admin')
);

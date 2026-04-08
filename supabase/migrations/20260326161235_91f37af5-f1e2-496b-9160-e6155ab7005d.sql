CREATE POLICY "Admins can manage avatars"
ON storage.objects FOR ALL
USING (bucket_id = 'avatars' AND has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (bucket_id = 'avatars' AND has_role(auth.uid(), 'admin'::app_role));
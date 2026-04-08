
-- ===================== REMOVE PERMISSIVE SELECT POLICIES =====================
-- These allowed any authenticated user to directly download content, bypassing the paywall
DROP POLICY IF EXISTS "Authenticated users can access ebooks" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can access audiobooks" ON storage.objects;

-- ===================== TIGHTEN CREATOR UPLOAD POLICIES =====================
-- Remove blanket "any authenticated user can upload" policies
DROP POLICY IF EXISTS "Creators can upload ebooks" ON storage.objects;
DROP POLICY IF EXISTS "Creators can upload audiobooks" ON storage.objects;

-- Replace with role-checked upload policies
CREATE POLICY "Writers can upload ebooks"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'ebooks' AND (
      has_role(auth.uid(), 'admin') OR
      has_role(auth.uid(), 'writer') OR
      has_role(auth.uid(), 'publisher')
    )
  );

CREATE POLICY "Narrators can upload audiobooks"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'audiobooks' AND (
      has_role(auth.uid(), 'admin') OR
      has_role(auth.uid(), 'narrator') OR
      has_role(auth.uid(), 'publisher')
    )
  );

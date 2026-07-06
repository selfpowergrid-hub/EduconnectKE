-- Student photos: store the binary in Supabase Storage and a short path on the row.
-- Files live at: student-photos/<school_id>/<student_id>.webp
-- Client-side resize + WebP keeps each file ~25-40 KB regardless of source camera.

ALTER TABLE students ADD COLUMN IF NOT EXISTS photo_path TEXT;

-- =================================================================
-- IMPORTANT: Run the steps below in the Supabase dashboard, not here.
-- The Storage bucket and its policies are configured through the
-- Storage UI / API, not through plain table SQL.
-- =================================================================
--
-- 1. Dashboard → Storage → New bucket
--    Name:   student-photos
--    Public: YES (so <img src> works without signed URLs; paths use
--            the student's UUID which is unguessable anyway)
--
-- 2. Dashboard → Storage → student-photos → Policies → New policy
--    Run the policies below in the SQL editor *as a single block*:

/*
-- Anyone can read (bucket is public; this just allows the SELECT call)
CREATE POLICY "student-photos read"
  ON storage.objects FOR SELECT
  USING ( bucket_id = 'student-photos' );

-- Authenticated users can upload / replace / delete photos
-- (school-level scoping is enforced by the path convention; the app
--  always writes to <school_id>/<student_id>.webp)
CREATE POLICY "student-photos insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK ( bucket_id = 'student-photos' );

CREATE POLICY "student-photos update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING ( bucket_id = 'student-photos' );

CREATE POLICY "student-photos delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING ( bucket_id = 'student-photos' );
*/

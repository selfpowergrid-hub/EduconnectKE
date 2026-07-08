-- Parents / guardians per student.
--
-- Each student can have several guardians (father, mother, other), each with
-- their own phone + email + details. Parent login (school code + phone + that
-- child's admission number) verifies the phone against ANY of the student's
-- guardians, so either parent can sign in. Login stays strict and single-child;
-- this table only widens which phones are accepted and enriches the record.
--
-- The legacy students.parent_phone is kept in sync with the primary guardian's
-- phone so existing fee/report code that reads it keeps working.
--
-- Idempotent: guarded table/index/policy/trigger, backfill only fills gaps.

CREATE TABLE IF NOT EXISTS student_guardians (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID NOT NULL REFERENCES school_registrations(id) ON DELETE CASCADE,
  student_id       UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  relationship     TEXT NOT NULL DEFAULT 'guardian',   -- father | mother | guardian | other
  full_name        TEXT,
  phone            TEXT,
  phone_normalized TEXT,                                 -- canonical Kenyan form, for matching
  email            TEXT,
  id_number        TEXT,
  is_primary       BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS student_guardians_student_idx ON student_guardians (student_id);
CREATE INDEX IF NOT EXISTS student_guardians_phone_idx   ON student_guardians (school_id, phone_normalized);

-- Keep phone_normalized derived from phone on every write.
CREATE OR REPLACE FUNCTION public.student_guardians_set_phone_normalized()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.phone_normalized := public.normalize_phone(NEW.phone);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS student_guardians_phone_trg ON student_guardians;
CREATE TRIGGER student_guardians_phone_trg
  BEFORE INSERT OR UPDATE ON student_guardians
  FOR EACH ROW
  EXECUTE FUNCTION public.student_guardians_set_phone_normalized();

-- RLS: same shape as students — the school's admin manages the rows. The
-- parent-portal edge function reads with the service role (bypasses RLS).
ALTER TABLE student_guardians ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS student_guardians_admin_all ON student_guardians;
CREATE POLICY student_guardians_admin_all ON student_guardians
  FOR ALL TO authenticated
  USING (public.is_school_admin(school_id))
  WITH CHECK (public.is_school_admin(school_id));

-- Backfill: seed one guardian per existing student that has a parent_phone,
-- so already-registered parents keep signing in. Skips students that already
-- have guardian rows, so this is safe to re-run.
INSERT INTO student_guardians (school_id, student_id, relationship, phone, is_primary)
SELECT s.school_id, s.id, 'guardian', s.parent_phone, true
FROM students s
WHERE s.parent_phone IS NOT NULL
  AND trim(s.parent_phone) <> ''
  AND NOT EXISTS (SELECT 1 FROM student_guardians g WHERE g.student_id = s.id);

NOTIFY pgrst, 'reload schema';

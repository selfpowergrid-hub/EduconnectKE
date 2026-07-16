-- KEMIS-readiness fields on students + attendance module.
--
-- 1. students: the fields the KEMIS learner register requires that we don't
--    yet hold. All nullable — existing rows are untouched; the KEMIS export
--    report shows coverage % so schools can chase missing values.
--
-- 2. attendance_records: one row per student per day. Teachers and admins of
--    the school mark/read; anon has nothing. UNIQUE(student_id, att_date)
--    makes re-marking an upsert.

ALTER TABLE students ADD COLUMN IF NOT EXISTS upi_number     TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS birth_cert_no  TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS date_of_birth  DATE;
ALTER TABLE students ADD COLUMN IF NOT EXISTS nationality    TEXT DEFAULT 'Kenyan';
ALTER TABLE students ADD COLUMN IF NOT EXISTS special_needs  TEXT;   -- NULL/'' = none

CREATE TABLE IF NOT EXISTS attendance_records (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID NOT NULL REFERENCES school_registrations(id) ON DELETE CASCADE,
  student_id  UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  att_date    DATE NOT NULL,
  status      TEXT NOT NULL DEFAULT 'present',   -- present | absent | late
  level_id    TEXT,                              -- grade code at time of marking
  marked_by   TEXT,                              -- email of the marker
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, att_date)
);

CREATE INDEX IF NOT EXISTS attendance_school_date_idx ON attendance_records (school_id, att_date);
CREATE INDEX IF NOT EXISTS attendance_student_idx     ON attendance_records (student_id);

ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;

-- Any staff member (teacher/admin/finance) of the school can mark and read;
-- user_in_school() is the phase-6 helper used across teacher features.
DROP POLICY IF EXISTS attendance_staff_all ON attendance_records;
CREATE POLICY attendance_staff_all ON attendance_records
  FOR ALL TO authenticated
  USING (public.user_in_school(school_id))
  WITH CHECK (public.user_in_school(school_id));

REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON attendance_records FROM anon;

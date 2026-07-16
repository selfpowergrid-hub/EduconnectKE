-- Class teacher per class (grade code), optionally per stream. Used to
-- auto-fill the "Name/Sign" line under CLASS TEACHER'S REMARKS on report
-- cards. A stream-specific row beats the grade-wide row (stream_id NULL).

CREATE TABLE IF NOT EXISTS class_teachers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  UUID NOT NULL REFERENCES school_registrations(id) ON DELETE CASCADE,
  level_id   TEXT NOT NULL,                                   -- grade code: 'f3', 'g10', ...
  stream_id  UUID REFERENCES streams(id) ON DELETE CASCADE,   -- NULL = whole grade
  staff_id   UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One class teacher per scope. Expression index so the NULL-stream (grade-wide)
-- row is also unique per grade.
CREATE UNIQUE INDEX IF NOT EXISTS class_teachers_scope_uq
  ON class_teachers (school_id, level_id, COALESCE(stream_id, '00000000-0000-0000-0000-000000000000'::uuid));

ALTER TABLE class_teachers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS class_teachers_admin_all ON class_teachers;
CREATE POLICY class_teachers_admin_all ON class_teachers
  FOR ALL TO authenticated
  USING (public.is_school_admin(school_id))
  WITH CHECK (public.is_school_admin(school_id));

DROP POLICY IF EXISTS class_teachers_teacher_select ON class_teachers;
CREATE POLICY class_teachers_teacher_select ON class_teachers
  FOR SELECT TO authenticated
  USING (public.user_in_school(school_id));

REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON class_teachers FROM anon;

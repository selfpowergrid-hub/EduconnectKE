-- General comments for report cards, per role (class teacher / principal),
-- keyed to the student's OVERALL grade band.
--
-- - level_category 'All' = the general school-wide set; a specific grade code
--   ('f3', 'g10', ...) overrides the general set for that class only.
-- - Multiple variants per (role, band, scope) carry the same meaning in
--   different words; the report card picks one deterministically per student
--   so wording varies across a class but stays stable for each student.
-- - Comments may embed tokens resolved at render time:
--   {name} {grade} {mean} {best_subject} {weak_subject}

CREATE TABLE IF NOT EXISTS report_comments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      UUID NOT NULL REFERENCES school_registrations(id) ON DELETE CASCADE,
  role           TEXT NOT NULL,                 -- 'class_teacher' | 'principal'
  grade_band     TEXT NOT NULL,                 -- matches grading_systems.grade (e.g. 'A', 'EE 1')
  level_category TEXT NOT NULL DEFAULT 'All',   -- 'All' = general; else grade code
  variant        SMALLINT NOT NULL DEFAULT 1,   -- 1..n wording variations
  comment        TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, role, grade_band, level_category, variant)
);

CREATE INDEX IF NOT EXISTS report_comments_school_idx ON report_comments (school_id, level_category);

ALTER TABLE report_comments ENABLE ROW LEVEL SECURITY;

-- Admin manages; teachers read (report cards render for teachers too).
DROP POLICY IF EXISTS report_comments_admin_all ON report_comments;
CREATE POLICY report_comments_admin_all ON report_comments
  FOR ALL TO authenticated
  USING (public.is_school_admin(school_id))
  WITH CHECK (public.is_school_admin(school_id));

DROP POLICY IF EXISTS report_comments_teacher_select ON report_comments;
CREATE POLICY report_comments_teacher_select ON report_comments
  FOR SELECT TO authenticated
  USING (public.user_in_school(school_id));

REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON report_comments FROM anon;

-- Phase 6: RLS policies for teacher access.
--
-- These policies ADD teacher access on top of the existing admin policies
-- (which match school_registrations.email = auth.email()).
--
-- They do NOT replace or weaken existing admin policies. If a row matches
-- ANY policy for a given action, access is allowed — so widening for teachers
-- is safe.
--
-- Naming convention: <table>_teacher_<action>

-- =====================================================================
-- Helper functions
-- =====================================================================

-- True if the calling user is the admin of the given school.
-- We use email match because that's how the app already identifies admins.
CREATE OR REPLACE FUNCTION public.is_school_admin(p_school_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_email TEXT;
  match_count INT;
BEGIN
  caller_email := auth.jwt() ->> 'email';
  IF caller_email IS NULL THEN RETURN FALSE; END IF;

  SELECT count(*) INTO match_count
  FROM school_registrations
  WHERE id = p_school_id
    AND lower(email) = lower(caller_email);

  RETURN match_count > 0;
END;
$$;

-- staff_id of the currently authenticated teacher (or NULL if not a teacher).
CREATE OR REPLACE FUNCTION public.current_teacher_staff_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sid UUID;
BEGIN
  SELECT id INTO sid FROM staff WHERE auth_user_id = auth.uid() LIMIT 1;
  RETURN sid;
END;
$$;

-- True if the authenticated teacher covers this class (any subject).
CREATE OR REPLACE FUNCTION public.teacher_covers_class(
  p_school_id UUID,
  p_level_id  TEXT,
  p_stream_id UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tid UUID;
  hit INT;
BEGIN
  tid := public.current_teacher_staff_id();
  IF tid IS NULL THEN RETURN FALSE; END IF;

  SELECT count(*) INTO hit
  FROM teacher_assignments
  WHERE teacher_staff_id = tid
    AND school_id = p_school_id
    AND level_id = p_level_id
    AND (stream_id IS NULL OR stream_id = p_stream_id);
  RETURN hit > 0;
END;
$$;

-- True if the authenticated teacher covers this (subject, class) pair.
CREATE OR REPLACE FUNCTION public.teacher_covers_subject_class(
  p_school_id  UUID,
  p_subject_id UUID,
  p_level_id   TEXT,
  p_stream_id  UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tid UUID;
  hit INT;
BEGIN
  tid := public.current_teacher_staff_id();
  IF tid IS NULL THEN RETURN FALSE; END IF;

  SELECT count(*) INTO hit
  FROM teacher_assignments
  WHERE teacher_staff_id = tid
    AND school_id = p_school_id
    AND subject_id = p_subject_id
    AND level_id = p_level_id
    AND (stream_id IS NULL OR stream_id = p_stream_id);
  RETURN hit > 0;
END;
$$;

-- True if the authenticated user belongs (admin or teacher) to this school.
CREATE OR REPLACE FUNCTION public.user_in_school(p_school_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tid UUID;
  cnt INT;
BEGIN
  IF public.is_school_admin(p_school_id) THEN RETURN TRUE; END IF;

  tid := public.current_teacher_staff_id();
  IF tid IS NULL THEN RETURN FALSE; END IF;

  SELECT count(*) INTO cnt FROM staff
  WHERE id = tid AND school_id = p_school_id;
  RETURN cnt > 0;
END;
$$;


-- =====================================================================
-- students: teachers SELECT only students in classes they cover
-- =====================================================================

ALTER TABLE students ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS students_teacher_select ON students;
CREATE POLICY students_teacher_select ON students
  FOR SELECT
  TO authenticated
  USING (public.teacher_covers_class(school_id, level_id, stream_id));

-- (No teacher write policies on students — admin-only writes via existing policies.)


-- =====================================================================
-- marks: teachers can read/write only for (their student × their subject)
-- =====================================================================

ALTER TABLE marks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marks_teacher_select ON marks;
CREATE POLICY marks_teacher_select ON marks
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM students s
      WHERE s.id = marks.student_id
        AND public.teacher_covers_subject_class(s.school_id, marks.subject_id, s.level_id, s.stream_id)
    )
  );

DROP POLICY IF EXISTS marks_teacher_insert ON marks;
CREATE POLICY marks_teacher_insert ON marks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM students s
      WHERE s.id = marks.student_id
        AND public.teacher_covers_subject_class(s.school_id, marks.subject_id, s.level_id, s.stream_id)
    )
  );

DROP POLICY IF EXISTS marks_teacher_update ON marks;
CREATE POLICY marks_teacher_update ON marks
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM students s
      WHERE s.id = marks.student_id
        AND public.teacher_covers_subject_class(s.school_id, marks.subject_id, s.level_id, s.stream_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM students s
      WHERE s.id = marks.student_id
        AND public.teacher_covers_subject_class(s.school_id, marks.subject_id, s.level_id, s.stream_id)
    )
  );

DROP POLICY IF EXISTS marks_teacher_delete ON marks;
CREATE POLICY marks_teacher_delete ON marks
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM students s
      WHERE s.id = marks.student_id
        AND public.teacher_covers_subject_class(s.school_id, marks.subject_id, s.level_id, s.stream_id)
    )
  );


-- =====================================================================
-- exams: teachers read-only for their school
-- =====================================================================

ALTER TABLE exams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS exams_teacher_select ON exams;
CREATE POLICY exams_teacher_select ON exams
  FOR SELECT
  TO authenticated
  USING (public.user_in_school(school_id));


-- =====================================================================
-- teacher_assignments: replace the temporary phase-1 policy with real ones
-- =====================================================================

DROP POLICY IF EXISTS teacher_assignments_temp_all ON teacher_assignments;

DROP POLICY IF EXISTS teacher_assignments_admin_all ON teacher_assignments;
CREATE POLICY teacher_assignments_admin_all ON teacher_assignments
  FOR ALL
  TO authenticated
  USING (public.is_school_admin(school_id))
  WITH CHECK (public.is_school_admin(school_id));

DROP POLICY IF EXISTS teacher_assignments_teacher_select_own ON teacher_assignments;
CREATE POLICY teacher_assignments_teacher_select_own ON teacher_assignments
  FOR SELECT
  TO authenticated
  USING (teacher_staff_id = public.current_teacher_staff_id());


-- =====================================================================
-- staff: teachers SELECT-only on their own row + read other staff names
--        (read-other is needed so the app can render co-teacher info)
-- =====================================================================

ALTER TABLE staff ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_teacher_select_own ON staff;
CREATE POLICY staff_teacher_select_own ON staff
  FOR SELECT
  TO authenticated
  USING (
    auth_user_id = auth.uid()
    OR public.user_in_school(school_id)
  );


-- =====================================================================
-- Read-only reference tables: teachers need SELECT for the UI to work
-- =====================================================================

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'subjects',
    'streams',
    'grading_systems',
    'school_information',
    'school_registrations'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- enable RLS if not already
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);

    -- teacher select policy (uses user_in_school, which matches school_id col)
    EXECUTE format('DROP POLICY IF EXISTS %I_teacher_select ON %I', t, t);

    IF t = 'school_registrations' THEN
      -- school_registrations is its own scope; the row IS the school
      EXECUTE format($f$
        CREATE POLICY %I_teacher_select ON %I
        FOR SELECT TO authenticated
        USING (public.user_in_school(id))
      $f$, t, t);
    ELSE
      EXECUTE format($f$
        CREATE POLICY %I_teacher_select ON %I
        FOR SELECT TO authenticated
        USING (public.user_in_school(school_id))
      $f$, t, t);
    END IF;
  END LOOP;
END;
$$;


-- =====================================================================
-- Notes
-- =====================================================================
-- Tables intentionally NOT touched here:
--   fees, fee_payments, mpesa_transactions, library_*  → teachers should
--   have no access. Existing admin-only policies remain authoritative.
--
-- If you discover a query that breaks for a teacher in testing, the fix
-- is almost always to extend the relevant table with a teacher_* SELECT
-- policy gated by public.user_in_school(school_id).

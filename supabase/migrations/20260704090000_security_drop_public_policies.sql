-- Phase 8 hardening — CRITICAL security fix.
--
-- Removes leftover development-time "Allow public ..." RLS policies that
-- granted the anon/public role USING(true) access to core tables. As found by
-- the anonymous-access probe, these exposed student PII, staff records, and
-- (via ALL policies) let anonymous users read AND write exam marks.
--
-- Safe-by-construction: for every public policy dropped, an equivalent
-- authenticated policy is created FIRST, so admins/teachers/finance keep
-- working. Admin access uses is_school_admin() (email match — the same helper
-- every fee table already relies on). Existing teacher/finance policies from
-- the phase-6 and fees migrations remain untouched.
--
-- Access paths verified in the app before writing this:
--   - All direct table reads/writes happen post-auth (admin/teacher/finance).
--   - School-code checks use the is_login_code_available RPC, not table reads.
--   - Parent portal + edge functions use the service role (bypasses RLS).
--   => No legitimate anonymous path touches any of these tables.

-- =====================================================================
-- 1. Admin full-access policies (school_id-keyed tables)
-- =====================================================================

-- school_id-keyed tables get a straightforward admin policy.
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'students', 'staff', 'dorms', 'streams',
    'exams', 'grading_systems', 'subjects', 'school_information'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_admin_all ON %I', t, t);
    EXECUTE format($f$
      CREATE POLICY %I_admin_all ON %I
      FOR ALL TO authenticated
      USING (public.is_school_admin(school_id))
      WITH CHECK (public.is_school_admin(school_id))
    $f$, t, t);
  END LOOP;
END;
$$;

-- marks has no school_id; it is scoped through the student (same pattern as
-- the phase-6 teacher policies). Admin = admin of the student's school.
ALTER TABLE marks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS marks_admin_all ON marks;
CREATE POLICY marks_admin_all ON marks
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM students s WHERE s.id = marks.student_id AND public.is_school_admin(s.school_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM students s WHERE s.id = marks.student_id AND public.is_school_admin(s.school_id)));

-- =====================================================================
-- 2. school_registrations — the row IS the school (keyed on id).
--    Owners manage their own school; brand-new users can self-register.
-- =====================================================================

ALTER TABLE school_registrations ENABLE ROW LEVEL SECURITY;

-- SELECT for admins/teachers is already provided by
-- school_registrations_teacher_select USING user_in_school(id) (phase 6),
-- which returns true for the admin too. We only need self insert/update.

DROP POLICY IF EXISTS school_registrations_self_insert ON school_registrations;
CREATE POLICY school_registrations_self_insert ON school_registrations
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS school_registrations_self_update ON school_registrations;
CREATE POLICY school_registrations_self_update ON school_registrations
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_school_admin(id))
  WITH CHECK (user_id = auth.uid() OR public.is_school_admin(id));

-- Admin SELECT fallback (in case a legacy row is not covered by teacher_select).
DROP POLICY IF EXISTS school_registrations_admin_select ON school_registrations;
CREATE POLICY school_registrations_admin_select ON school_registrations
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_school_admin(id));

-- =====================================================================
-- 3. Drop every leftover "Allow public ..." policy (exact names)
-- =====================================================================

DROP POLICY IF EXISTS "Allow public insert for dorms"        ON dorms;
DROP POLICY IF EXISTS "Allow public select for dorms"        ON dorms;
DROP POLICY IF EXISTS "Allow public access exams"            ON exams;
DROP POLICY IF EXISTS "Allow public access grading"          ON grading_systems;
DROP POLICY IF EXISTS "Allow public access marks"            ON marks;
DROP POLICY IF EXISTS "Allow public insert for schools info" ON school_information;
DROP POLICY IF EXISTS "Allow public select for schools info" ON school_information;
DROP POLICY IF EXISTS "Allow public read for schools"        ON school_registrations;
DROP POLICY IF EXISTS "Allow public registration"            ON school_registrations;
DROP POLICY IF EXISTS "Allow public insert for staff"        ON staff;
DROP POLICY IF EXISTS "Allow public select for staff"        ON staff;
DROP POLICY IF EXISTS "Allow public insert for streams"      ON streams;
DROP POLICY IF EXISTS "Allow public select for streams"      ON streams;
DROP POLICY IF EXISTS "Allow public insert for students"     ON students;
DROP POLICY IF EXISTS "Allow public select for students"     ON students;
DROP POLICY IF EXISTS "Allow public access subjects"         ON subjects;

-- =====================================================================
-- 4. Defense in depth: remove anon's table-level DML grants. RLS already
--    gates these, but with no grant AND no policy, anon is doubly denied.
--    authenticated keeps its grants (policies do the scoping).
-- =====================================================================

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'students', 'staff', 'dorms', 'streams', 'exams', 'marks',
    'grading_systems', 'subjects', 'school_information', 'school_registrations'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON %I FROM anon', t);
  END LOOP;
END;
$$;

-- =====================================================================
-- 5. Remove the temporary Phase-8 diagnostic function
-- =====================================================================

DROP FUNCTION IF EXISTS public.diag_rls_state();

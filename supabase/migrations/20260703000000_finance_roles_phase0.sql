-- Fees module — Phase 0: the role wall.
--
-- Adds:
--   staff.app_role                 -- which module shell a staff login works in
--   is_finance_staff()             -- accountant/bursar RLS helper
--   is_finance_reader()            -- accountant/bursar/auditor (read-only access)
--   students_finance_select        -- finance staff can look up students to bill
--   finance policies on voteheads / fee_structures / fee_payments
--   get_student_fee_summary()      -- now callable by finance staff too
--
-- Separation guarantees (nothing here touches teacher/exam policies):
--   - A bursar has no teacher_assignments rows, so the existing policies on
--     marks/exams already return them nothing.
--   - Teachers get no policy on any fee table, so fees stay invisible to them.
--   - Finance staff get SELECT-only on students; admissions writes remain
--     admin-only via the existing policies.

-- =====================================================================
-- 1. staff.app_role
-- =====================================================================

ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS app_role TEXT NOT NULL DEFAULT 'teacher';

DO $$
BEGIN
  ALTER TABLE staff
    ADD CONSTRAINT staff_app_role_check
    CHECK (app_role IN ('teacher', 'exams_officer', 'accountant', 'bursar', 'auditor'));
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$$;

-- =====================================================================
-- 2. RLS helpers
-- =====================================================================

-- True if the caller is finance staff (accountant/bursar) of this school.
CREATE OR REPLACE FUNCTION public.is_finance_staff(p_school_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hit INT;
BEGIN
  IF auth.uid() IS NULL THEN RETURN FALSE; END IF;

  SELECT count(*) INTO hit
  FROM staff
  WHERE auth_user_id = auth.uid()
    AND school_id = p_school_id
    AND app_role IN ('accountant', 'bursar');

  RETURN hit > 0;
END;
$$;

-- True if the caller may READ finance data for this school
-- (finance staff plus the read-only auditor role).
CREATE OR REPLACE FUNCTION public.is_finance_reader(p_school_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hit INT;
BEGIN
  IF auth.uid() IS NULL THEN RETURN FALSE; END IF;

  SELECT count(*) INTO hit
  FROM staff
  WHERE auth_user_id = auth.uid()
    AND school_id = p_school_id
    AND app_role IN ('accountant', 'bursar', 'auditor');

  RETURN hit > 0;
END;
$$;

-- =====================================================================
-- 3. students: finance staff read students to bill/receipt them.
--    No write policy — admissions stay admin-only.
-- =====================================================================

DROP POLICY IF EXISTS students_finance_select ON students;
CREATE POLICY students_finance_select ON students
  FOR SELECT
  TO authenticated
  USING (public.is_finance_reader(school_id));

-- =====================================================================
-- 4. Fee tables: full access for finance staff, read for auditors.
--    (Admin policies from 20260613 remain authoritative alongside.)
-- =====================================================================

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY['voteheads', 'fee_structures', 'fee_payments'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_finance_all ON %I', t, t);
    EXECUTE format($f$
      CREATE POLICY %I_finance_all ON %I
      FOR ALL TO authenticated
      USING (public.is_finance_staff(school_id))
      WITH CHECK (public.is_finance_staff(school_id))
    $f$, t, t);

    EXECUTE format('DROP POLICY IF EXISTS %I_finance_read ON %I', t, t);
    EXECUTE format($f$
      CREATE POLICY %I_finance_read ON %I
      FOR SELECT TO authenticated
      USING (public.is_finance_reader(school_id))
    $f$, t, t);
  END LOOP;
END;
$$;

-- =====================================================================
-- 5. get_student_fee_summary: widen authorization to finance readers.
--    Body otherwise identical to 20260613.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_student_fee_summary(p_student_id UUID, p_year INT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id  UUID;
  v_level_id   TEXT;
  v_fee_level  TEXT;
  v_billed_t1  NUMERIC := 0;
  v_billed_t2  NUMERIC := 0;
  v_billed_t3  NUMERIC := 0;
  v_paid       NUMERIC := 0;
  v_payments   JSONB;
BEGIN
  SELECT school_id, level_id INTO v_school_id, v_level_id
  FROM students WHERE id = p_student_id;
  IF v_school_id IS NULL THEN RETURN NULL; END IF;

  -- Authorization: service-role (no JWT user), the school's admin, or the
  -- school's finance staff/auditor.
  IF auth.uid() IS NOT NULL
     AND NOT public.is_school_admin(v_school_id)
     AND NOT public.is_finance_reader(v_school_id) THEN
    RAISE EXCEPTION 'Not authorized to view fees for this student';
  END IF;

  v_fee_level := public.fee_level_for_grade(v_level_id);

  SELECT COALESCE(SUM(t1), 0), COALESCE(SUM(t2), 0), COALESCE(SUM(t3), 0)
  INTO v_billed_t1, v_billed_t2, v_billed_t3
  FROM fee_structures
  WHERE school_id = v_school_id
    AND fee_level = v_fee_level
    AND year = p_year;

  SELECT COALESCE(SUM(amount), 0) INTO v_paid
  FROM fee_payments
  WHERE student_id = p_student_id AND year = p_year;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', id, 'amount', amount, 'term', term,
        'method', method, 'reference', reference, 'paid_at', paid_at
      ) ORDER BY paid_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_payments
  FROM fee_payments
  WHERE student_id = p_student_id AND year = p_year;

  RETURN jsonb_build_object(
    'year',      p_year,
    'fee_level', v_fee_level,
    'billed',    v_billed_t1 + v_billed_t2 + v_billed_t3,
    'billed_t1', v_billed_t1,
    'billed_t2', v_billed_t2,
    'billed_t3', v_billed_t3,
    'paid',      v_paid,
    'balance',   (v_billed_t1 + v_billed_t2 + v_billed_t3) - v_paid,
    'payments',  v_payments
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_student_fee_summary(UUID, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_fee_summary(UUID, INT) TO authenticated, service_role;

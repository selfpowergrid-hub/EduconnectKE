-- Fees module — Phase 1: structure upgrade.
--
-- Adds:
--   students.dorm_id           -- boarder = student with a dorm bed (nullable)
--   voteheads.applies_to       -- all | boarders | day (who gets billed)
--   voteheads.priority         -- allocation order for Phase 3 payments
--   voteheads.is_active        -- archive instead of hard-delete once in use
--   fee_structures.status      -- draft | published (only published bills)
--   dorms_member_select        -- staff can read dorm names for the UI
--   get_student_fee_summary()  -- billed now respects boarder/day scoping,
--                                 published-only structures, active voteheads
--
-- All changes are additive; existing rows default to the old behaviour
-- (applies_to 'all', status 'published'), so current balances are unchanged.

-- =====================================================================
-- 1. students.dorm_id — assigning a dorm declares the student a boarder
-- =====================================================================

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS dorm_id UUID REFERENCES dorms(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS students_dorm_idx
  ON students (school_id, dorm_id);

-- =====================================================================
-- 2. voteheads: scoping, allocation priority, archive flag
-- =====================================================================

ALTER TABLE voteheads
  ADD COLUMN IF NOT EXISTS applies_to TEXT NOT NULL DEFAULT 'all';

DO $$
BEGIN
  ALTER TABLE voteheads
    ADD CONSTRAINT voteheads_applies_to_check
    CHECK (applies_to IN ('all', 'boarders', 'day'));
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$$;

ALTER TABLE voteheads
  ADD COLUMN IF NOT EXISTS priority INT NOT NULL DEFAULT 100;

ALTER TABLE voteheads
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- =====================================================================
-- 3. fee_structures: draft -> published lifecycle
-- =====================================================================

ALTER TABLE fee_structures
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'published';

DO $$
BEGIN
  ALTER TABLE fee_structures
    ADD CONSTRAINT fee_structures_status_check
    CHECK (status IN ('draft', 'published'));
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$$;

-- =====================================================================
-- 4. dorms: any staff member of the school may read dorm names
--    (needed to render dorm labels; writes stay on existing policies).
--    If RLS is not enabled on dorms this policy is simply inert.
-- =====================================================================

DROP POLICY IF EXISTS dorms_member_select ON dorms;
CREATE POLICY dorms_member_select ON dorms
  FOR SELECT
  TO authenticated
  USING (public.user_in_school(school_id));

-- =====================================================================
-- 5. get_student_fee_summary: billed respects boarder/day scoping.
--    A votehead counts toward a student's bill only when:
--      - its fee_structures row is published, and
--      - the votehead is active, and
--      - applies_to matches the student (dorm_id set => boarder).
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
  v_dorm_id    UUID;
  v_fee_level  TEXT;
  v_billed_t1  NUMERIC := 0;
  v_billed_t2  NUMERIC := 0;
  v_billed_t3  NUMERIC := 0;
  v_paid       NUMERIC := 0;
  v_payments   JSONB;
BEGIN
  SELECT school_id, level_id, dorm_id INTO v_school_id, v_level_id, v_dorm_id
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

  SELECT COALESCE(SUM(fs.t1), 0), COALESCE(SUM(fs.t2), 0), COALESCE(SUM(fs.t3), 0)
  INTO v_billed_t1, v_billed_t2, v_billed_t3
  FROM fee_structures fs
  JOIN voteheads vh ON vh.id = fs.votehead_id
  WHERE fs.school_id = v_school_id
    AND fs.fee_level = v_fee_level
    AND fs.year = p_year
    AND fs.status = 'published'
    AND vh.is_active
    AND (
      vh.applies_to = 'all'
      OR (vh.applies_to = 'boarders' AND v_dorm_id IS NOT NULL)
      OR (vh.applies_to = 'day'      AND v_dorm_id IS NULL)
    );

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
    'year',       p_year,
    'fee_level',  v_fee_level,
    'is_boarder', v_dorm_id IS NOT NULL,
    'billed',     v_billed_t1 + v_billed_t2 + v_billed_t3,
    'billed_t1',  v_billed_t1,
    'billed_t2',  v_billed_t2,
    'billed_t3',  v_billed_t3,
    'paid',       v_paid,
    'balance',    (v_billed_t1 + v_billed_t2 + v_billed_t3) - v_paid,
    'payments',   v_payments
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_student_fee_summary(UUID, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_fee_summary(UUID, INT) TO authenticated, service_role;

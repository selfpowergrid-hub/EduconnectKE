-- Step 1 of the Parent Portal work: a real fees backend + the lookup
-- primitives the parent-portal edge function needs.
--
-- Adds:
--   voteheads             new table  -- fee line items (Tuition, Boarding, ...)
--   fee_structures        new table  -- per (fee_level × votehead × year) term amounts
--   fee_payments          new table  -- payments recorded against a student
--   normalize_phone()                -- canonical phone form for matching
--   fee_level_for_grade()            -- maps a student's level_id -> CBC fee level
--   get_student_fee_summary()        -- one source of truth for billed/paid/balance
--   students_parent_lookup_idx       -- index for (school, normalized phone) lookups
--
-- Mirrors the shape the admin Settings → Fee Structure UI already assumes
-- (voteheads with per-term t1/t2/t3, keyed by CBC fee level), so wiring that
-- page + the admin Fees page to real data in step 2 is a straight swap.
--
-- RLS: all three tables are ADMIN-ONLY (is_school_admin), matching the phase-6
-- note that teachers/parents get no direct fee access. Parents read fees only
-- through get_student_fee_summary(), called server-side with the service role
-- by the parent-portal edge function.

-- =====================================================================
-- 0. Helpers
-- =====================================================================

-- Canonical Kenyan phone form so 0712…, +254712…, 254712…, 712… all match.
CREATE OR REPLACE FUNCTION public.normalize_phone(p TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  digits TEXT;
BEGIN
  IF p IS NULL THEN RETURN NULL; END IF;
  digits := regexp_replace(p, '[^0-9]', '', 'g');   -- keep digits only
  IF digits = '' THEN RETURN NULL; END IF;

  IF length(digits) = 12 AND left(digits, 3) = '254' THEN
    digits := '0' || substring(digits FROM 4);       -- 254XXXXXXXXX -> 0XXXXXXXXX
  ELSIF length(digits) = 9 THEN
    digits := '0' || digits;                         -- 7XXXXXXXX    -> 07XXXXXXXX
  END IF;

  RETURN digits;
END;
$$;

-- Maps a student's level_id (g7, g10, pp1, …) to the CBC fee level used by
-- the fee structure (pp | lower_pri | upper_pri | jss | sss).
CREATE OR REPLACE FUNCTION public.fee_level_for_grade(p_level_id TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_level_id IN ('pp1', 'pp2')        THEN 'pp'
    WHEN p_level_id IN ('g1', 'g2', 'g3')    THEN 'lower_pri'
    WHEN p_level_id IN ('g4', 'g5', 'g6')    THEN 'upper_pri'
    WHEN p_level_id IN ('g7', 'g8', 'g9')    THEN 'jss'
    WHEN p_level_id IN ('g10', 'g11', 'g12') THEN 'sss'
    ELSE NULL
  END;
$$;


-- =====================================================================
-- 1. voteheads — fee line items per school
-- =====================================================================

CREATE TABLE IF NOT EXISTS voteheads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES school_registrations(id) ON DELETE CASCADE,
  code          TEXT NOT NULL,
  description   TEXT NOT NULL,
  display_order INT  NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS voteheads_school_code_idx
  ON voteheads (school_id, code);

ALTER TABLE voteheads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS voteheads_admin_all ON voteheads;
CREATE POLICY voteheads_admin_all ON voteheads
  FOR ALL
  TO authenticated
  USING (public.is_school_admin(school_id))
  WITH CHECK (public.is_school_admin(school_id));


-- =====================================================================
-- 2. fee_structures — per (fee_level × votehead × year) term amounts
-- =====================================================================

CREATE TABLE IF NOT EXISTS fee_structures (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID NOT NULL REFERENCES school_registrations(id) ON DELETE CASCADE,
  fee_level   TEXT NOT NULL,   -- pp | lower_pri | upper_pri | jss | sss
  votehead_id UUID NOT NULL REFERENCES voteheads(id) ON DELETE CASCADE,
  year        INT  NOT NULL,
  t1          NUMERIC NOT NULL DEFAULT 0,
  t2          NUMERIC NOT NULL DEFAULT 0,
  t3          NUMERIC NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per (school, level, votehead, year).
CREATE UNIQUE INDEX IF NOT EXISTS fee_structures_unique_idx
  ON fee_structures (school_id, fee_level, votehead_id, year);

CREATE INDEX IF NOT EXISTS fee_structures_lookup_idx
  ON fee_structures (school_id, fee_level, year);

ALTER TABLE fee_structures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fee_structures_admin_all ON fee_structures;
CREATE POLICY fee_structures_admin_all ON fee_structures
  FOR ALL
  TO authenticated
  USING (public.is_school_admin(school_id))
  WITH CHECK (public.is_school_admin(school_id));


-- =====================================================================
-- 3. fee_payments — payments recorded against a student
-- =====================================================================

CREATE TABLE IF NOT EXISTS fee_payments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID NOT NULL REFERENCES school_registrations(id) ON DELETE CASCADE,
  student_id  UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  amount      NUMERIC NOT NULL CHECK (amount >= 0),
  year        INT  NOT NULL,
  term        INT  CHECK (term IN (1, 2, 3)),   -- optional: which term it's for
  method      TEXT,                              -- cash | mpesa | bank | cheque
  reference   TEXT,
  paid_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_by UUID,                              -- auth.uid() of the admin who entered it
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fee_payments_student_idx
  ON fee_payments (student_id, year);

CREATE INDEX IF NOT EXISTS fee_payments_school_idx
  ON fee_payments (school_id, year);

ALTER TABLE fee_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fee_payments_admin_all ON fee_payments;
CREATE POLICY fee_payments_admin_all ON fee_payments
  FOR ALL
  TO authenticated
  USING (public.is_school_admin(school_id))
  WITH CHECK (public.is_school_admin(school_id));


-- =====================================================================
-- 4. get_student_fee_summary — single source of truth for balances
-- =====================================================================
-- Returns billed (sum of all three terms for the student's fee level/year
-- across voteheads), total paid, balance, and the payment history.
--
-- SECURITY DEFINER so the parent-portal edge function (service role) and the
-- admin UI share one computation. Authorization: admins of the student's
-- school, or service-role calls (auth.uid() IS NULL). Teachers/other users
-- with a session are rejected.

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

  -- Authorization: allow service-role (no JWT user) or this school's admin.
  IF auth.uid() IS NOT NULL AND NOT public.is_school_admin(v_school_id) THEN
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

-- Only authenticated (admins, guarded inside) and the service role may call it.
REVOKE ALL ON FUNCTION public.get_student_fee_summary(UUID, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_fee_summary(UUID, INT) TO authenticated, service_role;


-- =====================================================================
-- 5. Parent-lookup index on students
-- =====================================================================
-- The parent-portal function matches on (school_id, normalized parent_phone)
-- then confirms adm_no. Functional index keeps that lookup fast and
-- format-independent.

CREATE INDEX IF NOT EXISTS students_parent_lookup_idx
  ON students (school_id, public.normalize_phone(parent_phone));

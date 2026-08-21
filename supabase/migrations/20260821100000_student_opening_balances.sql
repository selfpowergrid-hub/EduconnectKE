-- Manual per-student "opening balances" for schools adopting the app mid-year
-- or late in the year, where rebuilding the term-by-term fee structure is not
-- worth it. Against a chosen votehead you enter a single lump sum per student
-- (arbitrary per student), owed for the remaining period.
--
-- mode:
--   'replace' = this balance IS the whole bill; the level fee structure and any
--               fee category are ignored for the student.
--   'add'     = billed ON TOP of the normal fee structure.
--
-- Billing places the lump in the school's current working term and flows it
-- through the same chokepoint every balance / statement / report already reads.

CREATE TABLE IF NOT EXISTS student_opening_balances (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID NOT NULL REFERENCES school_registrations(id) ON DELETE CASCADE,
  student_id  UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  votehead_id UUID NOT NULL REFERENCES voteheads(id) ON DELETE CASCADE,
  year        INT  NOT NULL,
  amount      NUMERIC NOT NULL DEFAULT 0 CHECK (amount >= 0),
  mode        TEXT NOT NULL DEFAULT 'replace' CHECK (mode IN ('replace', 'add')),
  created_by  UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, student_id, votehead_id, year)
);

CREATE INDEX IF NOT EXISTS student_opening_balances_lookup_idx
  ON student_opening_balances (school_id, student_id, year);

ALTER TABLE student_opening_balances ENABLE ROW LEVEL SECURITY;

-- Admins + finance staff manage; finance readers (auditors) read.
DROP POLICY IF EXISTS student_opening_balances_admin_all ON student_opening_balances;
CREATE POLICY student_opening_balances_admin_all ON student_opening_balances
  FOR ALL TO authenticated
  USING (public.is_school_admin(school_id))
  WITH CHECK (public.is_school_admin(school_id));

DROP POLICY IF EXISTS student_opening_balances_finance_all ON student_opening_balances;
CREATE POLICY student_opening_balances_finance_all ON student_opening_balances
  FOR ALL TO authenticated
  USING (public.is_finance_staff(school_id))
  WITH CHECK (public.is_finance_staff(school_id));

DROP POLICY IF EXISTS student_opening_balances_reader_select ON student_opening_balances;
CREATE POLICY student_opening_balances_reader_select ON student_opening_balances
  FOR SELECT TO authenticated
  USING (public.is_finance_reader(school_id));

REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON student_opening_balances FROM anon;

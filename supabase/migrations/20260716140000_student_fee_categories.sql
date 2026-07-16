-- Time-scoped assignment of students to a fee category (a "special" fee
-- structure group, e.g. New Intake / Scholarship).
--
-- Scope is per YEAR and per TERM: t1/t2/t3 booleans say which terms the
-- assignment bills. This is auto-derived from the category's fee structure
-- when assigning — a whole-year structure sets all three; a Term-2-only
-- structure sets t2 alone, so the student leaves the category after Term 2.
--
-- Billing resolves a student's category PER TERM: for term T, the special
-- category applies only if its row for the year has tT = true; otherwise the
-- student falls back to their boarder/day default. Legacy students.fee_category_id
-- still works as a whole-year fallback.

CREATE TABLE IF NOT EXISTS student_fee_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID NOT NULL REFERENCES school_registrations(id) ON DELETE CASCADE,
  student_id  UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES fee_categories(id) ON DELETE CASCADE,
  year        INT  NOT NULL,
  t1          BOOLEAN NOT NULL DEFAULT false,
  t2          BOOLEAN NOT NULL DEFAULT false,
  t3          BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, category_id, year)
);

CREATE INDEX IF NOT EXISTS student_fee_categories_lookup_idx
  ON student_fee_categories (school_id, student_id, year);

ALTER TABLE student_fee_categories ENABLE ROW LEVEL SECURITY;

-- Admins + finance staff manage; finance readers (auditors) read.
DROP POLICY IF EXISTS student_fee_categories_admin_all ON student_fee_categories;
CREATE POLICY student_fee_categories_admin_all ON student_fee_categories
  FOR ALL TO authenticated
  USING (public.is_school_admin(school_id))
  WITH CHECK (public.is_school_admin(school_id));

DROP POLICY IF EXISTS student_fee_categories_finance_all ON student_fee_categories;
CREATE POLICY student_fee_categories_finance_all ON student_fee_categories
  FOR ALL TO authenticated
  USING (public.is_finance_staff(school_id))
  WITH CHECK (public.is_finance_staff(school_id));

DROP POLICY IF EXISTS student_fee_categories_reader_select ON student_fee_categories;
CREATE POLICY student_fee_categories_reader_select ON student_fee_categories
  FOR SELECT TO authenticated
  USING (public.is_finance_reader(school_id));

REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON student_fee_categories FROM anon;

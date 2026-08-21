-- Opening prepayments / credits brought forward for schools adopting the app
-- mid-year: money a student has already paid ahead. A credit is NOT a negative
-- charge — it sits on the settlement side, reducing the student's balance the
-- same way a concession does (billed − paid − concessions − opening credit).
--
-- One carried-forward credit per student per year (money on account, not tied
-- to a votehead). Entered on the Student Balances tab as a NEGATIVE figure.

CREATE TABLE IF NOT EXISTS student_opening_credits (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID NOT NULL REFERENCES school_registrations(id) ON DELETE CASCADE,
  student_id  UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  year        INT  NOT NULL,
  amount      NUMERIC NOT NULL DEFAULT 0 CHECK (amount >= 0), -- magnitude of the credit
  created_by  UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, student_id, year)
);

CREATE INDEX IF NOT EXISTS student_opening_credits_lookup_idx
  ON student_opening_credits (school_id, student_id, year);

ALTER TABLE student_opening_credits ENABLE ROW LEVEL SECURITY;

-- Admins + finance staff manage; finance readers (auditors) read.
DROP POLICY IF EXISTS student_opening_credits_admin_all ON student_opening_credits;
CREATE POLICY student_opening_credits_admin_all ON student_opening_credits
  FOR ALL TO authenticated
  USING (public.is_school_admin(school_id))
  WITH CHECK (public.is_school_admin(school_id));

DROP POLICY IF EXISTS student_opening_credits_finance_all ON student_opening_credits;
CREATE POLICY student_opening_credits_finance_all ON student_opening_credits
  FOR ALL TO authenticated
  USING (public.is_finance_staff(school_id))
  WITH CHECK (public.is_finance_staff(school_id));

DROP POLICY IF EXISTS student_opening_credits_reader_select ON student_opening_credits;
CREATE POLICY student_opening_credits_reader_select ON student_opening_credits
  FOR SELECT TO authenticated
  USING (public.is_finance_reader(school_id));

REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON student_opening_credits FROM anon;

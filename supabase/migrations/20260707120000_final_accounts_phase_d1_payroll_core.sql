-- Final Accounts — Phase D1: Payroll core (Kenyan statutory).
--
-- Adds:
--   is_payroll_staff()       -- admin + bursar ONLY (accountants keep AP/fees
--                               but never see colleagues' salaries)
--   staff_payroll_profiles   -- additive pay profile on the existing staff table
--   payroll_rates            -- statutory rates AS DATA, effective-dated (they
--                               change yearly; history recomputes correctly)
--   payroll_runs             -- one per school-month: draft → approved (→ paid, D2)
--   payslips + payslip_lines -- frozen figures + itemized earnings/deductions
--   RPCs: generate_payroll_run (compute/recompute while draft),
--         approve_payroll_run, delete_payroll_run (draft only)
--
-- Approval posts to the GL via a TRIGGER on payroll_runs (un-bypassable):
--   Dr 5000 Salaries & Wages (gross)      Dr 5010 Employer Contributions
--   Cr 2110 PAYE · Cr 2120 NSSF (both legs) · Cr 2130 SHIF
--   Cr 2140 Housing Levy (both legs) · Cr 2100 Salaries Payable (net)
--
-- Statutory model (rates seeded below reflect 2025/26; new rows, not code
-- changes, when they move):
--   NSSF: 6% employee + 6% employer on pensionable pay up to the upper limit
--   SHIF: 2.75% of gross, minimum 300 (employee only)
--   Housing Levy: 1.5% employee + 1.5% employer
--   PAYE: progressive monthly bands, less personal relief 2,400
--   Taxable pay = gross − NSSF(emp) − SHIF − Housing(emp)  (post-Dec-2024 rule)

-- =====================================================================
-- 1. is_payroll_staff — admin or bursar
-- =====================================================================

CREATE OR REPLACE FUNCTION public.is_payroll_staff(p_school_id UUID)
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
  IF public.is_school_admin(p_school_id) THEN RETURN TRUE; END IF;

  SELECT count(*) INTO hit
  FROM staff
  WHERE auth_user_id = auth.uid()
    AND school_id = p_school_id
    AND app_role = 'bursar';

  RETURN hit > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.is_payroll_staff(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_payroll_staff(UUID) TO authenticated;

-- =====================================================================
-- 2. staff_payroll_profiles
-- =====================================================================

CREATE TABLE IF NOT EXISTS staff_payroll_profiles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id           UUID NOT NULL REFERENCES school_registrations(id) ON DELETE CASCADE,
  staff_id            UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  basic_salary        NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (basic_salary >= 0),
  house_allowance     NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (house_allowance >= 0),
  transport_allowance NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (transport_allowance >= 0),
  other_allowances    NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (other_allowances >= 0),
  kra_pin             TEXT,
  nssf_no             TEXT,
  shif_no             TEXT,
  bank_name           TEXT,
  bank_account_no     TEXT,
  mpesa_no            TEXT,
  pay_grade           TEXT,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by          UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (staff_id)
);

CREATE INDEX IF NOT EXISTS staff_payroll_profiles_school_idx
  ON staff_payroll_profiles (school_id, is_active);

ALTER TABLE staff_payroll_profiles ENABLE ROW LEVEL SECURITY;

-- Payroll staff ONLY — deliberately no finance_all / finance_read here.
DROP POLICY IF EXISTS staff_payroll_profiles_payroll_all ON staff_payroll_profiles;
CREATE POLICY staff_payroll_profiles_payroll_all ON staff_payroll_profiles
  FOR ALL TO authenticated
  USING (public.is_payroll_staff(school_id))
  WITH CHECK (public.is_payroll_staff(school_id));

DROP TRIGGER IF EXISTS staff_payroll_profiles_audit ON staff_payroll_profiles;
CREATE TRIGGER staff_payroll_profiles_audit
  AFTER INSERT OR UPDATE OR DELETE ON staff_payroll_profiles
  FOR EACH ROW EXECUTE FUNCTION public.fee_audit_row();

-- Profile's staff member must belong to the same school.
CREATE OR REPLACE FUNCTION public.staff_payroll_profiles_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM staff s WHERE s.id = NEW.staff_id AND s.school_id = NEW.school_id) THEN
    RAISE EXCEPTION 'Staff member does not belong to this school';
  END IF;
  NEW.updated_at := now();
  NEW.updated_by := COALESCE(auth.uid(), NEW.updated_by);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS staff_payroll_profiles_guard ON staff_payroll_profiles;
CREATE TRIGGER staff_payroll_profiles_guard
  BEFORE INSERT OR UPDATE ON staff_payroll_profiles
  FOR EACH ROW EXECUTE FUNCTION public.staff_payroll_profiles_guard();

-- =====================================================================
-- 3. payroll_rates — national statutory rates, effective-dated, global
-- =====================================================================

CREATE TABLE IF NOT EXISTS payroll_rates (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  effective_from DATE NOT NULL UNIQUE,
  rates          JSONB NOT NULL,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE payroll_rates ENABLE ROW LEVEL SECURITY;

-- Read-only reference data: any signed-in user can read; nobody writes
-- (new rate rows arrive by migration when the law changes).
DROP POLICY IF EXISTS payroll_rates_read ON payroll_rates;
CREATE POLICY payroll_rates_read ON payroll_rates
  FOR SELECT TO authenticated USING (true);

INSERT INTO payroll_rates (effective_from, rates, notes)
VALUES (
  '2025-02-01',
  '{
    "personal_relief_monthly": 2400,
    "paye_bands": [
      {"upto": 24000,  "rate": 0.10},
      {"upto": 32333,  "rate": 0.25},
      {"upto": 500000, "rate": 0.30},
      {"upto": 800000, "rate": 0.325},
      {"upto": null,   "rate": 0.35}
    ],
    "nssf": {"employee_rate": 0.06, "employer_rate": 0.06, "upper_limit": 72000},
    "shif": {"rate": 0.0275, "minimum": 300},
    "housing_levy": {"employee_rate": 0.015, "employer_rate": 0.015},
    "pre_tax_deductions": ["nssf", "shif", "housing_levy"]
  }'::jsonb,
  'FY2025/26: PAYE bands + relief 2,400; NSSF Act 2013 year-3 UEL 72,000; SHIF 2.75% min 300; Housing Levy 1.5%+1.5%; NSSF/SHIF/levy deductible before PAYE (Tax Laws Amendment Act 2024).'
)
ON CONFLICT (effective_from) DO NOTHING;

-- =====================================================================
-- 4. payroll_runs + payslips + payslip_lines
-- =====================================================================

CREATE TABLE IF NOT EXISTS payroll_runs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID NOT NULL REFERENCES school_registrations(id) ON DELETE CASCADE,
  year        INT NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  month       INT NOT NULL CHECK (month BETWEEN 1 AND 12),
  status      TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'paid')),
  rates_id    UUID REFERENCES payroll_rates(id),   -- which statutory table computed it
  approved_at TIMESTAMPTZ,
  approved_by UUID,
  paid_at     TIMESTAMPTZ,
  paid_by     UUID,
  bank_account_id UUID REFERENCES bank_accounts(id),  -- set at mark-paid (D2)
  created_by  UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, year, month)
);

CREATE TABLE IF NOT EXISTS payslips (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id             UUID NOT NULL REFERENCES school_registrations(id) ON DELETE CASCADE,
  run_id                UUID NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  staff_id              UUID NOT NULL REFERENCES staff(id),
  staff_name            TEXT NOT NULL,          -- frozen at generation
  kra_pin               TEXT,
  basic_salary          NUMERIC(14,2) NOT NULL DEFAULT 0,
  house_allowance       NUMERIC(14,2) NOT NULL DEFAULT 0,
  transport_allowance   NUMERIC(14,2) NOT NULL DEFAULT 0,
  other_allowances      NUMERIC(14,2) NOT NULL DEFAULT 0,
  gross_pay             NUMERIC(14,2) NOT NULL DEFAULT 0,
  nssf_employee         NUMERIC(14,2) NOT NULL DEFAULT 0,
  shif                  NUMERIC(14,2) NOT NULL DEFAULT 0,
  housing_levy_employee NUMERIC(14,2) NOT NULL DEFAULT 0,
  taxable_pay           NUMERIC(14,2) NOT NULL DEFAULT 0,
  paye                  NUMERIC(14,2) NOT NULL DEFAULT 0,   -- after personal relief
  net_pay               NUMERIC(14,2) NOT NULL DEFAULT 0,
  nssf_employer         NUMERIC(14,2) NOT NULL DEFAULT 0,
  housing_levy_employer NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (run_id, staff_id)
);

CREATE INDEX IF NOT EXISTS payslips_staff_idx ON payslips (staff_id);

CREATE TABLE IF NOT EXISTS payslip_lines (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  UUID NOT NULL REFERENCES school_registrations(id) ON DELETE CASCADE,
  payslip_id UUID NOT NULL REFERENCES payslips(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('earning', 'deduction', 'employer')),
  label      TEXT NOT NULL,
  amount     NUMERIC(14,2) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS payslip_lines_payslip_idx ON payslip_lines (payslip_id);

ALTER TABLE payroll_runs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE payslips      ENABLE ROW LEVEL SECURITY;
ALTER TABLE payslip_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payroll_runs_payroll_all ON payroll_runs;
CREATE POLICY payroll_runs_payroll_all ON payroll_runs
  FOR ALL TO authenticated
  USING (public.is_payroll_staff(school_id))
  WITH CHECK (public.is_payroll_staff(school_id));

DROP POLICY IF EXISTS payslips_payroll_all ON payslips;
CREATE POLICY payslips_payroll_all ON payslips
  FOR ALL TO authenticated
  USING (public.is_payroll_staff(school_id))
  WITH CHECK (public.is_payroll_staff(school_id));

DROP POLICY IF EXISTS payslip_lines_payroll_all ON payslip_lines;
CREATE POLICY payslip_lines_payroll_all ON payslip_lines
  FOR ALL TO authenticated
  USING (public.is_payroll_staff(school_id))
  WITH CHECK (public.is_payroll_staff(school_id));

DROP TRIGGER IF EXISTS payroll_runs_audit ON payroll_runs;
CREATE TRIGGER payroll_runs_audit
  AFTER INSERT OR UPDATE OR DELETE ON payroll_runs
  FOR EACH ROW EXECUTE FUNCTION public.fee_audit_row();

DROP TRIGGER IF EXISTS payslips_audit ON payslips;
CREATE TRIGGER payslips_audit
  AFTER INSERT OR UPDATE OR DELETE ON payslips
  FOR EACH ROW EXECUTE FUNCTION public.fee_audit_row();

-- Lifecycle: approval freezes figures; only draft runs can be deleted;
-- status can only move forward (draft → approved → paid).
CREATE OR REPLACE FUNCTION public.payroll_runs_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'An approved payroll run cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;

  IF (OLD.status = 'approved' AND NEW.status = 'draft')
     OR (OLD.status = 'paid' AND NEW.status <> 'paid') THEN
    RAISE EXCEPTION 'Payroll status can only move forward';
  END IF;
  IF NEW.year IS DISTINCT FROM OLD.year OR NEW.month IS DISTINCT FROM OLD.month THEN
    RAISE EXCEPTION 'A payroll run''s month cannot change';
  END IF;
  IF NEW.status = 'approved' AND OLD.status = 'draft' THEN
    IF NOT EXISTS (SELECT 1 FROM payslips WHERE run_id = OLD.id) THEN
      RAISE EXCEPTION 'Nothing to approve — generate the run first';
    END IF;
    NEW.approved_at := now();
    NEW.approved_by := COALESCE(NEW.approved_by, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payroll_runs_guard ON payroll_runs;
CREATE TRIGGER payroll_runs_guard
  BEFORE UPDATE OR DELETE ON payroll_runs
  FOR EACH ROW EXECUTE FUNCTION public.payroll_runs_guard();

-- Payslips freeze once the run leaves draft.
CREATE OR REPLACE FUNCTION public.payslips_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_status TEXT;
  v_row    payslips%ROWTYPE;
BEGIN
  v_row := COALESCE(NEW, OLD);
  SELECT status INTO v_status FROM payroll_runs WHERE id = v_row.run_id;
  IF v_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Payslips are frozen once the run is approved';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS payslips_guard ON payslips;
CREATE TRIGGER payslips_guard
  BEFORE INSERT OR UPDATE OR DELETE ON payslips
  FOR EACH ROW EXECUTE FUNCTION public.payslips_guard();

-- =====================================================================
-- 5. GL posting on approval (trigger — un-bypassable)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.payroll_runs_post_gl()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_t          RECORD;
  v_entry_date DATE;
  v_year       INT;
  v_no         INT;
  v_jid        UUID;
  v_memo       TEXT;
  v_acct       RECORD;
  a_salaries UUID; a_contrib UUID; a_paye UUID; a_nssf UUID;
  a_shif UUID; a_housing UUID; a_net UUID;
BEGIN
  IF NOT (NEW.status = 'approved' AND OLD.status = 'draft') THEN
    RETURN NEW;
  END IF;

  SELECT
    COALESCE(SUM(gross_pay), 0)             AS gross,
    COALESCE(SUM(paye), 0)                  AS paye,
    COALESCE(SUM(nssf_employee), 0)         AS nssf_emp,
    COALESCE(SUM(nssf_employer), 0)         AS nssf_er,
    COALESCE(SUM(shif), 0)                  AS shif,
    COALESCE(SUM(housing_levy_employee), 0) AS hl_emp,
    COALESCE(SUM(housing_levy_employer), 0) AS hl_er,
    COALESCE(SUM(net_pay), 0)               AS net
  INTO v_t
  FROM payslips WHERE run_id = NEW.id;

  FOR v_acct IN
    SELECT sys_key, id FROM gl_accounts
    WHERE school_id = NEW.school_id
      AND sys_key IN ('SALARIES_EXPENSE', 'EMPLOYER_CONTRIB', 'PAYE_PAYABLE',
                      'NSSF_PAYABLE', 'SHIF_PAYABLE', 'HOUSING_LEVY_PAYABLE',
                      'SALARIES_PAYABLE')
  LOOP
    CASE v_acct.sys_key
      WHEN 'SALARIES_EXPENSE'     THEN a_salaries := v_acct.id;
      WHEN 'EMPLOYER_CONTRIB'     THEN a_contrib  := v_acct.id;
      WHEN 'PAYE_PAYABLE'         THEN a_paye     := v_acct.id;
      WHEN 'NSSF_PAYABLE'         THEN a_nssf     := v_acct.id;
      WHEN 'SHIF_PAYABLE'         THEN a_shif     := v_acct.id;
      WHEN 'HOUSING_LEVY_PAYABLE' THEN a_housing  := v_acct.id;
      WHEN 'SALARIES_PAYABLE'     THEN a_net      := v_acct.id;
    END CASE;
  END LOOP;
  IF a_salaries IS NULL OR a_contrib IS NULL OR a_paye IS NULL OR a_nssf IS NULL
     OR a_shif IS NULL OR a_housing IS NULL OR a_net IS NULL THEN
    RAISE EXCEPTION 'Payroll ledger accounts missing from the chart of accounts';
  END IF;

  v_entry_date := (make_date(NEW.year, NEW.month, 1) + INTERVAL '1 month - 1 day')::DATE;
  v_year := NEW.year;
  v_memo := 'Payroll ' || to_char(make_date(NEW.year, NEW.month, 1), 'FMMonth YYYY');

  v_no := public.next_fee_doc_no(NEW.school_id, 'JRN', v_year);
  INSERT INTO gl_journals (school_id, journal_no, entry_date, source_type, source_id, memo, posted_by)
  VALUES (NEW.school_id, 'JRN-' || v_year || '-' || lpad(v_no::TEXT, 6, '0'),
          v_entry_date, 'payroll', NEW.id, v_memo, auth.uid())
  RETURNING id INTO v_jid;

  -- Dr gross + employer contributions; Cr each statutory pot + net payable.
  INSERT INTO gl_journal_lines (school_id, journal_id, account_id, debit, credit, narration)
  SELECT NEW.school_id, v_jid, t.account_id, t.debit, t.credit, v_memo || ' — ' || t.what
  FROM (VALUES
    (a_salaries, v_t.gross,                 0::NUMERIC,               'gross salaries'),
    (a_contrib,  v_t.nssf_er + v_t.hl_er,   0::NUMERIC,               'employer contributions'),
    (a_paye,     0::NUMERIC,                v_t.paye,                 'PAYE'),
    (a_nssf,     0::NUMERIC,                v_t.nssf_emp + v_t.nssf_er, 'NSSF'),
    (a_shif,     0::NUMERIC,                v_t.shif,                 'SHIF'),
    (a_housing,  0::NUMERIC,                v_t.hl_emp + v_t.hl_er,   'Housing Levy'),
    (a_net,      0::NUMERIC,                v_t.net,                  'net salaries payable')
  ) AS t(account_id, debit, credit, what)
  WHERE t.debit <> 0 OR t.credit <> 0;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payroll_runs_post_gl ON payroll_runs;
CREATE TRIGGER payroll_runs_post_gl
  AFTER UPDATE ON payroll_runs
  FOR EACH ROW EXECUTE FUNCTION public.payroll_runs_post_gl();

-- =====================================================================
-- 6. Engine RPCs
-- =====================================================================

CREATE OR REPLACE FUNCTION public.generate_payroll_run(
  p_school_id UUID,
  p_year      INT,
  p_month     INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_id     UUID;
  v_status     TEXT;
  v_rates_row  payroll_rates%ROWTYPE;
  v_r          JSONB;
  v_month_end  DATE := (make_date(p_year, p_month, 1) + INTERVAL '1 month - 1 day')::DATE;
  v_p          RECORD;
  v_gross      NUMERIC; v_nssf_emp NUMERIC; v_nssf_er NUMERIC; v_shif NUMERIC;
  v_hl_emp     NUMERIC; v_hl_er NUMERIC; v_taxable NUMERIC; v_paye NUMERIC;
  v_net        NUMERIC; v_relief NUMERIC; v_band JSONB; v_lower NUMERIC;
  v_upto       NUMERIC; v_slice NUMERIC; v_count INT := 0;
  v_slip_id    UUID;
BEGIN
  IF NOT public.is_payroll_staff(p_school_id) THEN
    RAISE EXCEPTION 'Only the school admin or bursar can run payroll';
  END IF;

  -- The statutory table in force at that month's end.
  SELECT * INTO v_rates_row FROM payroll_rates
  WHERE effective_from <= v_month_end
  ORDER BY effective_from DESC LIMIT 1;
  IF v_rates_row.id IS NULL THEN
    RAISE EXCEPTION 'No statutory rates on file for %', v_month_end;
  END IF;
  v_r := v_rates_row.rates;
  v_relief := COALESCE((v_r->>'personal_relief_monthly')::NUMERIC, 0);

  -- Get or create the run; recompute only while draft.
  SELECT id, status INTO v_run_id, v_status FROM payroll_runs
  WHERE school_id = p_school_id AND year = p_year AND month = p_month;
  IF v_run_id IS NULL THEN
    INSERT INTO payroll_runs (school_id, year, month, rates_id, created_by)
    VALUES (p_school_id, p_year, p_month, v_rates_row.id, auth.uid())
    RETURNING id INTO v_run_id;
  ELSIF v_status <> 'draft' THEN
    RAISE EXCEPTION 'Payroll for %/% is already %', p_month, p_year, v_status;
  ELSE
    DELETE FROM payslips WHERE run_id = v_run_id;   -- lines cascade
    UPDATE payroll_runs SET rates_id = v_rates_row.id WHERE id = v_run_id;
  END IF;

  FOR v_p IN
    SELECT pp.*, s.full_name
    FROM staff_payroll_profiles pp
    JOIN staff s ON s.id = pp.staff_id
    WHERE pp.school_id = p_school_id AND pp.is_active
      AND (pp.basic_salary + pp.house_allowance + pp.transport_allowance + pp.other_allowances) > 0
    ORDER BY s.full_name
  LOOP
    v_gross := round(v_p.basic_salary + v_p.house_allowance
                     + v_p.transport_allowance + v_p.other_allowances, 2);

    v_nssf_emp := round(LEAST(v_gross, (v_r#>>'{nssf,upper_limit}')::NUMERIC)
                        * (v_r#>>'{nssf,employee_rate}')::NUMERIC, 2);
    v_nssf_er  := round(LEAST(v_gross, (v_r#>>'{nssf,upper_limit}')::NUMERIC)
                        * (v_r#>>'{nssf,employer_rate}')::NUMERIC, 2);
    v_shif     := round(GREATEST(v_gross * (v_r#>>'{shif,rate}')::NUMERIC,
                                 (v_r#>>'{shif,minimum}')::NUMERIC), 2);
    v_hl_emp   := round(v_gross * (v_r#>>'{housing_levy,employee_rate}')::NUMERIC, 2);
    v_hl_er    := round(v_gross * (v_r#>>'{housing_levy,employer_rate}')::NUMERIC, 2);

    -- Post-Dec-2024: statutory deductions come off before tax.
    v_taxable := GREATEST(v_gross - v_nssf_emp - v_shif - v_hl_emp, 0);

    -- Progressive PAYE over the monthly bands, less personal relief.
    v_paye := 0; v_lower := 0;
    FOR v_band IN SELECT * FROM jsonb_array_elements(v_r->'paye_bands') LOOP
      v_upto := NULLIF(v_band->>'upto', '')::NUMERIC;   -- null = no ceiling
      v_slice := LEAST(v_taxable, COALESCE(v_upto, v_taxable)) - v_lower;
      EXIT WHEN v_slice <= 0;
      v_paye := v_paye + v_slice * (v_band->>'rate')::NUMERIC;
      v_lower := COALESCE(v_upto, v_taxable);
    END LOOP;
    v_paye := round(GREATEST(v_paye - v_relief, 0), 2);

    v_net := round(v_gross - v_nssf_emp - v_shif - v_hl_emp - v_paye, 2);

    INSERT INTO payslips (school_id, run_id, staff_id, staff_name, kra_pin,
                          basic_salary, house_allowance, transport_allowance, other_allowances,
                          gross_pay, nssf_employee, shif, housing_levy_employee,
                          taxable_pay, paye, net_pay, nssf_employer, housing_levy_employer)
    VALUES (p_school_id, v_run_id, v_p.staff_id, v_p.full_name, v_p.kra_pin,
            v_p.basic_salary, v_p.house_allowance, v_p.transport_allowance, v_p.other_allowances,
            v_gross, v_nssf_emp, v_shif, v_hl_emp,
            round(v_taxable, 2), v_paye, v_net, v_nssf_er, v_hl_er)
    RETURNING id INTO v_slip_id;

    INSERT INTO payslip_lines (school_id, payslip_id, kind, label, amount, sort_order)
    SELECT p_school_id, v_slip_id, t.kind, t.label, t.amount, t.ord
    FROM (VALUES
      ('earning',   'Basic salary',          v_p.basic_salary,        1),
      ('earning',   'House allowance',       v_p.house_allowance,     2),
      ('earning',   'Transport allowance',   v_p.transport_allowance, 3),
      ('earning',   'Other allowances',      v_p.other_allowances,    4),
      ('deduction', 'NSSF',                  v_nssf_emp,              5),
      ('deduction', 'SHIF',                  v_shif,                  6),
      ('deduction', 'Housing Levy',          v_hl_emp,                7),
      ('deduction', 'PAYE',                  v_paye,                  8),
      ('employer',  'NSSF (employer)',       v_nssf_er,               9),
      ('employer',  'Housing Levy (employer)', v_hl_er,              10)
    ) AS t(kind, label, amount, ord)
    WHERE t.amount <> 0;

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'run_id', v_run_id, 'payslips', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.generate_payroll_run(UUID, INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_payroll_run(UUID, INT, INT) TO authenticated;

CREATE OR REPLACE FUNCTION public.approve_payroll_run(p_school_id UUID, p_run_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_payroll_staff(p_school_id) THEN
    RAISE EXCEPTION 'Only the school admin or bursar can approve payroll';
  END IF;
  UPDATE payroll_runs SET status = 'approved'
  WHERE id = p_run_id AND school_id = p_school_id AND status = 'draft';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Run not found or not a draft';
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.approve_payroll_run(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_payroll_run(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_payroll_run(p_school_id UUID, p_run_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_payroll_staff(p_school_id) THEN
    RAISE EXCEPTION 'Only the school admin or bursar can manage payroll';
  END IF;
  DELETE FROM payroll_runs
  WHERE id = p_run_id AND school_id = p_school_id AND status = 'draft';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Run not found (approved runs cannot be deleted)';
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_payroll_run(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_payroll_run(UUID, UUID) TO authenticated;

-- Final Accounts — Phase D2: payroll payment, statutory remittances, P9 data.
--
-- Adds:
--   payslips.paye_before_relief / personal_relief -- stored so the P9 card can
--                                 show Tax Charged and Relief exactly as computed
--   pay_payroll_run()          -- approved → paid: Dr 2100 Salaries Payable (net),
--                                 Cr the paying bank account (trigger-posted)
--   statutory_payments         -- remittances to KRA / NSSF / SHA / Housing:
--                                 Dr the statutory payable, Cr bank. Void reverses.
--   pay_statutory() / void_statutory_payment()
--   get_statutory_summary()    -- per month: due (from approved runs) vs remitted
--   get_p9()                   -- an employee's annual tax card (monthly rows)
--
-- Muster roll / payroll register print is client-side from payslips (already
-- readable by payroll staff) — no extra RPC needed.

-- =====================================================================
-- 1. Exact-relief columns for the P9 (D1 stored PAYE net of relief only)
-- =====================================================================

ALTER TABLE payslips
  ADD COLUMN IF NOT EXISTS paye_before_relief NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS personal_relief    NUMERIC(14,2) NOT NULL DEFAULT 0;

-- Regenerate-in-place: generate_payroll_run now also stores the pre-relief tax
-- and the relief actually used (relief cannot exceed the tax charged).
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
  v_tax_before NUMERIC; v_relief_used NUMERIC;
  v_net        NUMERIC; v_relief NUMERIC; v_band JSONB; v_lower NUMERIC;
  v_upto       NUMERIC; v_slice NUMERIC; v_count INT := 0;
  v_slip_id    UUID;
BEGIN
  IF NOT public.is_payroll_staff(p_school_id) THEN
    RAISE EXCEPTION 'Only the school admin or bursar can run payroll';
  END IF;

  SELECT * INTO v_rates_row FROM payroll_rates
  WHERE effective_from <= v_month_end
  ORDER BY effective_from DESC LIMIT 1;
  IF v_rates_row.id IS NULL THEN
    RAISE EXCEPTION 'No statutory rates on file for %', v_month_end;
  END IF;
  v_r := v_rates_row.rates;
  v_relief := COALESCE((v_r->>'personal_relief_monthly')::NUMERIC, 0);

  SELECT id, status INTO v_run_id, v_status FROM payroll_runs
  WHERE school_id = p_school_id AND year = p_year AND month = p_month;
  IF v_run_id IS NULL THEN
    INSERT INTO payroll_runs (school_id, year, month, rates_id, created_by)
    VALUES (p_school_id, p_year, p_month, v_rates_row.id, auth.uid())
    RETURNING id INTO v_run_id;
  ELSIF v_status <> 'draft' THEN
    RAISE EXCEPTION 'Payroll for %/% is already %', p_month, p_year, v_status;
  ELSE
    DELETE FROM payslips WHERE run_id = v_run_id;
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

    v_taxable := GREATEST(v_gross - v_nssf_emp - v_shif - v_hl_emp, 0);

    v_tax_before := 0; v_lower := 0;
    FOR v_band IN SELECT * FROM jsonb_array_elements(v_r->'paye_bands') LOOP
      v_upto := NULLIF(v_band->>'upto', '')::NUMERIC;
      v_slice := LEAST(v_taxable, COALESCE(v_upto, v_taxable)) - v_lower;
      EXIT WHEN v_slice <= 0;
      v_tax_before := v_tax_before + v_slice * (v_band->>'rate')::NUMERIC;
      v_lower := COALESCE(v_upto, v_taxable);
    END LOOP;
    v_tax_before  := round(v_tax_before, 2);
    v_relief_used := LEAST(v_tax_before, v_relief);
    v_paye        := round(v_tax_before - v_relief_used, 2);

    v_net := round(v_gross - v_nssf_emp - v_shif - v_hl_emp - v_paye, 2);

    INSERT INTO payslips (school_id, run_id, staff_id, staff_name, kra_pin,
                          basic_salary, house_allowance, transport_allowance, other_allowances,
                          gross_pay, nssf_employee, shif, housing_levy_employee,
                          taxable_pay, paye, net_pay, nssf_employer, housing_levy_employer,
                          paye_before_relief, personal_relief)
    VALUES (p_school_id, v_run_id, v_p.staff_id, v_p.full_name, v_p.kra_pin,
            v_p.basic_salary, v_p.house_allowance, v_p.transport_allowance, v_p.other_allowances,
            v_gross, v_nssf_emp, v_shif, v_hl_emp,
            round(v_taxable, 2), v_paye, v_net, v_nssf_er, v_hl_er,
            v_tax_before, v_relief_used)
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

-- =====================================================================
-- 2. Mark a run paid — guard requires a paying account; trigger posts GL
-- =====================================================================

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
  IF NEW.status = 'paid' AND OLD.status = 'approved' THEN
    IF NEW.bank_account_id IS NULL THEN
      RAISE EXCEPTION 'Say which account the salaries were paid from';
    END IF;
    NEW.paid_at := now();
    NEW.paid_by := COALESCE(NEW.paid_by, auth.uid());
  END IF;
  IF NEW.status = 'paid' AND OLD.status = 'draft' THEN
    RAISE EXCEPTION 'Approve the run before marking it paid';
  END IF;
  RETURN NEW;
END;
$$;

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
  v_bank_gl    UUID;
  a_salaries UUID; a_contrib UUID; a_paye UUID; a_nssf UUID;
  a_shif UUID; a_housing UUID; a_net UUID;
  v_approve BOOLEAN := (NEW.status = 'approved' AND OLD.status = 'draft');
  v_pay     BOOLEAN := (NEW.status = 'paid'     AND OLD.status = 'approved');
BEGIN
  IF NOT v_approve AND NOT v_pay THEN
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

  v_year := EXTRACT(YEAR FROM current_date)::INT;
  v_memo := 'Payroll ' || to_char(make_date(NEW.year, NEW.month, 1), 'FMMonth YYYY');

  IF v_pay THEN
    -- Dr net salaries payable, Cr the paying account.
    SELECT id INTO a_net FROM gl_accounts
    WHERE school_id = NEW.school_id AND sys_key = 'SALARIES_PAYABLE';
    SELECT gl_account_id INTO v_bank_gl FROM bank_accounts
    WHERE id = NEW.bank_account_id AND school_id = NEW.school_id;
    IF a_net IS NULL OR v_bank_gl IS NULL THEN
      RAISE EXCEPTION 'Ledger accounts missing for salary payment';
    END IF;

    v_no := public.next_fee_doc_no(NEW.school_id, 'JRN', v_year);
    INSERT INTO gl_journals (school_id, journal_no, entry_date, source_type, source_id, memo, posted_by)
    VALUES (NEW.school_id, 'JRN-' || v_year || '-' || lpad(v_no::TEXT, 6, '0'),
            current_date, 'payroll_payment', NEW.id, v_memo || ' — net salaries paid', auth.uid())
    RETURNING id INTO v_jid;

    INSERT INTO gl_journal_lines (school_id, journal_id, account_id, debit, credit, narration)
    VALUES
      (NEW.school_id, v_jid, a_net,     v_t.net, 0, v_memo || ' — net salaries paid'),
      (NEW.school_id, v_jid, v_bank_gl, 0, v_t.net, v_memo || ' — net salaries paid');

    RETURN NEW;
  END IF;

  -- Approval journal (unchanged from D1).
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

  v_no := public.next_fee_doc_no(NEW.school_id, 'JRN', v_year);
  INSERT INTO gl_journals (school_id, journal_no, entry_date, source_type, source_id, memo, posted_by)
  VALUES (NEW.school_id, 'JRN-' || v_year || '-' || lpad(v_no::TEXT, 6, '0'),
          v_entry_date, 'payroll', NEW.id, v_memo, auth.uid())
  RETURNING id INTO v_jid;

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

CREATE OR REPLACE FUNCTION public.pay_payroll_run(
  p_school_id       UUID,
  p_run_id          UUID,
  p_bank_account_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_payroll_staff(p_school_id) THEN
    RAISE EXCEPTION 'Only the school admin or bursar can pay salaries';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM bank_accounts
                 WHERE id = p_bank_account_id AND school_id = p_school_id AND is_active) THEN
    RAISE EXCEPTION 'Unknown or inactive paying account';
  END IF;
  UPDATE payroll_runs SET status = 'paid', bank_account_id = p_bank_account_id
  WHERE id = p_run_id AND school_id = p_school_id AND status = 'approved';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Run not found or not approved';
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.pay_payroll_run(UUID, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pay_payroll_run(UUID, UUID, UUID) TO authenticated;

-- =====================================================================
-- 3. statutory_payments — remittances to KRA / NSSF / SHA / Housing
-- =====================================================================

CREATE TABLE IF NOT EXISTS statutory_payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID NOT NULL REFERENCES school_registrations(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL CHECK (kind IN ('paye', 'nssf', 'shif', 'housing_levy')),
  bank_account_id UUID NOT NULL REFERENCES bank_accounts(id),
  amount          NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  paid_at         DATE NOT NULL DEFAULT current_date,
  period_year     INT,                 -- which payroll month it settles
  period_month    INT CHECK (period_month BETWEEN 1 AND 12),
  reference       TEXT,                -- KRA slip / bank ref
  memo            TEXT,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'voided')),
  void_reason     TEXT,
  voided_at       TIMESTAMPTZ,
  voided_by       UUID,
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS statutory_payments_school_idx
  ON statutory_payments (school_id, period_year, period_month);

ALTER TABLE statutory_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS statutory_payments_payroll_all ON statutory_payments;
CREATE POLICY statutory_payments_payroll_all ON statutory_payments
  FOR ALL TO authenticated
  USING (public.is_payroll_staff(school_id))
  WITH CHECK (public.is_payroll_staff(school_id));

DROP TRIGGER IF EXISTS statutory_payments_audit ON statutory_payments;
CREATE TRIGGER statutory_payments_audit
  AFTER INSERT OR UPDATE OR DELETE ON statutory_payments
  FOR EACH ROW EXECUTE FUNCTION public.fee_audit_row();

CREATE OR REPLACE FUNCTION public.statutory_payments_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Remittances are never deleted — void them instead';
  END IF;
  IF TG_OP = 'INSERT' THEN RETURN NEW; END IF;
  IF OLD.status = 'voided' THEN
    RAISE EXCEPTION 'This remittance is void and cannot change';
  END IF;
  IF NEW.status = 'voided' THEN
    IF NULLIF(trim(COALESCE(NEW.void_reason, '')), '') IS NULL THEN
      RAISE EXCEPTION 'A reason is required to void a remittance';
    END IF;
    NEW.voided_at := now();
    NEW.voided_by := COALESCE(NEW.voided_by, auth.uid());
  ELSIF (NEW.kind IS DISTINCT FROM OLD.kind
      OR NEW.amount IS DISTINCT FROM OLD.amount
      OR NEW.bank_account_id IS DISTINCT FROM OLD.bank_account_id
      OR NEW.paid_at IS DISTINCT FROM OLD.paid_at) THEN
    RAISE EXCEPTION 'A remittance cannot be edited — void it and record afresh';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS statutory_payments_guard ON statutory_payments;
CREATE TRIGGER statutory_payments_guard
  BEFORE INSERT OR UPDATE OR DELETE ON statutory_payments
  FOR EACH ROW EXECUTE FUNCTION public.statutory_payments_guard();

-- GL: Dr the statutory payable, Cr bank; void reverses.
CREATE OR REPLACE FUNCTION public.statutory_payments_post_gl()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key     TEXT;
  v_payable UUID;
  v_bank_gl UUID;
  v_year    INT;
  v_no      INT;
  v_jid     UUID;
  v_void    BOOLEAN := (TG_OP = 'UPDATE');
  v_memo    TEXT;
BEGIN
  IF v_void AND NOT (NEW.status = 'voided' AND OLD.status = 'active') THEN
    RETURN NEW;
  END IF;

  v_key := CASE NEW.kind
    WHEN 'paye'         THEN 'PAYE_PAYABLE'
    WHEN 'nssf'         THEN 'NSSF_PAYABLE'
    WHEN 'shif'         THEN 'SHIF_PAYABLE'
    WHEN 'housing_levy' THEN 'HOUSING_LEVY_PAYABLE'
  END;
  SELECT id INTO v_payable FROM gl_accounts
  WHERE school_id = NEW.school_id AND sys_key = v_key;
  SELECT gl_account_id INTO v_bank_gl FROM bank_accounts WHERE id = NEW.bank_account_id;
  IF v_payable IS NULL OR v_bank_gl IS NULL THEN
    RAISE EXCEPTION 'Ledger accounts missing for statutory remittance';
  END IF;

  v_year := EXTRACT(YEAR FROM CASE WHEN v_void THEN current_date ELSE NEW.paid_at END)::INT;
  v_memo := CASE WHEN v_void THEN 'VOID ' ELSE '' END
            || upper(replace(NEW.kind, '_', ' ')) || ' remittance'
            || COALESCE(' ' || NEW.period_month || '/' || NEW.period_year, '')
            || COALESCE(' — ' || NEW.reference, '');

  v_no := public.next_fee_doc_no(NEW.school_id, 'JRN', v_year);
  INSERT INTO gl_journals (school_id, journal_no, entry_date, source_type, source_id, memo, posted_by)
  VALUES (NEW.school_id, 'JRN-' || v_year || '-' || lpad(v_no::TEXT, 6, '0'),
          CASE WHEN v_void THEN current_date ELSE NEW.paid_at END,
          CASE WHEN v_void THEN 'statutory_void' ELSE 'statutory' END,
          NEW.id, v_memo, auth.uid())
  RETURNING id INTO v_jid;

  IF v_void THEN
    INSERT INTO gl_journal_lines (school_id, journal_id, account_id, debit, credit, narration)
    VALUES
      (NEW.school_id, v_jid, v_bank_gl, NEW.amount, 0, v_memo),
      (NEW.school_id, v_jid, v_payable, 0, NEW.amount, v_memo);
  ELSE
    INSERT INTO gl_journal_lines (school_id, journal_id, account_id, debit, credit, narration)
    VALUES
      (NEW.school_id, v_jid, v_payable, NEW.amount, 0, v_memo),
      (NEW.school_id, v_jid, v_bank_gl, 0, NEW.amount, v_memo);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS statutory_payments_post_gl ON statutory_payments;
CREATE TRIGGER statutory_payments_post_gl
  AFTER INSERT OR UPDATE ON statutory_payments
  FOR EACH ROW EXECUTE FUNCTION public.statutory_payments_post_gl();

CREATE OR REPLACE FUNCTION public.pay_statutory(
  p_school_id       UUID,
  p_kind            TEXT,
  p_bank_account_id UUID,
  p_amount          NUMERIC,
  p_paid_at         DATE DEFAULT NULL,
  p_period_year     INT DEFAULT NULL,
  p_period_month    INT DEFAULT NULL,
  p_reference       TEXT DEFAULT NULL,
  p_memo            TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF NOT public.is_payroll_staff(p_school_id) THEN
    RAISE EXCEPTION 'Only the school admin or bursar can record remittances';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM bank_accounts
                 WHERE id = p_bank_account_id AND school_id = p_school_id AND is_active) THEN
    RAISE EXCEPTION 'Unknown or inactive paying account';
  END IF;

  INSERT INTO statutory_payments (school_id, kind, bank_account_id, amount, paid_at,
                                  period_year, period_month, reference, memo, created_by)
  VALUES (p_school_id, p_kind, p_bank_account_id, round(p_amount, 2),
          COALESCE(p_paid_at, current_date), p_period_year, p_period_month,
          NULLIF(trim(COALESCE(p_reference, '')), ''),
          NULLIF(trim(COALESCE(p_memo, '')), ''), auth.uid())
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

REVOKE ALL ON FUNCTION public.pay_statutory(UUID, TEXT, UUID, NUMERIC, DATE, INT, INT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pay_statutory(UUID, TEXT, UUID, NUMERIC, DATE, INT, INT, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.void_statutory_payment(p_school_id UUID, p_id UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_payroll_staff(p_school_id) THEN
    RAISE EXCEPTION 'Only the school admin or bursar can void remittances';
  END IF;
  UPDATE statutory_payments SET status = 'voided', void_reason = p_reason
  WHERE id = p_id AND school_id = p_school_id AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Remittance not found (or already void)';
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.void_statutory_payment(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_statutory_payment(UUID, UUID, TEXT) TO authenticated;

-- =====================================================================
-- 4. get_statutory_summary — due (approved runs) vs remitted, per month
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_statutory_summary(
  p_school_id UUID,
  p_year      INT,
  p_month     INT
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_due  RECORD;
  v_paid RECORD;
BEGIN
  IF NOT public.is_payroll_staff(p_school_id) THEN
    RAISE EXCEPTION 'Only the school admin or bursar can read statutory balances';
  END IF;

  SELECT
    COALESCE(SUM(p.paye), 0)                                          AS paye,
    COALESCE(SUM(p.nssf_employee + p.nssf_employer), 0)               AS nssf,
    COALESCE(SUM(p.shif), 0)                                          AS shif,
    COALESCE(SUM(p.housing_levy_employee + p.housing_levy_employer), 0) AS housing_levy
  INTO v_due
  FROM payslips p
  JOIN payroll_runs r ON r.id = p.run_id
  WHERE r.school_id = p_school_id AND r.year = p_year AND r.month = p_month
    AND r.status IN ('approved', 'paid');

  SELECT
    COALESCE(SUM(amount) FILTER (WHERE kind = 'paye'), 0)         AS paye,
    COALESCE(SUM(amount) FILTER (WHERE kind = 'nssf'), 0)         AS nssf,
    COALESCE(SUM(amount) FILTER (WHERE kind = 'shif'), 0)         AS shif,
    COALESCE(SUM(amount) FILTER (WHERE kind = 'housing_levy'), 0) AS housing_levy
  INTO v_paid
  FROM statutory_payments
  WHERE school_id = p_school_id AND status = 'active'
    AND period_year = p_year AND period_month = p_month;

  RETURN jsonb_build_array(
    jsonb_build_object('kind', 'paye',         'label', 'PAYE (KRA)',          'due', v_due.paye,         'paid', v_paid.paye,         'balance', v_due.paye - v_paid.paye),
    jsonb_build_object('kind', 'nssf',         'label', 'NSSF',                'due', v_due.nssf,         'paid', v_paid.nssf,         'balance', v_due.nssf - v_paid.nssf),
    jsonb_build_object('kind', 'shif',         'label', 'SHIF (SHA)',          'due', v_due.shif,         'paid', v_paid.shif,         'balance', v_due.shif - v_paid.shif),
    jsonb_build_object('kind', 'housing_levy', 'label', 'Housing Levy (KRA)',  'due', v_due.housing_levy, 'paid', v_paid.housing_levy, 'balance', v_due.housing_levy - v_paid.housing_levy)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_statutory_summary(UUID, INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_statutory_summary(UUID, INT, INT) TO authenticated;

-- =====================================================================
-- 5. get_p9 — an employee's annual tax deduction card
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_p9(
  p_school_id UUID,
  p_staff_id  UUID,
  p_year      INT
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows JSONB;
  v_name TEXT;
  v_pin  TEXT;
BEGIN
  IF NOT public.is_payroll_staff(p_school_id) THEN
    RAISE EXCEPTION 'Only the school admin or bursar can produce P9 cards';
  END IF;

  SELECT COALESCE(jsonb_agg(row ORDER BY (row->>'month')::INT), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT jsonb_build_object(
      'month',        r.month,
      'basic',        p.basic_salary,
      'benefits',     p.house_allowance + p.transport_allowance + p.other_allowances,
      'gross',        p.gross_pay,
      'pension',      p.nssf_employee,           -- defined contribution (E)
      'shif',         p.shif,
      'housing_levy', p.housing_levy_employee,
      'taxable',      p.taxable_pay,
      'tax_charged',  p.paye_before_relief,
      'relief',       p.personal_relief,
      'paye',         p.paye
    ) AS row
    FROM payslips p
    JOIN payroll_runs r ON r.id = p.run_id
    WHERE r.school_id = p_school_id AND r.year = p_year
      AND r.status IN ('approved', 'paid')
      AND p.staff_id = p_staff_id
  ) t;

  SELECT p.staff_name, p.kra_pin INTO v_name, v_pin
  FROM payslips p
  JOIN payroll_runs r ON r.id = p.run_id
  WHERE r.school_id = p_school_id AND r.year = p_year AND p.staff_id = p_staff_id
  ORDER BY r.month DESC LIMIT 1;

  RETURN jsonb_build_object(
    'staff_name', COALESCE(v_name, ''),
    'kra_pin',    COALESCE(v_pin, ''),
    'year',       p_year,
    'months',     v_rows
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_p9(UUID, UUID, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_p9(UUID, UUID, INT) TO authenticated;

-- Final Accounts — Phase A: General Ledger core.
--
-- Adds:
--   gl_accounts          -- per-school Chart of Accounts (seeded Kenyan-school
--                           template; sys_key rows are referenced by bridges/reports)
--   gl_journals          -- journal headers (JRN-YYYY-NNNNNN), append-only
--   gl_journal_lines     -- one debit/credit leg per row
--   post_gl_journal()    -- guarded manual-journal entry point (balance enforced)
--   Fee-ledger BRIDGE    -- every fee_ledger_entries row mirrors into the GL
--                           automatically (trigger) + idempotent backfill
--
-- The fees engine is untouched: it keeps posting to fee_ledger_entries exactly
-- as before; this migration only listens.
--
-- Fee → GL account mapping (by sys_key, so renames/recodes are safe):
--   AR          → FEES_RECEIVABLE (1100)
--   FEE_INCOME  → FEE_INCOME      (4000)
--   CASH        → MPESA / CASH_HAND / BANK_MAIN by the payment's method
--   CONCESSION  → CONCESSIONS     (6000)
--   BURSARY     → CONCESSIONS     (6000)

-- =====================================================================
-- 1. gl_accounts — Chart of Accounts
-- =====================================================================

CREATE TABLE IF NOT EXISTS gl_accounts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  UUID NOT NULL REFERENCES school_registrations(id) ON DELETE CASCADE,
  code       TEXT NOT NULL,             -- '1010', '5100', ...
  name       TEXT NOT NULL,
  type       TEXT NOT NULL CHECK (type IN ('asset', 'liability', 'equity', 'income', 'expense')),
  subtype    TEXT,                      -- 'bank' | 'receivable' | 'statutory' | ...
  sys_key    TEXT,                      -- stable key for accounts the system itself posts to
  is_system  BOOLEAN NOT NULL DEFAULT false,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, code)
);

CREATE UNIQUE INDEX IF NOT EXISTS gl_accounts_sys_key_idx
  ON gl_accounts (school_id, sys_key) WHERE sys_key IS NOT NULL;

ALTER TABLE gl_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gl_accounts_admin_all ON gl_accounts;
CREATE POLICY gl_accounts_admin_all ON gl_accounts
  FOR ALL TO authenticated
  USING (public.is_school_admin(school_id))
  WITH CHECK (public.is_school_admin(school_id));

DROP POLICY IF EXISTS gl_accounts_finance_all ON gl_accounts;
CREATE POLICY gl_accounts_finance_all ON gl_accounts
  FOR ALL TO authenticated
  USING (public.is_finance_staff(school_id))
  WITH CHECK (public.is_finance_staff(school_id));

DROP POLICY IF EXISTS gl_accounts_finance_read ON gl_accounts;
CREATE POLICY gl_accounts_finance_read ON gl_accounts
  FOR SELECT TO authenticated
  USING (public.is_finance_reader(school_id));

-- System accounts: reports and bridges depend on them. Rename freely, but
-- their identity (sys_key/type) is fixed and they can never be deleted.
CREATE OR REPLACE FUNCTION public.gl_accounts_protect()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.is_system THEN
      RAISE EXCEPTION 'System account "%" cannot be deleted — deactivate it instead', OLD.name;
    END IF;
    IF EXISTS (SELECT 1 FROM gl_journal_lines l WHERE l.account_id = OLD.id) THEN
      RAISE EXCEPTION 'Account "%" has ledger entries — deactivate it instead', OLD.name;
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.is_system AND (NEW.sys_key IS DISTINCT FROM OLD.sys_key
                        OR NEW.type IS DISTINCT FROM OLD.type
                        OR NEW.is_system IS DISTINCT FROM OLD.is_system) THEN
    RAISE EXCEPTION 'System account "%": only the code and name can be changed', OLD.name;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS gl_accounts_protect ON gl_accounts;
CREATE TRIGGER gl_accounts_protect
  BEFORE UPDATE OR DELETE ON gl_accounts
  FOR EACH ROW EXECUTE FUNCTION public.gl_accounts_protect();

-- Audit alongside the other finance config tables.
DROP TRIGGER IF EXISTS gl_accounts_audit ON gl_accounts;
CREATE TRIGGER gl_accounts_audit
  AFTER INSERT OR UPDATE OR DELETE ON gl_accounts
  FOR EACH ROW EXECUTE FUNCTION public.fee_audit_row();

-- =====================================================================
-- 2. Seed the Kenyan-school chart (existing schools + every future one)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.seed_gl_accounts(p_school_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO gl_accounts (school_id, code, name, type, subtype, sys_key, is_system)
  VALUES
    (p_school_id, '1000', 'Cash in Hand (Petty Cash)',          'asset',     'cash',        'CASH_HAND',            true),
    (p_school_id, '1010', 'Bank — Main Account',                'asset',     'bank',        'BANK_MAIN',            true),
    (p_school_id, '1020', 'M-PESA Paybill',                     'asset',     'mpesa',       'MPESA',                true),
    (p_school_id, '1100', 'Fees Receivable',                    'asset',     'receivable',  'FEES_RECEIVABLE',      true),
    (p_school_id, '1200', 'Other Receivables',                  'asset',     'receivable',  NULL,                   false),
    (p_school_id, '1500', 'Fixed Assets',                       'asset',     'fixed_asset', NULL,                   false),
    (p_school_id, '2000', 'Suppliers Payable',                  'liability', 'payable',     'SUPPLIERS_PAYABLE',    true),
    (p_school_id, '2100', 'Salaries Payable',                   'liability', 'payroll',     'SALARIES_PAYABLE',     true),
    (p_school_id, '2110', 'PAYE Payable',                       'liability', 'statutory',   'PAYE_PAYABLE',         true),
    (p_school_id, '2120', 'NSSF Payable',                       'liability', 'statutory',   'NSSF_PAYABLE',         true),
    (p_school_id, '2130', 'SHIF Payable',                       'liability', 'statutory',   'SHIF_PAYABLE',         true),
    (p_school_id, '2140', 'Housing Levy Payable',               'liability', 'statutory',   'HOUSING_LEVY_PAYABLE', true),
    (p_school_id, '2200', 'Prepaid Fees (unearned)',            'liability', 'unearned',    'PREPAID_FEES',         true),
    (p_school_id, '3000', 'Accumulated Fund',                   'equity',    'fund',        'ACCUMULATED_FUND',     true),
    (p_school_id, '4000', 'Fee Income',                         'income',    'fees',        'FEE_INCOME',           true),
    (p_school_id, '4100', 'Other Income',                       'income',    'other',       'OTHER_INCOME',         true),
    (p_school_id, '5000', 'Salaries & Wages',                   'expense',   'payroll',     'SALARIES_EXPENSE',     true),
    (p_school_id, '5010', 'Employer Statutory Contributions',   'expense',   'payroll',     'EMPLOYER_CONTRIB',     true),
    (p_school_id, '5100', 'Food & Boarding',                    'expense',   'operating',   NULL,                   false),
    (p_school_id, '5200', 'Transport & Fuel',                   'expense',   'operating',   NULL,                   false),
    (p_school_id, '5300', 'Utilities (Power & Water)',          'expense',   'operating',   NULL,                   false),
    (p_school_id, '5400', 'Repairs & Maintenance',              'expense',   'operating',   NULL,                   false),
    (p_school_id, '5500', 'Learning Materials',                 'expense',   'operating',   NULL,                   false),
    (p_school_id, '5600', 'Administration & Office',            'expense',   'operating',   NULL,                   false),
    (p_school_id, '5700', 'Communication & Internet',           'expense',   'operating',   NULL,                   false),
    (p_school_id, '5800', 'Activity & Sports',                  'expense',   'operating',   NULL,                   false),
    (p_school_id, '5900', 'Miscellaneous Expenses',             'expense',   'operating',   NULL,                   false),
    (p_school_id, '6000', 'Bursaries & Concessions',            'expense',   'concession',  'CONCESSIONS',          true)
  ON CONFLICT (school_id, code) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.seed_gl_accounts(UUID) FROM PUBLIC, anon, authenticated;

SELECT public.seed_gl_accounts(sr.id) FROM school_registrations sr;

CREATE OR REPLACE FUNCTION public.seed_gl_accounts_on_school()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.seed_gl_accounts(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS school_registrations_seed_gl_accounts ON school_registrations;
CREATE TRIGGER school_registrations_seed_gl_accounts
  AFTER INSERT ON school_registrations
  FOR EACH ROW EXECUTE FUNCTION public.seed_gl_accounts_on_school();

-- =====================================================================
-- 3. gl_journals + gl_journal_lines (append-only, like fee_ledger_entries)
-- =====================================================================

CREATE TABLE IF NOT EXISTS gl_journals (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID NOT NULL REFERENCES school_registrations(id) ON DELETE CASCADE,
  journal_no  TEXT NOT NULL,
  entry_date  DATE NOT NULL DEFAULT current_date,
  source_type TEXT NOT NULL,             -- 'fees' | 'manual' | 'ap_*' | 'payroll_*' ...
  source_id   UUID,                      -- e.g. fee_ledger txn_group
  memo        TEXT,
  posted_by   UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, journal_no)
);

CREATE INDEX IF NOT EXISTS gl_journals_school_idx ON gl_journals (school_id, entry_date);
CREATE INDEX IF NOT EXISTS gl_journals_source_idx ON gl_journals (source_type, source_id);

CREATE TABLE IF NOT EXISTS gl_journal_lines (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES school_registrations(id) ON DELETE CASCADE,
  journal_id    UUID NOT NULL REFERENCES gl_journals(id) ON DELETE CASCADE,
  account_id    UUID NOT NULL REFERENCES gl_accounts(id),
  debit         NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (debit  >= 0),
  credit        NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  student_id    UUID REFERENCES students(id) ON DELETE SET NULL,
  votehead_id   UUID REFERENCES voteheads(id),
  fee_ledger_id UUID,                    -- bridged fee_ledger_entries row (idempotency)
  narration     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (debit = 0 OR credit = 0)        -- one leg per row
);

CREATE INDEX IF NOT EXISTS gl_journal_lines_journal_idx ON gl_journal_lines (journal_id);
CREATE INDEX IF NOT EXISTS gl_journal_lines_account_idx ON gl_journal_lines (account_id);
CREATE INDEX IF NOT EXISTS gl_journal_lines_school_idx  ON gl_journal_lines (school_id);
CREATE UNIQUE INDEX IF NOT EXISTS gl_journal_lines_fee_ledger_idx
  ON gl_journal_lines (fee_ledger_id) WHERE fee_ledger_id IS NOT NULL;

ALTER TABLE gl_journals      ENABLE ROW LEVEL SECURITY;
ALTER TABLE gl_journal_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gl_journals_read ON gl_journals;
CREATE POLICY gl_journals_read ON gl_journals
  FOR SELECT TO authenticated
  USING (public.is_school_admin(school_id) OR public.is_finance_reader(school_id));

DROP POLICY IF EXISTS gl_journal_lines_read ON gl_journal_lines;
CREATE POLICY gl_journal_lines_read ON gl_journal_lines
  FOR SELECT TO authenticated
  USING (public.is_school_admin(school_id) OR public.is_finance_reader(school_id));

-- No INSERT/UPDATE/DELETE policies: writes only via SECURITY DEFINER functions.
-- Append-only guard (reuses the fees blocker).
DROP TRIGGER IF EXISTS gl_journals_no_update ON gl_journals;
CREATE TRIGGER gl_journals_no_update
  BEFORE UPDATE ON gl_journals
  FOR EACH ROW EXECUTE FUNCTION public.fee_ledger_block_update();

DROP TRIGGER IF EXISTS gl_journal_lines_no_update ON gl_journal_lines;
CREATE TRIGGER gl_journal_lines_no_update
  BEFORE UPDATE ON gl_journal_lines
  FOR EACH ROW EXECUTE FUNCTION public.fee_ledger_block_update();

-- =====================================================================
-- 4. post_gl_journal — the guarded write path for manual journals
--    (later phases post through their own definer triggers/RPCs)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.post_gl_journal(
  p_school_id  UUID,
  p_entry_date DATE,
  p_memo       TEXT,
  p_lines      JSONB     -- [{account_id, debit, credit, narration?, student_id?}, ...]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_line       JSONB;
  v_debits     NUMERIC := 0;
  v_credits    NUMERIC := 0;
  v_year       INT := EXTRACT(YEAR FROM COALESCE(p_entry_date, current_date))::INT;
  v_no         INT;
  v_journal_no TEXT;
  v_jid        UUID;
  v_acct       RECORD;
BEGIN
  IF NOT public.is_school_admin(p_school_id)
     AND NOT public.is_finance_staff(p_school_id) THEN
    RAISE EXCEPTION 'Not authorized to post journal entries';
  END IF;
  IF p_lines IS NULL OR jsonb_array_length(p_lines) < 2 THEN
    RAISE EXCEPTION 'A journal needs at least two lines';
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    SELECT id, is_active INTO v_acct FROM gl_accounts
    WHERE id = (v_line->>'account_id')::UUID AND school_id = p_school_id;
    IF v_acct.id IS NULL THEN
      RAISE EXCEPTION 'Unknown ledger account on journal line';
    END IF;
    IF NOT v_acct.is_active THEN
      RAISE EXCEPTION 'Cannot post to a deactivated account';
    END IF;
    v_debits  := v_debits  + COALESCE((v_line->>'debit')::NUMERIC, 0);
    v_credits := v_credits + COALESCE((v_line->>'credit')::NUMERIC, 0);
  END LOOP;

  IF v_debits <= 0 OR round(v_debits, 2) <> round(v_credits, 2) THEN
    RAISE EXCEPTION 'Journal does not balance: debits % vs credits %', v_debits, v_credits;
  END IF;

  v_no := public.next_fee_doc_no(p_school_id, 'JRN', v_year);
  v_journal_no := 'JRN-' || v_year || '-' || lpad(v_no::TEXT, 6, '0');

  INSERT INTO gl_journals (school_id, journal_no, entry_date, source_type, memo, posted_by)
  VALUES (p_school_id, v_journal_no, COALESCE(p_entry_date, current_date), 'manual', p_memo, auth.uid())
  RETURNING id INTO v_jid;

  INSERT INTO gl_journal_lines (school_id, journal_id, account_id, debit, credit, student_id, narration)
  SELECT p_school_id, v_jid,
         (l->>'account_id')::UUID,
         COALESCE((l->>'debit')::NUMERIC, 0),
         COALESCE((l->>'credit')::NUMERIC, 0),
         NULLIF(l->>'student_id', '')::UUID,
         l->>'narration'
  FROM jsonb_array_elements(p_lines) AS l;

  RETURN jsonb_build_object('ok', true, 'journal_id', v_jid, 'journal_no', v_journal_no);
END;
$$;

REVOKE ALL ON FUNCTION public.post_gl_journal(UUID, DATE, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_gl_journal(UUID, DATE, TEXT, JSONB) TO authenticated;

-- =====================================================================
-- 5. Fee-ledger bridge — mirror every fee_ledger_entries row into the GL
-- =====================================================================
-- One GL journal per fee txn_group (fees always post in balanced pairs).
-- If the mapped account is missing (COA not seeded), the fee posting still
-- succeeds — the bridge never blocks fee collection.

CREATE OR REPLACE FUNCTION public.gl_bridge_fee_entry(e fee_ledger_entries)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jid    UUID;
  v_key    TEXT;
  v_method TEXT;
  v_acct   UUID;
  v_year   INT := EXTRACT(YEAR FROM e.entry_date)::INT;
  v_no     INT;
BEGIN
  -- Resolve the GL account for this fee-ledger leg.
  v_key := CASE e.account
    WHEN 'AR'         THEN 'FEES_RECEIVABLE'
    WHEN 'FEE_INCOME' THEN 'FEE_INCOME'
    WHEN 'CONCESSION' THEN 'CONCESSIONS'
    WHEN 'BURSARY'    THEN 'CONCESSIONS'
    ELSE NULL
  END;
  IF e.account = 'CASH' THEN
    IF e.source_type IN ('payment', 'payment_void') THEN
      SELECT lower(COALESCE(method, '')) INTO v_method
      FROM fee_payments WHERE id = e.source_id;
    END IF;
    v_key := CASE
      WHEN v_method LIKE '%pesa%' THEN 'MPESA'
      WHEN v_method = 'cash'      THEN 'CASH_HAND'
      ELSE 'BANK_MAIN'
    END;
  END IF;
  IF v_key IS NULL THEN RETURN; END IF;

  SELECT id INTO v_acct FROM gl_accounts
  WHERE school_id = e.school_id AND sys_key = v_key;
  IF v_acct IS NULL THEN RETURN; END IF;

  -- Find (or open) the journal for this fee transaction group.
  SELECT id INTO v_jid FROM gl_journals
  WHERE school_id = e.school_id AND source_type = 'fees' AND source_id = e.txn_group;
  IF v_jid IS NULL THEN
    v_no := public.next_fee_doc_no(e.school_id, 'JRN', v_year);
    INSERT INTO gl_journals (school_id, journal_no, entry_date, source_type, source_id, memo, posted_by)
    VALUES (e.school_id, 'JRN-' || v_year || '-' || lpad(v_no::TEXT, 6, '0'),
            e.entry_date, 'fees', e.txn_group, e.narration, e.created_by)
    RETURNING id INTO v_jid;
  END IF;

  INSERT INTO gl_journal_lines (school_id, journal_id, account_id, debit, credit,
                                student_id, votehead_id, fee_ledger_id, narration)
  VALUES (e.school_id, v_jid, v_acct, e.debit, e.credit,
          e.student_id, e.votehead_id, e.id, e.narration)
  ON CONFLICT (fee_ledger_id) WHERE fee_ledger_id IS NOT NULL DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.gl_bridge_fee_entry(fee_ledger_entries) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.gl_bridge_fee_ledger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.gl_bridge_fee_entry(NEW);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fee_ledger_entries_gl_bridge ON fee_ledger_entries;
CREATE TRIGGER fee_ledger_entries_gl_bridge
  AFTER INSERT ON fee_ledger_entries
  FOR EACH ROW EXECUTE FUNCTION public.gl_bridge_fee_ledger();

-- =====================================================================
-- 6. Backfill — bridge all fee-ledger history into the GL (idempotent:
--    the unique fee_ledger_id index makes re-runs no-ops)
-- =====================================================================

DO $$
DECLARE
  e fee_ledger_entries%ROWTYPE;
BEGIN
  FOR e IN
    SELECT le.* FROM fee_ledger_entries le
    WHERE NOT EXISTS (
      SELECT 1 FROM gl_journal_lines l WHERE l.fee_ledger_id = le.id
    )
    ORDER BY le.created_at, le.txn_group
  LOOP
    PERFORM public.gl_bridge_fee_entry(e);
  END LOOP;
END;
$$;

-- Final Accounts — Phase B: Banking & Cash Accounts.
--
-- Adds:
--   bank_accounts              -- the school's money locations (bank | mpesa |
--                                 petty_cash), each linked to a GL asset account.
--                                 One of each kind seeded per school → 1010/1020/1000.
--   fee_payments.bank_account_id  -- where a collection landed (nullable; defaulted
--                                 from the payment method by trigger + backfill).
--   gl_bridge_fee_entry()      -- UPGRADED: CASH legs now post to the payment's
--                                 bank account's GL account when set (method map
--                                 stays as the fallback — old rows bridge the same).
--   record_bank_transfer()     -- guarded RPC: move money between two accounts
--                                 (petty-cash top-up, M-PESA sweep). Posts a
--                                 balanced GL journal; reversal = opposite transfer.
--   get_cashbook()             -- per-account chronological in/out with opening
--                                 and running balances (the bursar's cashbook).
--
-- Nothing in the fees engine changes behavior: defaulting is a BEFORE trigger,
-- the ledger/bridge chain is untouched in shape, and all writes stay behind
-- SECURITY DEFINER functions.

-- =====================================================================
-- 1. bank_accounts
-- =====================================================================

CREATE TABLE IF NOT EXISTS bank_accounts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES school_registrations(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('bank', 'mpesa', 'petty_cash')),
  bank_name     TEXT,
  branch        TEXT,
  account_no    TEXT,                -- bank account no / paybill no
  gl_account_id UUID NOT NULL REFERENCES gl_accounts(id),
  is_default    BOOLEAN NOT NULL DEFAULT false,   -- where this kind's collections land
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, name)
);

-- One default per kind per school.
CREATE UNIQUE INDEX IF NOT EXISTS bank_accounts_default_idx
  ON bank_accounts (school_id, kind) WHERE is_default;

ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bank_accounts_admin_all ON bank_accounts;
CREATE POLICY bank_accounts_admin_all ON bank_accounts
  FOR ALL TO authenticated
  USING (public.is_school_admin(school_id))
  WITH CHECK (public.is_school_admin(school_id));

DROP POLICY IF EXISTS bank_accounts_finance_all ON bank_accounts;
CREATE POLICY bank_accounts_finance_all ON bank_accounts
  FOR ALL TO authenticated
  USING (public.is_finance_staff(school_id))
  WITH CHECK (public.is_finance_staff(school_id));

DROP POLICY IF EXISTS bank_accounts_finance_read ON bank_accounts;
CREATE POLICY bank_accounts_finance_read ON bank_accounts
  FOR SELECT TO authenticated
  USING (public.is_finance_reader(school_id));

DROP TRIGGER IF EXISTS bank_accounts_audit ON bank_accounts;
CREATE TRIGGER bank_accounts_audit
  AFTER INSERT OR UPDATE OR DELETE ON bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.fee_audit_row();

-- An account that has been posted to can only be deactivated, never deleted.
CREATE OR REPLACE FUNCTION public.bank_accounts_protect()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM fee_payments p WHERE p.bank_account_id = OLD.id)
     OR EXISTS (
       SELECT 1 FROM gl_journal_lines l
       WHERE l.account_id = OLD.gl_account_id AND l.school_id = OLD.school_id
     ) THEN
    RAISE EXCEPTION 'Account "%" has transactions — deactivate it instead', OLD.name;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS bank_accounts_protect ON bank_accounts;
CREATE TRIGGER bank_accounts_protect
  BEFORE DELETE ON bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.bank_accounts_protect();

-- =====================================================================
-- 2. Seed one account of each kind (existing schools + future ones)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.seed_bank_accounts(p_school_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec RECORD;
BEGIN
  -- The GL chart must exist first (idempotent — no-op when already seeded).
  PERFORM public.seed_gl_accounts(p_school_id);

  FOR v_rec IN
    SELECT * FROM (VALUES
      ('Petty Cash',          'petty_cash', 'CASH_HAND'),
      ('Bank — Main Account', 'bank',       'BANK_MAIN'),
      ('M-PESA Paybill',      'mpesa',      'MPESA')
    ) AS t(name, kind, sys_key)
  LOOP
    INSERT INTO bank_accounts (school_id, name, kind, gl_account_id, is_default)
    SELECT p_school_id, v_rec.name, v_rec.kind, a.id,
           NOT EXISTS (SELECT 1 FROM bank_accounts b
                       WHERE b.school_id = p_school_id AND b.kind = v_rec.kind AND b.is_default)
    FROM gl_accounts a
    WHERE a.school_id = p_school_id AND a.sys_key = v_rec.sys_key
      AND NOT EXISTS (SELECT 1 FROM bank_accounts b
                      WHERE b.school_id = p_school_id AND b.kind = v_rec.kind);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.seed_bank_accounts(UUID) FROM PUBLIC, anon, authenticated;

SELECT public.seed_bank_accounts(sr.id) FROM school_registrations sr;

CREATE OR REPLACE FUNCTION public.seed_bank_accounts_on_school()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.seed_bank_accounts(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS school_registrations_seed_bank_accounts ON school_registrations;
CREATE TRIGGER school_registrations_seed_bank_accounts
  AFTER INSERT ON school_registrations
  FOR EACH ROW EXECUTE FUNCTION public.seed_bank_accounts_on_school();

-- =====================================================================
-- 3. fee_payments.bank_account_id — default from method, backfill history
-- =====================================================================

ALTER TABLE fee_payments
  ADD COLUMN IF NOT EXISTS bank_account_id UUID REFERENCES bank_accounts(id);

CREATE INDEX IF NOT EXISTS fee_payments_bank_account_idx
  ON fee_payments (bank_account_id) WHERE bank_account_id IS NOT NULL;

-- method → kind map (cheque and anything unknown lands in the bank).
CREATE OR REPLACE FUNCTION public.bank_kind_for_method(p_method TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN lower(COALESCE(p_method, '')) LIKE '%pesa%' THEN 'mpesa'
    WHEN lower(COALESCE(p_method, '')) = 'cash'      THEN 'petty_cash'
    ELSE 'bank'
  END;
$$;

CREATE OR REPLACE FUNCTION public.fee_payments_default_bank_account()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.bank_account_id IS NULL THEN
    SELECT b.id INTO NEW.bank_account_id
    FROM bank_accounts b
    WHERE b.school_id = NEW.school_id
      AND b.kind = public.bank_kind_for_method(NEW.method)
      AND b.is_active
    ORDER BY b.is_default DESC, b.created_at
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fee_payments_default_bank_account ON fee_payments;
CREATE TRIGGER fee_payments_default_bank_account
  BEFORE INSERT ON fee_payments
  FOR EACH ROW EXECUTE FUNCTION public.fee_payments_default_bank_account();

-- Backfill: existing payments get the same method → default-account map.
UPDATE fee_payments p
SET bank_account_id = b.id
FROM bank_accounts b
WHERE p.bank_account_id IS NULL
  AND b.school_id = p.school_id
  AND b.kind = public.bank_kind_for_method(p.method)
  AND b.is_default;

-- =====================================================================
-- 4. Bridge upgrade — CASH legs follow the payment's bank account
-- =====================================================================

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
    -- Prefer the account the payment was recorded against.
    IF e.source_type IN ('payment', 'payment_void') THEN
      SELECT b.gl_account_id, lower(COALESCE(p.method, ''))
        INTO v_acct, v_method
      FROM fee_payments p
      LEFT JOIN bank_accounts b ON b.id = p.bank_account_id
      WHERE p.id = e.source_id;
    END IF;
    IF v_acct IS NULL THEN
      v_key := CASE
        WHEN v_method LIKE '%pesa%' THEN 'MPESA'
        WHEN v_method = 'cash'      THEN 'CASH_HAND'
        ELSE 'BANK_MAIN'
      END;
    ELSE
      v_key := NULL;  -- already resolved directly
    END IF;
  END IF;

  IF v_acct IS NULL THEN
    IF v_key IS NULL THEN RETURN; END IF;
    SELECT id INTO v_acct FROM gl_accounts
    WHERE school_id = e.school_id AND sys_key = v_key;
    IF v_acct IS NULL THEN RETURN; END IF;
  END IF;

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

-- =====================================================================
-- 5. record_bank_transfer — move money between two accounts
-- =====================================================================

CREATE OR REPLACE FUNCTION public.record_bank_transfer(
  p_school_id UUID,
  p_from_id   UUID,          -- bank_accounts.id money leaves
  p_to_id     UUID,          -- bank_accounts.id money enters
  p_amount    NUMERIC,
  p_date      DATE DEFAULT NULL,
  p_memo      TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from       bank_accounts%ROWTYPE;
  v_to         bank_accounts%ROWTYPE;
  v_date       DATE := COALESCE(p_date, current_date);
  v_year       INT  := EXTRACT(YEAR FROM COALESCE(p_date, current_date))::INT;
  v_no         INT;
  v_journal_no TEXT;
  v_jid        UUID;
  v_memo       TEXT;
BEGIN
  IF NOT public.is_school_admin(p_school_id)
     AND NOT public.is_finance_staff(p_school_id) THEN
    RAISE EXCEPTION 'Not authorized to record transfers';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Transfer amount must be greater than zero';
  END IF;
  IF p_from_id = p_to_id THEN
    RAISE EXCEPTION 'Choose two different accounts';
  END IF;

  SELECT * INTO v_from FROM bank_accounts WHERE id = p_from_id AND school_id = p_school_id;
  SELECT * INTO v_to   FROM bank_accounts WHERE id = p_to_id   AND school_id = p_school_id;
  IF v_from.id IS NULL OR v_to.id IS NULL THEN
    RAISE EXCEPTION 'Unknown account for this school';
  END IF;
  IF NOT v_from.is_active OR NOT v_to.is_active THEN
    RAISE EXCEPTION 'Both accounts must be active';
  END IF;

  v_memo := COALESCE(NULLIF(trim(p_memo), ''),
                     'Transfer: ' || v_from.name || ' → ' || v_to.name);

  v_no := public.next_fee_doc_no(p_school_id, 'JRN', v_year);
  v_journal_no := 'JRN-' || v_year || '-' || lpad(v_no::TEXT, 6, '0');

  INSERT INTO gl_journals (school_id, journal_no, entry_date, source_type, memo, posted_by)
  VALUES (p_school_id, v_journal_no, v_date, 'bank_transfer', v_memo, auth.uid())
  RETURNING id INTO v_jid;

  INSERT INTO gl_journal_lines (school_id, journal_id, account_id, debit, credit, narration)
  VALUES
    (p_school_id, v_jid, v_to.gl_account_id,   round(p_amount, 2), 0, v_memo),
    (p_school_id, v_jid, v_from.gl_account_id, 0, round(p_amount, 2), v_memo);

  RETURN jsonb_build_object('ok', true, 'journal_id', v_jid, 'journal_no', v_journal_no);
END;
$$;

REVOKE ALL ON FUNCTION public.record_bank_transfer(UUID, UUID, UUID, NUMERIC, DATE, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_bank_transfer(UUID, UUID, UUID, NUMERIC, DATE, TEXT) TO authenticated;

-- =====================================================================
-- 6. get_cashbook — chronological in/out with opening + running balance
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_cashbook(
  p_school_id       UUID,
  p_bank_account_id UUID,
  p_from            DATE DEFAULT NULL,
  p_to              DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gl_account UUID;
  v_opening    NUMERIC := 0;
  v_entries    JSONB;
BEGIN
  IF NOT public.is_school_admin(p_school_id)
     AND NOT public.is_finance_reader(p_school_id) THEN
    RAISE EXCEPTION 'Not authorized to read the cashbook';
  END IF;

  SELECT gl_account_id INTO v_gl_account
  FROM bank_accounts WHERE id = p_bank_account_id AND school_id = p_school_id;
  IF v_gl_account IS NULL THEN
    RAISE EXCEPTION 'Unknown account for this school';
  END IF;

  IF p_from IS NOT NULL THEN
    SELECT COALESCE(SUM(l.debit - l.credit), 0) INTO v_opening
    FROM gl_journal_lines l
    JOIN gl_journals j ON j.id = l.journal_id
    WHERE l.school_id = p_school_id
      AND l.account_id = v_gl_account
      AND j.entry_date < p_from;
  END IF;

  SELECT COALESCE(jsonb_agg(row ORDER BY (row->>'seq')::BIGINT), '[]'::jsonb) INTO v_entries
  FROM (
    SELECT jsonb_build_object(
      'seq',         row_number() OVER w,
      'entry_date',  j.entry_date,
      'journal_no',  j.journal_no,
      'source_type', j.source_type,
      'narration',   COALESCE(l.narration, j.memo),
      'money_in',    l.debit,
      'money_out',   l.credit,
      'balance',     v_opening + SUM(l.debit - l.credit) OVER w
    ) AS row
    FROM gl_journal_lines l
    JOIN gl_journals j ON j.id = l.journal_id
    WHERE l.school_id = p_school_id
      AND l.account_id = v_gl_account
      AND (p_from IS NULL OR j.entry_date >= p_from)
      AND (p_to   IS NULL OR j.entry_date <= p_to)
    WINDOW w AS (ORDER BY j.entry_date, j.created_at, l.created_at, l.id)
  ) t;

  RETURN jsonb_build_object(
    'opening_balance', v_opening,
    'entries',         v_entries
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_cashbook(UUID, UUID, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_cashbook(UUID, UUID, DATE, DATE) TO authenticated;

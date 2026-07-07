-- Final Accounts — Phase E: final accounts & period close.
--
-- The statements themselves need NO new read RPCs: Trial Balance, Income &
-- Expenditure and the Balance Sheet are all views over get_gl_trial_balance()
-- (every posting source — fees bridge, AP, payroll, statutory, transfers,
-- manual journals — already lands in gl_journal_lines).
--
-- Adds:
--   fiscal_locks             -- per-school lock date; a BEFORE INSERT trigger on
--                               gl_journals rejects ANY posting dated on/before
--                               it. Every money path posts through gl_journals,
--                               so one guard locks fees, AP, payroll, statutory,
--                               transfers and manual journals alike.
--   close_fiscal_year()      -- posts the closing journal (income & expense
--                               accounts → 3000 Accumulated Fund) and sets the
--                               lock. Admin only.
--   reopen_fiscal_year()     -- admin escape hatch: reverses the LATEST close
--                               and rolls the lock back.
--   set_fiscal_lock()        -- admin: move the lock forward mid-year (e.g.
--                               lock a finished term); never below the last close.
--   get_gl_account_detail()  -- any account's chronological listing with
--                               opening + running balance (generalized cashbook).

-- =====================================================================
-- 1. fiscal_locks + the one lock guard
-- =====================================================================

CREATE TABLE IF NOT EXISTS fiscal_locks (
  school_id      UUID PRIMARY KEY REFERENCES school_registrations(id) ON DELETE CASCADE,
  locked_through DATE NOT NULL,
  set_by         UUID,
  set_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE fiscal_locks ENABLE ROW LEVEL SECURITY;

-- Everyone in finance can SEE the lock; changing it only happens inside the
-- SECURITY DEFINER RPCs below (no INSERT/UPDATE/DELETE policies).
DROP POLICY IF EXISTS fiscal_locks_read ON fiscal_locks;
CREATE POLICY fiscal_locks_read ON fiscal_locks
  FOR SELECT TO authenticated
  USING (public.is_school_admin(school_id) OR public.is_finance_reader(school_id));

DROP TRIGGER IF EXISTS fiscal_locks_audit ON fiscal_locks;
CREATE TRIGGER fiscal_locks_audit
  AFTER INSERT OR UPDATE OR DELETE ON fiscal_locks
  FOR EACH ROW EXECUTE FUNCTION public.fee_audit_row();

CREATE OR REPLACE FUNCTION public.gl_journals_fiscal_lock()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_lock DATE;
BEGIN
  SELECT locked_through INTO v_lock FROM fiscal_locks WHERE school_id = NEW.school_id;
  IF v_lock IS NOT NULL AND NEW.entry_date <= v_lock THEN
    RAISE EXCEPTION 'The books are locked through % — this % entry cannot be posted (dated %)',
      v_lock, NEW.source_type, NEW.entry_date;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS gl_journals_fiscal_lock ON gl_journals;
CREATE TRIGGER gl_journals_fiscal_lock
  BEFORE INSERT ON gl_journals
  FOR EACH ROW EXECUTE FUNCTION public.gl_journals_fiscal_lock();

-- =====================================================================
-- 2. close_fiscal_year — income & expense → Accumulated Fund, then lock
-- =====================================================================

CREATE OR REPLACE FUNCTION public.close_fiscal_year(p_school_id UUID, p_year INT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year_end DATE := make_date(p_year, 12, 31);
  v_lock     DATE;
  v_fund     UUID;
  v_no       INT;
  v_jid      UUID;
  v_row      RECORD;
  v_surplus  NUMERIC := 0;   -- +ve = surplus (income exceeded expenses)
  v_lines    INT := 0;
BEGIN
  IF NOT public.is_school_admin(p_school_id) THEN
    RAISE EXCEPTION 'Only the school admin can close a financial year';
  END IF;

  SELECT locked_through INTO v_lock FROM fiscal_locks WHERE school_id = p_school_id;
  IF v_lock IS NOT NULL AND v_lock >= v_year_end THEN
    RAISE EXCEPTION 'Year % is already closed (books locked through %)', p_year, v_lock;
  END IF;
  IF EXISTS (
    SELECT 1 FROM gl_journals
    WHERE school_id = p_school_id AND source_type = 'year_close'
      AND entry_date = v_year_end
  ) THEN
    RAISE EXCEPTION 'Year % already has a closing journal', p_year;
  END IF;

  SELECT id INTO v_fund FROM gl_accounts
  WHERE school_id = p_school_id AND sys_key = 'ACCUMULATED_FUND';
  IF v_fund IS NULL THEN
    RAISE EXCEPTION 'Accumulated Fund account missing from the chart of accounts';
  END IF;

  v_no := public.next_fee_doc_no(p_school_id, 'JRN', p_year);
  INSERT INTO gl_journals (school_id, journal_no, entry_date, source_type, memo, posted_by)
  VALUES (p_school_id, 'JRN-' || p_year || '-' || lpad(v_no::TEXT, 6, '0'),
          v_year_end, 'year_close', 'Year-end close ' || p_year, auth.uid())
  RETURNING id INTO v_jid;

  -- Zero every income/expense account as at year-end. Prior closed years
  -- already net to zero, so summing all history ≤ year-end is correct.
  FOR v_row IN
    SELECT a.id, a.name,
           SUM(l.debit - l.credit) AS bal   -- +ve = net debit
    FROM gl_accounts a
    JOIN gl_journal_lines l ON l.account_id = a.id
    JOIN gl_journals j ON j.id = l.journal_id
    WHERE a.school_id = p_school_id
      AND a.type IN ('income', 'expense')
      AND j.entry_date <= v_year_end
      AND j.id <> v_jid
    GROUP BY a.id, a.name
    HAVING round(SUM(l.debit - l.credit), 2) <> 0
  LOOP
    IF v_row.bal > 0 THEN
      -- net debit (an expense) → credit it closed
      INSERT INTO gl_journal_lines (school_id, journal_id, account_id, debit, credit, narration)
      VALUES (p_school_id, v_jid, v_row.id, 0, round(v_row.bal, 2), 'Close ' || p_year || ' — ' || v_row.name);
    ELSE
      -- net credit (income) → debit it closed
      INSERT INTO gl_journal_lines (school_id, journal_id, account_id, debit, credit, narration)
      VALUES (p_school_id, v_jid, v_row.id, round(-v_row.bal, 2), 0, 'Close ' || p_year || ' — ' || v_row.name);
    END IF;
    v_surplus := v_surplus - v_row.bal;   -- income (credit) adds, expense subtracts
    v_lines := v_lines + 1;
  END LOOP;

  IF v_lines = 0 THEN
    DELETE FROM gl_journals WHERE id = v_jid;   -- nothing to close; no empty journal
  ELSIF round(v_surplus, 2) <> 0 THEN
    INSERT INTO gl_journal_lines (school_id, journal_id, account_id, debit, credit, narration)
    VALUES (p_school_id, v_jid, v_fund,
            CASE WHEN v_surplus < 0 THEN round(-v_surplus, 2) ELSE 0 END,
            CASE WHEN v_surplus > 0 THEN round(v_surplus, 2) ELSE 0 END,
            CASE WHEN v_surplus >= 0
              THEN 'Surplus for ' || p_year || ' to Accumulated Fund'
              ELSE 'Deficit for ' || p_year || ' from Accumulated Fund' END);
  END IF;

  INSERT INTO fiscal_locks (school_id, locked_through, set_by)
  VALUES (p_school_id, v_year_end, auth.uid())
  ON CONFLICT (school_id)
  DO UPDATE SET locked_through = v_year_end, set_by = auth.uid(), set_at = now();

  RETURN jsonb_build_object('ok', true, 'year', p_year,
                            'surplus', round(v_surplus, 2), 'accounts_closed', v_lines);
END;
$$;

REVOKE ALL ON FUNCTION public.close_fiscal_year(UUID, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_fiscal_year(UUID, INT) TO authenticated;

-- =====================================================================
-- 3. reopen_fiscal_year — reverse the LATEST close (admin escape hatch)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.reopen_fiscal_year(p_school_id UUID, p_year INT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year_end   DATE := make_date(p_year, 12, 31);
  v_close      gl_journals%ROWTYPE;
  v_prev_close DATE;
  v_no         INT;
  v_jid        UUID;
BEGIN
  IF NOT public.is_school_admin(p_school_id) THEN
    RAISE EXCEPTION 'Only the school admin can reopen a financial year';
  END IF;

  SELECT * INTO v_close FROM gl_journals
  WHERE school_id = p_school_id AND source_type = 'year_close' AND entry_date = v_year_end;
  IF v_close.id IS NULL THEN
    RAISE EXCEPTION 'Year % has no closing journal', p_year;
  END IF;
  IF EXISTS (
    SELECT 1 FROM gl_journals
    WHERE school_id = p_school_id AND source_type = 'year_close' AND entry_date > v_year_end
  ) THEN
    RAISE EXCEPTION 'A later year is closed — reopen years newest first';
  END IF;
  IF EXISTS (
    SELECT 1 FROM gl_journals
    WHERE school_id = p_school_id AND source_type = 'year_close_reversal'
      AND source_id = v_close.id
  ) THEN
    RAISE EXCEPTION 'Year % is already reopened', p_year;
  END IF;

  -- Roll the lock back FIRST so the reversal (dated year-end) can post.
  SELECT MAX(entry_date) INTO v_prev_close FROM gl_journals
  WHERE school_id = p_school_id AND source_type = 'year_close' AND entry_date < v_year_end;
  IF v_prev_close IS NULL THEN
    DELETE FROM fiscal_locks WHERE school_id = p_school_id;
  ELSE
    UPDATE fiscal_locks SET locked_through = v_prev_close, set_by = auth.uid(), set_at = now()
    WHERE school_id = p_school_id;
  END IF;

  v_no := public.next_fee_doc_no(p_school_id, 'JRN', p_year);
  INSERT INTO gl_journals (school_id, journal_no, entry_date, source_type, source_id, memo, posted_by)
  VALUES (p_school_id, 'JRN-' || p_year || '-' || lpad(v_no::TEXT, 6, '0'),
          v_year_end, 'year_close_reversal', v_close.id,
          'Reopen ' || p_year || ' — reversal of ' || v_close.journal_no, auth.uid())
  RETURNING id INTO v_jid;

  INSERT INTO gl_journal_lines (school_id, journal_id, account_id, debit, credit, narration)
  SELECT school_id, v_jid, account_id, credit, debit,   -- swapped legs
         'Reopen ' || p_year || ' — ' || COALESCE(narration, '')
  FROM gl_journal_lines WHERE journal_id = v_close.id;

  RETURN jsonb_build_object('ok', true, 'year', p_year);
END;
$$;

REVOKE ALL ON FUNCTION public.reopen_fiscal_year(UUID, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reopen_fiscal_year(UUID, INT) TO authenticated;

-- =====================================================================
-- 4. set_fiscal_lock — admin moves the lock mid-year (never below a close)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.set_fiscal_lock(p_school_id UUID, p_locked_through DATE)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last_close DATE;
BEGIN
  IF NOT public.is_school_admin(p_school_id) THEN
    RAISE EXCEPTION 'Only the school admin can move the books lock';
  END IF;

  SELECT MAX(entry_date) INTO v_last_close FROM gl_journals
  WHERE school_id = p_school_id AND source_type = 'year_close'
    AND NOT EXISTS (SELECT 1 FROM gl_journals r
                    WHERE r.source_type = 'year_close_reversal' AND r.source_id = gl_journals.id);
  IF v_last_close IS NOT NULL
     AND (p_locked_through IS NULL OR p_locked_through < v_last_close) THEN
    RAISE EXCEPTION 'The lock cannot fall below the last year-end close (%) — reopen that year instead', v_last_close;
  END IF;

  IF p_locked_through IS NULL THEN
    DELETE FROM fiscal_locks WHERE school_id = p_school_id;
  ELSE
    INSERT INTO fiscal_locks (school_id, locked_through, set_by)
    VALUES (p_school_id, p_locked_through, auth.uid())
    ON CONFLICT (school_id)
    DO UPDATE SET locked_through = p_locked_through, set_by = auth.uid(), set_at = now();
  END IF;

  RETURN jsonb_build_object('ok', true, 'locked_through', p_locked_through);
END;
$$;

REVOKE ALL ON FUNCTION public.set_fiscal_lock(UUID, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_fiscal_lock(UUID, DATE) TO authenticated;

-- =====================================================================
-- 5. get_gl_account_detail — any account, opening + running balance
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_gl_account_detail(
  p_school_id  UUID,
  p_account_id UUID,
  p_from       DATE DEFAULT NULL,
  p_to         DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_opening NUMERIC := 0;
  v_entries JSONB;
BEGIN
  IF NOT public.is_school_admin(p_school_id)
     AND NOT public.is_finance_reader(p_school_id) THEN
    RAISE EXCEPTION 'Not authorized to read the ledger';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM gl_accounts WHERE id = p_account_id AND school_id = p_school_id) THEN
    RAISE EXCEPTION 'Unknown account for this school';
  END IF;

  IF p_from IS NOT NULL THEN
    SELECT COALESCE(SUM(l.debit - l.credit), 0) INTO v_opening
    FROM gl_journal_lines l
    JOIN gl_journals j ON j.id = l.journal_id
    WHERE l.school_id = p_school_id AND l.account_id = p_account_id
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
      'debit',       l.debit,
      'credit',      l.credit,
      'balance',     v_opening + SUM(l.debit - l.credit) OVER w
    ) AS row
    FROM gl_journal_lines l
    JOIN gl_journals j ON j.id = l.journal_id
    WHERE l.school_id = p_school_id AND l.account_id = p_account_id
      AND (p_from IS NULL OR j.entry_date >= p_from)
      AND (p_to   IS NULL OR j.entry_date <= p_to)
    WINDOW w AS (ORDER BY j.entry_date, j.created_at, l.created_at, l.id)
  ) t;

  RETURN jsonb_build_object('opening_balance', v_opening, 'entries', v_entries);
END;
$$;

REVOKE ALL ON FUNCTION public.get_gl_account_detail(UUID, UUID, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_gl_account_detail(UUID, UUID, DATE, DATE) TO authenticated;

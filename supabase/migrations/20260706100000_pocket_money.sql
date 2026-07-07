-- Pocket Money — student personal (custodial) accounts.
--
-- Deposits from parents and withdrawals by students, per student, with a
-- running balance. DELIBERATELY SEPARATE from school fee finances: nothing
-- here touches fee tables, the double-entry ledger, or finance reports.
-- It shares only the security model (admin/finance RLS) and the audit trail.
--
--   pocket_money_txns        -- the ledger (deposit | withdrawal, soft-void)
--   pocket_money_balance()   -- one student's current balance
--   record_pocket_txn()      -- validated insert; withdrawals cannot overdraw
--   void_pocket_txn()        -- soft void with reason; cannot leave overdraft

CREATE TABLE IF NOT EXISTS pocket_money_txns (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID NOT NULL REFERENCES school_registrations(id) ON DELETE CASCADE,
  student_id  UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('deposit', 'withdrawal')),
  amount      NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  method      TEXT,          -- cash | mpesa | bank (deposits mostly)
  reference   TEXT,          -- M-Pesa code / slip no.
  party       TEXT,          -- deposit: who deposited; withdrawal: received by
  notes       TEXT,
  txn_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'voided')),
  void_reason TEXT,
  voided_at   TIMESTAMPTZ,
  voided_by   UUID,
  recorded_by UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pocket_money_txns_student_idx ON pocket_money_txns (student_id, txn_at);
CREATE INDEX IF NOT EXISTS pocket_money_txns_school_idx  ON pocket_money_txns (school_id, txn_at DESC);

DO $$
DECLARE
  t TEXT := 'pocket_money_txns';
BEGIN
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  EXECUTE format('DROP POLICY IF EXISTS %I_admin_all ON %I', t, t);
  EXECUTE format($f$
    CREATE POLICY %I_admin_all ON %I FOR ALL TO authenticated
    USING (public.is_school_admin(school_id))
    WITH CHECK (public.is_school_admin(school_id))
  $f$, t, t);
  EXECUTE format('DROP POLICY IF EXISTS %I_finance_all ON %I', t, t);
  EXECUTE format($f$
    CREATE POLICY %I_finance_all ON %I FOR ALL TO authenticated
    USING (public.is_finance_staff(school_id))
    WITH CHECK (public.is_finance_staff(school_id))
  $f$, t, t);
  EXECUTE format('DROP POLICY IF EXISTS %I_finance_read ON %I', t, t);
  EXECUTE format($f$
    CREATE POLICY %I_finance_read ON %I FOR SELECT TO authenticated
    USING (public.is_finance_reader(school_id))
  $f$, t, t);
END;
$$;

-- Same audit trail as fee records (who did what, before/after).
DROP TRIGGER IF EXISTS pocket_money_txns_audit ON pocket_money_txns;
CREATE TRIGGER pocket_money_txns_audit
  AFTER INSERT OR UPDATE OR DELETE ON pocket_money_txns
  FOR EACH ROW EXECUTE FUNCTION public.fee_audit_row();

-- =====================================================================
-- Balance helper
-- =====================================================================

CREATE OR REPLACE FUNCTION public.pocket_money_balance(p_student_id UUID)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(CASE WHEN kind = 'deposit' THEN amount ELSE -amount END), 0)
  FROM pocket_money_txns
  WHERE student_id = p_student_id AND status = 'active';
$$;

REVOKE ALL ON FUNCTION public.pocket_money_balance(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pocket_money_balance(UUID) TO authenticated, service_role;

-- =====================================================================
-- record_pocket_txn — validated; withdrawals can never overdraw
-- =====================================================================

CREATE OR REPLACE FUNCTION public.record_pocket_txn(
  p_school_id  UUID,
  p_student_id UUID,
  p_kind       TEXT,
  p_amount     NUMERIC,
  p_method     TEXT DEFAULT NULL,
  p_reference  TEXT DEFAULT NULL,
  p_party      TEXT DEFAULT NULL,
  p_notes      TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance NUMERIC(14,2);
  v_txn_id  UUID;
BEGIN
  IF p_kind NOT IN ('deposit', 'withdrawal') THEN
    RAISE EXCEPTION 'Kind must be deposit or withdrawal';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero';
  END IF;
  IF NOT public.is_school_admin(p_school_id)
     AND NOT public.is_finance_staff(p_school_id) THEN
    RAISE EXCEPTION 'Not authorized to manage pocket money for this school';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM students WHERE id = p_student_id AND school_id = p_school_id) THEN
    RAISE EXCEPTION 'Student not found in this school';
  END IF;

  -- Serialize per student so concurrent withdrawals cannot jointly overdraw.
  PERFORM pg_advisory_xact_lock(hashtext('pocket_money' || p_student_id::text));

  v_balance := public.pocket_money_balance(p_student_id);
  IF p_kind = 'withdrawal' AND round(p_amount::numeric, 2) > v_balance THEN
    RAISE EXCEPTION 'Insufficient pocket money: balance is KES %, withdrawal of KES % refused',
      to_char(v_balance, 'FM999,999,990.00'), to_char(p_amount, 'FM999,999,990.00');
  END IF;

  INSERT INTO pocket_money_txns (school_id, student_id, kind, amount, method,
                                 reference, party, notes, recorded_by)
  VALUES (p_school_id, p_student_id, p_kind, round(p_amount::numeric, 2),
          NULLIF(trim(COALESCE(p_method, '')), ''),
          NULLIF(trim(COALESCE(p_reference, '')), ''),
          NULLIF(trim(COALESCE(p_party, '')), ''),
          NULLIF(trim(COALESCE(p_notes, '')), ''),
          auth.uid())
  RETURNING id INTO v_txn_id;

  RETURN jsonb_build_object(
    'ok', true,
    'txn_id', v_txn_id,
    'balance', public.pocket_money_balance(p_student_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_pocket_txn(UUID, UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_pocket_txn(UUID, UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- =====================================================================
-- void_pocket_txn — soft void; may not leave the account overdrawn
-- =====================================================================

CREATE OR REPLACE FUNCTION public.void_pocket_txn(p_txn_id UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_txn RECORD;
  v_balance_after NUMERIC(14,2);
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'A void reason is required';
  END IF;

  SELECT * INTO v_txn FROM pocket_money_txns WHERE id = p_txn_id;
  IF v_txn.id IS NULL THEN RAISE EXCEPTION 'Transaction not found'; END IF;
  IF NOT public.is_school_admin(v_txn.school_id)
     AND NOT public.is_finance_staff(v_txn.school_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF v_txn.status = 'voided' THEN RAISE EXCEPTION 'Transaction is already voided'; END IF;

  PERFORM pg_advisory_xact_lock(hashtext('pocket_money' || v_txn.student_id::text));

  -- Voiding a deposit that has already been spent would overdraw the account.
  v_balance_after := public.pocket_money_balance(v_txn.student_id)
    + CASE WHEN v_txn.kind = 'deposit' THEN -v_txn.amount ELSE v_txn.amount END;
  IF v_balance_after < 0 THEN
    RAISE EXCEPTION 'Cannot void: the money has already been withdrawn (balance would go to KES %)',
      to_char(v_balance_after, 'FM-999,999,990.00');
  END IF;

  UPDATE pocket_money_txns
  SET status = 'voided', void_reason = trim(p_reason), voided_at = now(), voided_by = auth.uid()
  WHERE id = p_txn_id;

  RETURN jsonb_build_object('ok', true, 'balance', public.pocket_money_balance(v_txn.student_id));
END;
$$;

REVOKE ALL ON FUNCTION public.void_pocket_txn(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_pocket_txn(UUID, TEXT) TO authenticated;

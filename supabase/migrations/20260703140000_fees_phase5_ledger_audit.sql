-- Fees module — Phase 5: append-only double-entry ledger + audit trail.
--
-- Adds:
--   fee_ledger_entries   -- double-entry, append-only (Σdebit = Σcredit per txn_group)
--   fee_audit_logs       -- who did what, with before/after row snapshots
--   Ledger posting TRIGGERS on fee_invoice_items / fee_invoices /
--     fee_payments / fee_adjustments / fee_bursary_awards
--   Generic audit TRIGGER on every fee table (+ voteheads, fee_structures)
--   One-time idempotent BACKFILL so the ledger reconciles with all
--     invoices/payments/concessions recorded before this migration
--
-- Why triggers instead of editing each RPC: the ledger then cannot be
-- bypassed by ANY write path — RPCs, the admin UI's direct table writes,
-- or future Phase-2 integrations (M-Pesa) all post automatically.
--
-- Posting table (PRD §9):
--   invoice line issued      DR AR          CR FEE_INCOME  (votehead)
--   invoice cancelled        DR FEE_INCOME  CR AR          (total, reversal)
--   payment recorded         DR CASH        CR AR
--   payment voided           DR AR          CR CASH        (reversal)
--   discount/waiver/credit   DR CONCESSION  CR AR
--   adjustment voided        DR AR          CR CONCESSION  (reversal)
--   bursary awarded          DR BURSARY     CR AR
--   bursary voided           DR AR          CR BURSARY     (reversal)
--
-- Append-only: no client policies beyond SELECT; UPDATE raises via trigger.
-- (DELETE is left to FK cascades only, so tenant deletion still works.)

-- =====================================================================
-- 1. fee_ledger_entries
-- =====================================================================

CREATE TABLE IF NOT EXISTS fee_ledger_entries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID NOT NULL REFERENCES school_registrations(id) ON DELETE CASCADE,
  student_id  UUID REFERENCES students(id) ON DELETE CASCADE,
  txn_group   UUID NOT NULL,
  entry_date  DATE NOT NULL DEFAULT current_date,
  account     TEXT NOT NULL,     -- 'AR' | 'FEE_INCOME' | 'CASH' | 'CONCESSION' | 'BURSARY'
  debit       NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (debit  >= 0),
  credit      NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  votehead_id UUID REFERENCES voteheads(id),
  source_type TEXT,              -- 'invoice_item' | 'invoice_cancel' | 'payment' | ...
  source_id   UUID,
  narration   TEXT,
  created_by  UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (debit = 0 OR credit = 0)   -- one leg per row
);

CREATE INDEX IF NOT EXISTS fee_ledger_school_idx  ON fee_ledger_entries (school_id, entry_date);
CREATE INDEX IF NOT EXISTS fee_ledger_student_idx ON fee_ledger_entries (student_id);
CREATE INDEX IF NOT EXISTS fee_ledger_source_idx  ON fee_ledger_entries (source_type, source_id);
CREATE INDEX IF NOT EXISTS fee_ledger_txn_idx     ON fee_ledger_entries (txn_group);

ALTER TABLE fee_ledger_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fee_ledger_entries_admin_read ON fee_ledger_entries;
CREATE POLICY fee_ledger_entries_admin_read ON fee_ledger_entries
  FOR SELECT TO authenticated
  USING (public.is_school_admin(school_id) OR public.is_finance_reader(school_id));
-- No INSERT/UPDATE/DELETE policies: writes happen only via the SECURITY
-- DEFINER trigger functions below (owner bypasses RLS).

-- Append-only guard
CREATE OR REPLACE FUNCTION public.fee_ledger_block_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Ledger entries are append-only; post a reversal instead of editing';
END;
$$;

DROP TRIGGER IF EXISTS fee_ledger_no_update ON fee_ledger_entries;
CREATE TRIGGER fee_ledger_no_update
  BEFORE UPDATE ON fee_ledger_entries
  FOR EACH ROW EXECUTE FUNCTION public.fee_ledger_block_update();

-- =====================================================================
-- 2. fee_audit_logs
-- =====================================================================

CREATE TABLE IF NOT EXISTS fee_audit_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  UUID NOT NULL REFERENCES school_registrations(id) ON DELETE CASCADE,
  actor_id   UUID,                       -- auth.uid(); NULL for service-role
  action     TEXT NOT NULL,              -- 'insert' | 'update' | 'delete'
  entity     TEXT NOT NULL,              -- table name
  entity_id  UUID,
  before     JSONB,
  after      JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fee_audit_logs_school_idx ON fee_audit_logs (school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS fee_audit_logs_entity_idx ON fee_audit_logs (entity, entity_id);

ALTER TABLE fee_audit_logs ENABLE ROW LEVEL SECURITY;

-- PRD: viewable by Admin and Auditor.
DROP POLICY IF EXISTS fee_audit_logs_read ON fee_audit_logs;
CREATE POLICY fee_audit_logs_read ON fee_audit_logs
  FOR SELECT TO authenticated
  USING (
    public.is_school_admin(school_id)
    OR EXISTS (
      SELECT 1 FROM staff st
      WHERE st.auth_user_id = auth.uid()
        AND st.school_id = fee_audit_logs.school_id
        AND st.app_role = 'auditor'
    )
  );

DROP TRIGGER IF EXISTS fee_audit_no_update ON fee_audit_logs;
CREATE TRIGGER fee_audit_no_update
  BEFORE UPDATE ON fee_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.fee_ledger_block_update();

-- =====================================================================
-- 3. Generic audit trigger — attached to every fee table
-- =====================================================================
-- SECURITY DEFINER so inserts bypass fee_audit_logs RLS regardless of who
-- performed the audited write.

CREATE OR REPLACE FUNCTION public.fee_audit_row()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO fee_audit_logs (school_id, actor_id, action, entity, entity_id, before, after)
  VALUES (
    COALESCE(NEW.school_id, OLD.school_id),
    auth.uid(),
    lower(TG_OP),
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'voteheads', 'fee_structures',
    'fee_invoices', 'fee_invoice_items',
    'fee_payments', 'fee_payment_allocations', 'fee_receipts',
    'fee_adjustments', 'fee_bursary_awards', 'fee_sponsors'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_audit ON %I', t, t);
    EXECUTE format($f$
      CREATE TRIGGER %I_audit
      AFTER INSERT OR UPDATE OR DELETE ON %I
      FOR EACH ROW EXECUTE FUNCTION public.fee_audit_row()
    $f$, t, t);
  END LOOP;
END;
$$;

-- =====================================================================
-- 4. Ledger posting triggers
-- =====================================================================

-- Helper: one balanced pair.
CREATE OR REPLACE FUNCTION public.fee_ledger_pair(
  p_school_id   UUID,
  p_student_id  UUID,
  p_entry_date  DATE,
  p_dr_account  TEXT,
  p_cr_account  TEXT,
  p_amount      NUMERIC,
  p_votehead_id UUID,
  p_source_type TEXT,
  p_source_id   UUID,
  p_narration   TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_grp UUID := gen_random_uuid();
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RETURN; END IF;
  INSERT INTO fee_ledger_entries (school_id, student_id, txn_group, entry_date, account,
                                  debit, credit, votehead_id, source_type, source_id,
                                  narration, created_by)
  VALUES
    (p_school_id, p_student_id, v_grp, COALESCE(p_entry_date, current_date), p_dr_account,
     p_amount, 0, p_votehead_id, p_source_type, p_source_id, p_narration, auth.uid()),
    (p_school_id, p_student_id, v_grp, COALESCE(p_entry_date, current_date), p_cr_account,
     0, p_amount, p_votehead_id, p_source_type, p_source_id, p_narration, auth.uid());
END;
$$;

-- 4a. Invoice line issued -> DR AR / CR FEE_INCOME
CREATE OR REPLACE FUNCTION public.fee_ledger_on_invoice_item()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv RECORD;
BEGIN
  SELECT student_id, issue_date, invoice_no INTO v_inv
  FROM fee_invoices WHERE id = NEW.invoice_id;
  PERFORM public.fee_ledger_pair(
    NEW.school_id, v_inv.student_id, v_inv.issue_date,
    'AR', 'FEE_INCOME', NEW.amount, NEW.votehead_id,
    'invoice_item', NEW.id, v_inv.invoice_no || ' · ' || NEW.description);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fee_invoice_items_ledger ON fee_invoice_items;
CREATE TRIGGER fee_invoice_items_ledger
  AFTER INSERT ON fee_invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.fee_ledger_on_invoice_item();

-- 4b. Invoice cancelled -> reversal of the full total
CREATE OR REPLACE FUNCTION public.fee_ledger_on_invoice_cancel()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.fee_ledger_pair(
    NEW.school_id, NEW.student_id, current_date,
    'FEE_INCOME', 'AR', NEW.total, NULL,
    'invoice_cancel', NEW.id,
    NEW.invoice_no || ' cancelled: ' || COALESCE(NEW.cancel_reason, ''));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fee_invoices_ledger_cancel ON fee_invoices;
CREATE TRIGGER fee_invoices_ledger_cancel
  AFTER UPDATE ON fee_invoices
  FOR EACH ROW
  WHEN (OLD.status <> 'cancelled' AND NEW.status = 'cancelled')
  EXECUTE FUNCTION public.fee_ledger_on_invoice_cancel();

-- 4c. Payment recorded -> DR CASH / CR AR
CREATE OR REPLACE FUNCTION public.fee_ledger_on_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'active' THEN
    PERFORM public.fee_ledger_pair(
      NEW.school_id, NEW.student_id, NEW.paid_at::date,
      'CASH', 'AR', NEW.amount, NULL,
      'payment', NEW.id,
      COALESCE(upper(NEW.method), 'PAYMENT') || COALESCE(' ' || NEW.reference, ''));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fee_payments_ledger ON fee_payments;
CREATE TRIGGER fee_payments_ledger
  AFTER INSERT ON fee_payments
  FOR EACH ROW EXECUTE FUNCTION public.fee_ledger_on_payment();

-- 4d. Payment voided -> reversal
CREATE OR REPLACE FUNCTION public.fee_ledger_on_payment_void()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.fee_ledger_pair(
    NEW.school_id, NEW.student_id, current_date,
    'AR', 'CASH', NEW.amount, NULL,
    'payment_void', NEW.id,
    'Void: ' || COALESCE(NEW.void_reason, ''));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fee_payments_ledger_void ON fee_payments;
CREATE TRIGGER fee_payments_ledger_void
  AFTER UPDATE ON fee_payments
  FOR EACH ROW
  WHEN (OLD.status = 'active' AND NEW.status = 'voided')
  EXECUTE FUNCTION public.fee_ledger_on_payment_void();

-- 4e. Adjustment applied -> DR CONCESSION / CR AR (and reversal on void)
CREATE OR REPLACE FUNCTION public.fee_ledger_on_adjustment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.fee_ledger_pair(
    NEW.school_id, NEW.student_id, NEW.created_at::date,
    'CONCESSION', 'AR', NEW.amount, NEW.votehead_id,
    'adjustment', NEW.id, initcap(NEW.kind) || ': ' || NEW.reason);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fee_adjustments_ledger ON fee_adjustments;
CREATE TRIGGER fee_adjustments_ledger
  AFTER INSERT ON fee_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.fee_ledger_on_adjustment();

CREATE OR REPLACE FUNCTION public.fee_ledger_on_adjustment_void()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.fee_ledger_pair(
    NEW.school_id, NEW.student_id, current_date,
    'AR', 'CONCESSION', NEW.amount, NEW.votehead_id,
    'adjustment_void', NEW.id, 'Void: ' || COALESCE(NEW.void_reason, ''));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fee_adjustments_ledger_void ON fee_adjustments;
CREATE TRIGGER fee_adjustments_ledger_void
  AFTER UPDATE ON fee_adjustments
  FOR EACH ROW
  WHEN (OLD.status = 'active' AND NEW.status = 'voided')
  EXECUTE FUNCTION public.fee_ledger_on_adjustment_void();

-- 4f. Bursary awarded -> DR BURSARY / CR AR (and reversal on void)
CREATE OR REPLACE FUNCTION public.fee_ledger_on_bursary()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sponsor TEXT;
BEGIN
  SELECT name INTO v_sponsor FROM fee_sponsors WHERE id = NEW.sponsor_id;
  PERFORM public.fee_ledger_pair(
    NEW.school_id, NEW.student_id, NEW.created_at::date,
    'BURSARY', 'AR', NEW.amount, NULL,
    'bursary', NEW.id, 'Bursary — ' || COALESCE(v_sponsor, 'sponsor'));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fee_bursary_awards_ledger ON fee_bursary_awards;
CREATE TRIGGER fee_bursary_awards_ledger
  AFTER INSERT ON fee_bursary_awards
  FOR EACH ROW EXECUTE FUNCTION public.fee_ledger_on_bursary();

CREATE OR REPLACE FUNCTION public.fee_ledger_on_bursary_void()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.fee_ledger_pair(
    NEW.school_id, NEW.student_id, current_date,
    'AR', 'BURSARY', NEW.amount, NULL,
    'bursary_void', NEW.id, 'Void: ' || COALESCE(NEW.void_reason, ''));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fee_bursary_awards_ledger_void ON fee_bursary_awards;
CREATE TRIGGER fee_bursary_awards_ledger_void
  AFTER UPDATE ON fee_bursary_awards
  FOR EACH ROW
  WHEN (OLD.status = 'active' AND NEW.status = 'voided')
  EXECUTE FUNCTION public.fee_ledger_on_bursary_void();

-- =====================================================================
-- 5. Backfill — bring the ledger up to date with pre-Phase-5 records.
--    Idempotent: each block skips sources already posted.
-- =====================================================================

-- 5a. Invoice lines of non-cancelled invoices
WITH src AS (
  SELECT ii.id, ii.school_id, ii.amount, ii.votehead_id, ii.description,
         i.student_id, i.issue_date, i.invoice_no,
         gen_random_uuid() AS grp
  FROM fee_invoice_items ii
  JOIN fee_invoices i ON i.id = ii.invoice_id
  WHERE i.status <> 'cancelled'
    AND NOT EXISTS (
      SELECT 1 FROM fee_ledger_entries le
      WHERE le.source_type = 'invoice_item' AND le.source_id = ii.id
    )
)
INSERT INTO fee_ledger_entries (school_id, student_id, txn_group, entry_date, account,
                                debit, credit, votehead_id, source_type, source_id, narration)
SELECT school_id, student_id, grp, issue_date, 'AR', amount, 0, votehead_id,
       'invoice_item', id, invoice_no || ' · ' || description || ' (backfill)'
FROM src
UNION ALL
SELECT school_id, student_id, grp, issue_date, 'FEE_INCOME', 0, amount, votehead_id,
       'invoice_item', id, invoice_no || ' · ' || description || ' (backfill)'
FROM src;

-- 5b. Active payments
WITH src AS (
  SELECT p.id, p.school_id, p.student_id, p.amount, p.paid_at::date AS d,
         COALESCE(upper(p.method), 'PAYMENT') AS m, gen_random_uuid() AS grp
  FROM fee_payments p
  WHERE p.status = 'active'
    AND NOT EXISTS (
      SELECT 1 FROM fee_ledger_entries le
      WHERE le.source_type = 'payment' AND le.source_id = p.id
    )
)
INSERT INTO fee_ledger_entries (school_id, student_id, txn_group, entry_date, account,
                                debit, credit, source_type, source_id, narration)
SELECT school_id, student_id, grp, d, 'CASH', amount, 0, 'payment', id, m || ' (backfill)' FROM src
UNION ALL
SELECT school_id, student_id, grp, d, 'AR', 0, amount, 'payment', id, m || ' (backfill)' FROM src;

-- 5c. Active adjustments
WITH src AS (
  SELECT a.id, a.school_id, a.student_id, a.amount, a.votehead_id,
         a.created_at::date AS d, a.kind, a.reason, gen_random_uuid() AS grp
  FROM fee_adjustments a
  WHERE a.status = 'active'
    AND NOT EXISTS (
      SELECT 1 FROM fee_ledger_entries le
      WHERE le.source_type = 'adjustment' AND le.source_id = a.id
    )
)
INSERT INTO fee_ledger_entries (school_id, student_id, txn_group, entry_date, account,
                                debit, credit, votehead_id, source_type, source_id, narration)
SELECT school_id, student_id, grp, d, 'CONCESSION', amount, 0, votehead_id,
       'adjustment', id, initcap(kind) || ': ' || reason || ' (backfill)' FROM src
UNION ALL
SELECT school_id, student_id, grp, d, 'AR', 0, amount, votehead_id,
       'adjustment', id, initcap(kind) || ': ' || reason || ' (backfill)' FROM src;

-- 5d. Active bursaries
WITH src AS (
  SELECT b.id, b.school_id, b.student_id, b.amount, b.created_at::date AS d,
         sp.name AS sponsor, gen_random_uuid() AS grp
  FROM fee_bursary_awards b
  JOIN fee_sponsors sp ON sp.id = b.sponsor_id
  WHERE b.status = 'active'
    AND NOT EXISTS (
      SELECT 1 FROM fee_ledger_entries le
      WHERE le.source_type = 'bursary' AND le.source_id = b.id
    )
)
INSERT INTO fee_ledger_entries (school_id, student_id, txn_group, entry_date, account,
                                debit, credit, source_type, source_id, narration)
SELECT school_id, student_id, grp, d, 'BURSARY', amount, 0, 'bursary', id,
       'Bursary — ' || sponsor || ' (backfill)' FROM src
UNION ALL
SELECT school_id, student_id, grp, d, 'AR', 0, amount, 'bursary', id,
       'Bursary — ' || sponsor || ' (backfill)' FROM src;

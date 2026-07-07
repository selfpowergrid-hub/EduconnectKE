-- Final Accounts — Phase C1: Suppliers & Purchases (Accounts Payable core).
--
-- Adds:
--   suppliers                     -- who the school buys from (KRA PIN, payout details)
--   supplier_invoices (+ items)   -- bills, each line coded to an expense/asset GL
--                                    account; BILL-YYYY-NNNNNN; draft → posted →
--                                    part_paid → paid, or void
--   supplier_payments             -- PV-YYYY-NNNNNN payment vouchers out of a
--                                    bank/cash account
--   supplier_payment_allocations  -- which bills a payment settled
--   RPCs: create_supplier_bill, post_supplier_bill, void_supplier_bill,
--         record_supplier_payment, void_supplier_payment, get_ap_summary
--
-- Architecture matches fees: GL postings happen in TRIGGERS on the AP tables
-- (un-bypassable — a direct table write still books the ledger), money math in
-- Postgres, guarded SECURITY DEFINER RPCs as the intended write path, generic
-- audit trigger on every table, RLS admin/finance/read + anon denied.
--
-- Postings:
--   bill posted   → Dr each item's expense/asset account, Cr Suppliers Payable (2000)
--   bill voided   → exact reversal (only while nothing is allocated to it)
--   payment       → Dr Suppliers Payable, Cr the paying bank account's GL account
--   payment void  → exact reversal + its allocations removed (bill statuses recompute)
--   LPOs (C2) deliberately post nothing until billed.

-- =====================================================================
-- 1. suppliers
-- =====================================================================

CREATE TABLE IF NOT EXISTS suppliers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID NOT NULL REFERENCES school_registrations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  category        TEXT,               -- 'Food & Groceries', 'Transport', ...
  kra_pin         TEXT,
  phone           TEXT,
  email           TEXT,
  bank_name       TEXT,               -- payout details (bank or M-PESA)
  bank_account_no TEXT,
  mpesa_no        TEXT,
  terms_days      INT NOT NULL DEFAULT 30 CHECK (terms_days >= 0),
  notes           TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, name)
);

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS suppliers_admin_all ON suppliers;
CREATE POLICY suppliers_admin_all ON suppliers
  FOR ALL TO authenticated
  USING (public.is_school_admin(school_id))
  WITH CHECK (public.is_school_admin(school_id));

DROP POLICY IF EXISTS suppliers_finance_all ON suppliers;
CREATE POLICY suppliers_finance_all ON suppliers
  FOR ALL TO authenticated
  USING (public.is_finance_staff(school_id))
  WITH CHECK (public.is_finance_staff(school_id));

DROP POLICY IF EXISTS suppliers_finance_read ON suppliers;
CREATE POLICY suppliers_finance_read ON suppliers
  FOR SELECT TO authenticated
  USING (public.is_finance_reader(school_id));

DROP TRIGGER IF EXISTS suppliers_audit ON suppliers;
CREATE TRIGGER suppliers_audit
  AFTER INSERT OR UPDATE OR DELETE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION public.fee_audit_row();

-- A supplier with bills can only be deactivated.
CREATE OR REPLACE FUNCTION public.suppliers_protect()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM supplier_invoices i WHERE i.supplier_id = OLD.id) THEN
    RAISE EXCEPTION 'Supplier "%" has bills — deactivate them instead', OLD.name;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS suppliers_protect ON suppliers;
CREATE TRIGGER suppliers_protect
  BEFORE DELETE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION public.suppliers_protect();

-- =====================================================================
-- 2. supplier_invoices + supplier_invoice_items
-- =====================================================================

CREATE TABLE IF NOT EXISTS supplier_invoices (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    UUID NOT NULL REFERENCES school_registrations(id) ON DELETE CASCADE,
  supplier_id  UUID NOT NULL REFERENCES suppliers(id),
  bill_no      TEXT NOT NULL,          -- our sequential BILL-YYYY-NNNNNN
  supplier_ref TEXT,                   -- their invoice number
  bill_date    DATE NOT NULL DEFAULT current_date,
  due_date     DATE,
  status       TEXT NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft', 'posted', 'part_paid', 'paid', 'void')),
  total        NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  memo         TEXT,
  posted_at    TIMESTAMPTZ,
  posted_by    UUID,
  void_reason  TEXT,
  created_by   UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, bill_no)
);

CREATE INDEX IF NOT EXISTS supplier_invoices_supplier_idx
  ON supplier_invoices (supplier_id, status);
CREATE INDEX IF NOT EXISTS supplier_invoices_school_idx
  ON supplier_invoices (school_id, bill_date);

CREATE TABLE IF NOT EXISTS supplier_invoice_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES school_registrations(id) ON DELETE CASCADE,
  invoice_id    UUID NOT NULL REFERENCES supplier_invoices(id) ON DELETE CASCADE,
  gl_account_id UUID NOT NULL REFERENCES gl_accounts(id),
  description   TEXT NOT NULL,
  quantity      NUMERIC(12,3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_cost     NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  amount        NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS supplier_invoice_items_invoice_idx
  ON supplier_invoice_items (invoice_id);

ALTER TABLE supplier_invoices      ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_invoice_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS supplier_invoices_admin_all ON supplier_invoices;
CREATE POLICY supplier_invoices_admin_all ON supplier_invoices
  FOR ALL TO authenticated
  USING (public.is_school_admin(school_id))
  WITH CHECK (public.is_school_admin(school_id));

DROP POLICY IF EXISTS supplier_invoices_finance_all ON supplier_invoices;
CREATE POLICY supplier_invoices_finance_all ON supplier_invoices
  FOR ALL TO authenticated
  USING (public.is_finance_staff(school_id))
  WITH CHECK (public.is_finance_staff(school_id));

DROP POLICY IF EXISTS supplier_invoices_finance_read ON supplier_invoices;
CREATE POLICY supplier_invoices_finance_read ON supplier_invoices
  FOR SELECT TO authenticated
  USING (public.is_finance_reader(school_id));

DROP POLICY IF EXISTS supplier_invoice_items_admin_all ON supplier_invoice_items;
CREATE POLICY supplier_invoice_items_admin_all ON supplier_invoice_items
  FOR ALL TO authenticated
  USING (public.is_school_admin(school_id))
  WITH CHECK (public.is_school_admin(school_id));

DROP POLICY IF EXISTS supplier_invoice_items_finance_all ON supplier_invoice_items;
CREATE POLICY supplier_invoice_items_finance_all ON supplier_invoice_items
  FOR ALL TO authenticated
  USING (public.is_finance_staff(school_id))
  WITH CHECK (public.is_finance_staff(school_id));

DROP POLICY IF EXISTS supplier_invoice_items_finance_read ON supplier_invoice_items;
CREATE POLICY supplier_invoice_items_finance_read ON supplier_invoice_items
  FOR SELECT TO authenticated
  USING (public.is_finance_reader(school_id));

DROP TRIGGER IF EXISTS supplier_invoices_audit ON supplier_invoices;
CREATE TRIGGER supplier_invoices_audit
  AFTER INSERT OR UPDATE OR DELETE ON supplier_invoices
  FOR EACH ROW EXECUTE FUNCTION public.fee_audit_row();

DROP TRIGGER IF EXISTS supplier_invoice_items_audit ON supplier_invoice_items;
CREATE TRIGGER supplier_invoice_items_audit
  AFTER INSERT OR UPDATE OR DELETE ON supplier_invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.fee_audit_row();

-- --- Item guards: valid GL coding, frozen once the bill leaves draft --------

CREATE OR REPLACE FUNCTION public.supplier_invoice_items_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_status TEXT;
  v_acct   RECORD;
  v_inv    supplier_invoice_items%ROWTYPE;
BEGIN
  v_inv := COALESCE(NEW, OLD);

  SELECT status INTO v_status FROM supplier_invoices WHERE id = v_inv.invoice_id;
  IF v_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Bill items can only change while the bill is a draft';
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    SELECT type, is_active, school_id INTO v_acct
    FROM gl_accounts WHERE id = NEW.gl_account_id;
    IF v_acct IS NULL OR v_acct.school_id <> NEW.school_id THEN
      RAISE EXCEPTION 'Unknown ledger account on bill line';
    END IF;
    IF v_acct.type NOT IN ('expense', 'asset') THEN
      RAISE EXCEPTION 'Bill lines must be coded to an expense or asset account';
    END IF;
    IF NOT v_acct.is_active THEN
      RAISE EXCEPTION 'Cannot code a bill line to a deactivated account';
    END IF;
    RETURN NEW;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS supplier_invoice_items_guard ON supplier_invoice_items;
CREATE TRIGGER supplier_invoice_items_guard
  BEFORE INSERT OR UPDATE OR DELETE ON supplier_invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.supplier_invoice_items_guard();

-- Keep the draft bill's total in sync with its items.
CREATE OR REPLACE FUNCTION public.supplier_invoice_sync_total()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_invoice UUID := COALESCE(NEW.invoice_id, OLD.invoice_id);
BEGIN
  UPDATE supplier_invoices
  SET total = COALESCE((SELECT SUM(amount) FROM supplier_invoice_items WHERE invoice_id = v_invoice), 0)
  WHERE id = v_invoice AND status = 'draft';
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS supplier_invoice_items_sync_total ON supplier_invoice_items;
CREATE TRIGGER supplier_invoice_items_sync_total
  AFTER INSERT OR UPDATE OR DELETE ON supplier_invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.supplier_invoice_sync_total();

-- --- Bill lifecycle guard ---------------------------------------------------

CREATE OR REPLACE FUNCTION public.supplier_invoices_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'Only draft bills can be deleted — void % instead', OLD.bill_no;
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status = 'void' THEN
    RAISE EXCEPTION 'Bill % is void and cannot change', OLD.bill_no;
  END IF;

  -- Identity freezes once the bill is posted (total freezes because the
  -- items freeze and the sync trigger only touches drafts).
  IF OLD.status <> 'draft'
     AND (NEW.supplier_id IS DISTINCT FROM OLD.supplier_id
          OR NEW.bill_date IS DISTINCT FROM OLD.bill_date
          OR NEW.total     IS DISTINCT FROM OLD.total
          OR NEW.bill_no   IS DISTINCT FROM OLD.bill_no) THEN
    RAISE EXCEPTION 'A posted bill cannot be edited — void it and raise a new one';
  END IF;

  IF NEW.status = 'posted' AND OLD.status = 'draft' THEN
    IF NOT EXISTS (SELECT 1 FROM supplier_invoice_items WHERE invoice_id = OLD.id) THEN
      RAISE EXCEPTION 'Add at least one line before posting';
    END IF;
    IF NEW.total <= 0 THEN
      RAISE EXCEPTION 'A posted bill must be greater than zero';
    END IF;
    NEW.posted_at := now();
    NEW.posted_by := COALESCE(NEW.posted_by, auth.uid());
  END IF;

  IF NEW.status = 'void' AND OLD.status <> 'draft' THEN
    IF EXISTS (SELECT 1 FROM supplier_payment_allocations a WHERE a.invoice_id = OLD.id) THEN
      RAISE EXCEPTION 'Bill % has payments allocated — void those payments first', OLD.bill_no;
    END IF;
    IF NULLIF(trim(COALESCE(NEW.void_reason, '')), '') IS NULL THEN
      RAISE EXCEPTION 'A reason is required to void a bill';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS supplier_invoices_guard ON supplier_invoices;
CREATE TRIGGER supplier_invoices_guard
  BEFORE UPDATE OR DELETE ON supplier_invoices
  FOR EACH ROW EXECUTE FUNCTION public.supplier_invoices_guard();

-- --- GL posting: bill posted / bill voided ----------------------------------

CREATE OR REPLACE FUNCTION public.supplier_invoices_post_gl()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payable UUID;
  v_year    INT := EXTRACT(YEAR FROM NEW.bill_date)::INT;
  v_no      INT;
  v_jid     UUID;
  v_reverse BOOLEAN;
BEGIN
  v_reverse := (NEW.status = 'void' AND OLD.status IN ('posted', 'part_paid', 'paid'));
  IF NOT v_reverse AND NOT (NEW.status = 'posted' AND OLD.status = 'draft') THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_payable FROM gl_accounts
  WHERE school_id = NEW.school_id AND sys_key = 'SUPPLIERS_PAYABLE';
  IF v_payable IS NULL THEN
    RAISE EXCEPTION 'Suppliers Payable account missing from the chart of accounts';
  END IF;

  v_no := public.next_fee_doc_no(NEW.school_id, 'JRN', v_year);
  INSERT INTO gl_journals (school_id, journal_no, entry_date, source_type, source_id, memo, posted_by)
  VALUES (NEW.school_id, 'JRN-' || v_year || '-' || lpad(v_no::TEXT, 6, '0'),
          CASE WHEN v_reverse THEN current_date ELSE NEW.bill_date END,
          CASE WHEN v_reverse THEN 'ap_bill_void' ELSE 'ap_bill' END,
          NEW.id,
          CASE WHEN v_reverse
            THEN 'VOID ' || NEW.bill_no || ' — ' || COALESCE(NEW.void_reason, '')
            ELSE NEW.bill_no || COALESCE(' — ' || NEW.memo, '') END,
          auth.uid())
  RETURNING id INTO v_jid;

  IF v_reverse THEN
    -- Dr payable, Cr each expense/asset line.
    INSERT INTO gl_journal_lines (school_id, journal_id, account_id, debit, credit, narration)
    VALUES (NEW.school_id, v_jid, v_payable, NEW.total, 0, 'VOID ' || NEW.bill_no);
    INSERT INTO gl_journal_lines (school_id, journal_id, account_id, debit, credit, narration)
    SELECT NEW.school_id, v_jid, i.gl_account_id, 0, i.amount, 'VOID ' || NEW.bill_no || ' — ' || i.description
    FROM supplier_invoice_items i WHERE i.invoice_id = NEW.id;
  ELSE
    -- Dr each expense/asset line, Cr payable.
    INSERT INTO gl_journal_lines (school_id, journal_id, account_id, debit, credit, narration)
    SELECT NEW.school_id, v_jid, i.gl_account_id, i.amount, 0, NEW.bill_no || ' — ' || i.description
    FROM supplier_invoice_items i WHERE i.invoice_id = NEW.id;
    INSERT INTO gl_journal_lines (school_id, journal_id, account_id, debit, credit, narration)
    VALUES (NEW.school_id, v_jid, v_payable, 0, NEW.total, NEW.bill_no);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS supplier_invoices_post_gl ON supplier_invoices;
CREATE TRIGGER supplier_invoices_post_gl
  AFTER UPDATE ON supplier_invoices
  FOR EACH ROW EXECUTE FUNCTION public.supplier_invoices_post_gl();

-- =====================================================================
-- 3. supplier_payments + allocations
-- =====================================================================

CREATE TABLE IF NOT EXISTS supplier_payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID NOT NULL REFERENCES school_registrations(id) ON DELETE CASCADE,
  supplier_id     UUID NOT NULL REFERENCES suppliers(id),
  bank_account_id UUID NOT NULL REFERENCES bank_accounts(id),
  voucher_no      TEXT NOT NULL,       -- PV-YYYY-NNNNNN
  amount          NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  paid_at         DATE NOT NULL DEFAULT current_date,
  reference       TEXT,                -- cheque no / M-PESA code / RTGS ref
  memo            TEXT,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'voided')),
  void_reason     TEXT,
  voided_at       TIMESTAMPTZ,
  voided_by       UUID,
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, voucher_no)
);

CREATE INDEX IF NOT EXISTS supplier_payments_supplier_idx
  ON supplier_payments (supplier_id, status);
CREATE INDEX IF NOT EXISTS supplier_payments_school_idx
  ON supplier_payments (school_id, paid_at);

CREATE TABLE IF NOT EXISTS supplier_payment_allocations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  UUID NOT NULL REFERENCES school_registrations(id) ON DELETE CASCADE,
  payment_id UUID NOT NULL REFERENCES supplier_payments(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES supplier_invoices(id),
  amount     NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (payment_id, invoice_id)
);

CREATE INDEX IF NOT EXISTS supplier_payment_allocations_invoice_idx
  ON supplier_payment_allocations (invoice_id);

ALTER TABLE supplier_payments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_payment_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS supplier_payments_admin_all ON supplier_payments;
CREATE POLICY supplier_payments_admin_all ON supplier_payments
  FOR ALL TO authenticated
  USING (public.is_school_admin(school_id))
  WITH CHECK (public.is_school_admin(school_id));

DROP POLICY IF EXISTS supplier_payments_finance_all ON supplier_payments;
CREATE POLICY supplier_payments_finance_all ON supplier_payments
  FOR ALL TO authenticated
  USING (public.is_finance_staff(school_id))
  WITH CHECK (public.is_finance_staff(school_id));

DROP POLICY IF EXISTS supplier_payments_finance_read ON supplier_payments;
CREATE POLICY supplier_payments_finance_read ON supplier_payments
  FOR SELECT TO authenticated
  USING (public.is_finance_reader(school_id));

DROP POLICY IF EXISTS supplier_payment_allocations_admin_all ON supplier_payment_allocations;
CREATE POLICY supplier_payment_allocations_admin_all ON supplier_payment_allocations
  FOR ALL TO authenticated
  USING (public.is_school_admin(school_id))
  WITH CHECK (public.is_school_admin(school_id));

DROP POLICY IF EXISTS supplier_payment_allocations_finance_all ON supplier_payment_allocations;
CREATE POLICY supplier_payment_allocations_finance_all ON supplier_payment_allocations
  FOR ALL TO authenticated
  USING (public.is_finance_staff(school_id))
  WITH CHECK (public.is_finance_staff(school_id));

DROP POLICY IF EXISTS supplier_payment_allocations_finance_read ON supplier_payment_allocations;
CREATE POLICY supplier_payment_allocations_finance_read ON supplier_payment_allocations
  FOR SELECT TO authenticated
  USING (public.is_finance_reader(school_id));

DROP TRIGGER IF EXISTS supplier_payments_audit ON supplier_payments;
CREATE TRIGGER supplier_payments_audit
  AFTER INSERT OR UPDATE OR DELETE ON supplier_payments
  FOR EACH ROW EXECUTE FUNCTION public.fee_audit_row();

DROP TRIGGER IF EXISTS supplier_payment_allocations_audit ON supplier_payment_allocations;
CREATE TRIGGER supplier_payment_allocations_audit
  AFTER INSERT OR UPDATE OR DELETE ON supplier_payment_allocations
  FOR EACH ROW EXECUTE FUNCTION public.fee_audit_row();

-- --- Allocation guard: only against posted bills, never over the total ------

CREATE OR REPLACE FUNCTION public.supplier_payment_allocations_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_inv       supplier_invoices%ROWTYPE;
  v_pay       supplier_payments%ROWTYPE;
  v_allocated NUMERIC;
  v_pay_used  NUMERIC;
BEGIN
  SELECT * INTO v_inv FROM supplier_invoices WHERE id = NEW.invoice_id;
  SELECT * INTO v_pay FROM supplier_payments WHERE id = NEW.payment_id;

  IF v_inv.id IS NULL OR v_pay.id IS NULL
     OR v_inv.school_id <> NEW.school_id OR v_pay.school_id <> NEW.school_id THEN
    RAISE EXCEPTION 'Allocation does not match this school''s records';
  END IF;
  IF v_pay.status <> 'active' THEN
    RAISE EXCEPTION 'Cannot allocate a voided payment';
  END IF;
  IF v_inv.status NOT IN ('posted', 'part_paid', 'paid') THEN
    RAISE EXCEPTION 'Bill % is not posted', v_inv.bill_no;
  END IF;
  IF v_inv.supplier_id <> v_pay.supplier_id THEN
    RAISE EXCEPTION 'Payment and bill belong to different suppliers';
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_allocated
  FROM supplier_payment_allocations
  WHERE invoice_id = NEW.invoice_id AND id IS DISTINCT FROM NEW.id;
  IF v_allocated + NEW.amount > v_inv.total + 0.005 THEN
    RAISE EXCEPTION 'Allocation exceeds what is outstanding on bill %', v_inv.bill_no;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_pay_used
  FROM supplier_payment_allocations
  WHERE payment_id = NEW.payment_id AND id IS DISTINCT FROM NEW.id;
  IF v_pay_used + NEW.amount > v_pay.amount + 0.005 THEN
    RAISE EXCEPTION 'Allocation exceeds voucher % amount', v_pay.voucher_no;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS supplier_payment_allocations_guard ON supplier_payment_allocations;
CREATE TRIGGER supplier_payment_allocations_guard
  BEFORE INSERT OR UPDATE ON supplier_payment_allocations
  FOR EACH ROW EXECUTE FUNCTION public.supplier_payment_allocations_guard();

-- --- Bill status recompute on allocation changes ----------------------------

CREATE OR REPLACE FUNCTION public.recompute_supplier_invoice_status(p_invoice_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv       supplier_invoices%ROWTYPE;
  v_allocated NUMERIC;
  v_status    TEXT;
BEGIN
  SELECT * INTO v_inv FROM supplier_invoices WHERE id = p_invoice_id;
  IF v_inv.id IS NULL OR v_inv.status IN ('draft', 'void') THEN RETURN; END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_allocated
  FROM supplier_payment_allocations WHERE invoice_id = p_invoice_id;

  v_status := CASE
    WHEN v_allocated >= v_inv.total - 0.005 THEN 'paid'
    WHEN v_allocated > 0 THEN 'part_paid'
    ELSE 'posted'
  END;
  IF v_status <> v_inv.status THEN
    UPDATE supplier_invoices SET status = v_status WHERE id = p_invoice_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.recompute_supplier_invoice_status(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.supplier_payment_allocations_recompute()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM public.recompute_supplier_invoice_status(NEW.invoice_id);
  END IF;
  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    PERFORM public.recompute_supplier_invoice_status(OLD.invoice_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS supplier_payment_allocations_recompute ON supplier_payment_allocations;
CREATE TRIGGER supplier_payment_allocations_recompute
  AFTER INSERT OR UPDATE OR DELETE ON supplier_payment_allocations
  FOR EACH ROW EXECUTE FUNCTION public.supplier_payment_allocations_recompute();

-- --- Payment lifecycle guard + GL posting -----------------------------------

CREATE OR REPLACE FUNCTION public.supplier_payments_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Payment vouchers are never deleted — void % instead', OLD.voucher_no;
  END IF;

  IF OLD.status = 'voided' THEN
    RAISE EXCEPTION 'Voucher % is void and cannot change', OLD.voucher_no;
  END IF;

  IF NEW.status = 'voided' THEN
    IF NULLIF(trim(COALESCE(NEW.void_reason, '')), '') IS NULL THEN
      RAISE EXCEPTION 'A reason is required to void a payment';
    END IF;
    NEW.voided_at := now();
    NEW.voided_by := COALESCE(NEW.voided_by, auth.uid());
  ELSIF (NEW.supplier_id     IS DISTINCT FROM OLD.supplier_id
      OR NEW.bank_account_id IS DISTINCT FROM OLD.bank_account_id
      OR NEW.amount          IS DISTINCT FROM OLD.amount
      OR NEW.paid_at         IS DISTINCT FROM OLD.paid_at
      OR NEW.voucher_no      IS DISTINCT FROM OLD.voucher_no) THEN
    RAISE EXCEPTION 'A payment voucher cannot be edited — void it and record afresh';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS supplier_payments_guard ON supplier_payments;
CREATE TRIGGER supplier_payments_guard
  BEFORE UPDATE OR DELETE ON supplier_payments
  FOR EACH ROW EXECUTE FUNCTION public.supplier_payments_guard();

CREATE OR REPLACE FUNCTION public.supplier_payments_post_gl()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
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

  SELECT id INTO v_payable FROM gl_accounts
  WHERE school_id = NEW.school_id AND sys_key = 'SUPPLIERS_PAYABLE';
  SELECT gl_account_id INTO v_bank_gl FROM bank_accounts WHERE id = NEW.bank_account_id;
  IF v_payable IS NULL OR v_bank_gl IS NULL THEN
    RAISE EXCEPTION 'Ledger accounts missing for supplier payment';
  END IF;

  v_year := EXTRACT(YEAR FROM CASE WHEN v_void THEN current_date ELSE NEW.paid_at END)::INT;
  v_memo := CASE WHEN v_void
    THEN 'VOID ' || NEW.voucher_no || ' — ' || COALESCE(NEW.void_reason, '')
    ELSE NEW.voucher_no || COALESCE(' — ' || NEW.memo, '') END;

  v_no := public.next_fee_doc_no(NEW.school_id, 'JRN', v_year);
  INSERT INTO gl_journals (school_id, journal_no, entry_date, source_type, source_id, memo, posted_by)
  VALUES (NEW.school_id, 'JRN-' || v_year || '-' || lpad(v_no::TEXT, 6, '0'),
          CASE WHEN v_void THEN current_date ELSE NEW.paid_at END,
          CASE WHEN v_void THEN 'ap_payment_void' ELSE 'ap_payment' END,
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

DROP TRIGGER IF EXISTS supplier_payments_post_gl ON supplier_payments;
CREATE TRIGGER supplier_payments_post_gl
  AFTER INSERT OR UPDATE ON supplier_payments
  FOR EACH ROW EXECUTE FUNCTION public.supplier_payments_post_gl();

-- =====================================================================
-- 4. RPCs — the intended write path
-- =====================================================================

CREATE OR REPLACE FUNCTION public.create_supplier_bill(
  p_school_id    UUID,
  p_supplier_id  UUID,
  p_supplier_ref TEXT,
  p_bill_date    DATE,
  p_due_date     DATE,
  p_memo         TEXT,
  p_items        JSONB,     -- [{gl_account_id, description, quantity?, unit_cost?, amount}]
  p_post         BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_supplier suppliers%ROWTYPE;
  v_date     DATE := COALESCE(p_bill_date, current_date);
  v_year     INT  := EXTRACT(YEAR FROM COALESCE(p_bill_date, current_date))::INT;
  v_no       INT;
  v_bill_no  TEXT;
  v_id       UUID;
BEGIN
  IF NOT public.is_school_admin(p_school_id)
     AND NOT public.is_finance_staff(p_school_id) THEN
    RAISE EXCEPTION 'Not authorized to raise supplier bills';
  END IF;
  SELECT * INTO v_supplier FROM suppliers
  WHERE id = p_supplier_id AND school_id = p_school_id;
  IF v_supplier.id IS NULL THEN
    RAISE EXCEPTION 'Unknown supplier for this school';
  END IF;
  IF NOT v_supplier.is_active THEN
    RAISE EXCEPTION 'Supplier "%" is deactivated', v_supplier.name;
  END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'A bill needs at least one line';
  END IF;

  v_no := public.next_fee_doc_no(p_school_id, 'BILL', v_year);
  v_bill_no := 'BILL-' || v_year || '-' || lpad(v_no::TEXT, 6, '0');

  INSERT INTO supplier_invoices (school_id, supplier_id, bill_no, supplier_ref,
                                 bill_date, due_date, memo, created_by)
  VALUES (p_school_id, p_supplier_id, v_bill_no, NULLIF(trim(COALESCE(p_supplier_ref, '')), ''),
          v_date, COALESCE(p_due_date, v_date + v_supplier.terms_days),
          NULLIF(trim(COALESCE(p_memo, '')), ''), auth.uid())
  RETURNING id INTO v_id;

  INSERT INTO supplier_invoice_items (school_id, invoice_id, gl_account_id,
                                      description, quantity, unit_cost, amount)
  SELECT p_school_id, v_id,
         (l->>'gl_account_id')::UUID,
         COALESCE(NULLIF(trim(l->>'description'), ''), 'Item'),
         COALESCE(NULLIF(l->>'quantity', '')::NUMERIC, 1),
         COALESCE(NULLIF(l->>'unit_cost', '')::NUMERIC, 0),
         round((l->>'amount')::NUMERIC, 2)
  FROM jsonb_array_elements(p_items) AS l;

  IF p_post THEN
    UPDATE supplier_invoices SET status = 'posted' WHERE id = v_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'bill_id', v_id, 'bill_no', v_bill_no,
                            'status', CASE WHEN p_post THEN 'posted' ELSE 'draft' END);
END;
$$;

REVOKE ALL ON FUNCTION public.create_supplier_bill(UUID, UUID, TEXT, DATE, DATE, TEXT, JSONB, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_supplier_bill(UUID, UUID, TEXT, DATE, DATE, TEXT, JSONB, BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.post_supplier_bill(p_school_id UUID, p_bill_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_school_admin(p_school_id)
     AND NOT public.is_finance_staff(p_school_id) THEN
    RAISE EXCEPTION 'Not authorized to post bills';
  END IF;
  UPDATE supplier_invoices SET status = 'posted'
  WHERE id = p_bill_id AND school_id = p_school_id AND status = 'draft';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bill not found or not a draft';
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.post_supplier_bill(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_supplier_bill(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.void_supplier_bill(p_school_id UUID, p_bill_id UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_school_admin(p_school_id)
     AND NOT public.is_finance_staff(p_school_id) THEN
    RAISE EXCEPTION 'Not authorized to void bills';
  END IF;
  UPDATE supplier_invoices SET status = 'void', void_reason = p_reason
  WHERE id = p_bill_id AND school_id = p_school_id AND status <> 'void';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bill not found (or already void)';
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.void_supplier_bill(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_supplier_bill(UUID, UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_supplier_payment(
  p_school_id       UUID,
  p_supplier_id     UUID,
  p_bank_account_id UUID,
  p_amount          NUMERIC,
  p_paid_at         DATE DEFAULT NULL,
  p_reference       TEXT DEFAULT NULL,
  p_memo            TEXT DEFAULT NULL,
  p_allocations     JSONB DEFAULT NULL   -- [{invoice_id, amount}] — omit for oldest-first
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_date       DATE := COALESCE(p_paid_at, current_date);
  v_year       INT  := EXTRACT(YEAR FROM COALESCE(p_paid_at, current_date))::INT;
  v_no         INT;
  v_voucher_no TEXT;
  v_pid        UUID;
  v_remaining  NUMERIC := round(p_amount, 2);
  v_bill       RECORD;
  v_take       NUMERIC;
  v_line       JSONB;
BEGIN
  IF NOT public.is_school_admin(p_school_id)
     AND NOT public.is_finance_staff(p_school_id) THEN
    RAISE EXCEPTION 'Not authorized to record supplier payments';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM suppliers WHERE id = p_supplier_id AND school_id = p_school_id) THEN
    RAISE EXCEPTION 'Unknown supplier for this school';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM bank_accounts
                 WHERE id = p_bank_account_id AND school_id = p_school_id AND is_active) THEN
    RAISE EXCEPTION 'Unknown or inactive paying account';
  END IF;

  v_no := public.next_fee_doc_no(p_school_id, 'PV', v_year);
  v_voucher_no := 'PV-' || v_year || '-' || lpad(v_no::TEXT, 6, '0');

  INSERT INTO supplier_payments (school_id, supplier_id, bank_account_id, voucher_no,
                                 amount, paid_at, reference, memo, created_by)
  VALUES (p_school_id, p_supplier_id, p_bank_account_id, v_voucher_no,
          round(p_amount, 2), v_date,
          NULLIF(trim(COALESCE(p_reference, '')), ''),
          NULLIF(trim(COALESCE(p_memo, '')), ''), auth.uid())
  RETURNING id INTO v_pid;

  IF p_allocations IS NOT NULL AND jsonb_array_length(p_allocations) > 0 THEN
    -- Manual split — the allocation guard enforces every limit.
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_allocations) LOOP
      INSERT INTO supplier_payment_allocations (school_id, payment_id, invoice_id, amount)
      VALUES (p_school_id, v_pid, (v_line->>'invoice_id')::UUID,
              round((v_line->>'amount')::NUMERIC, 2));
    END LOOP;
  ELSE
    -- Oldest bill first (bill date, then creation) until the money runs out.
    FOR v_bill IN
      SELECT i.id, i.total - COALESCE(SUM(a.amount), 0) AS outstanding
      FROM supplier_invoices i
      LEFT JOIN supplier_payment_allocations a ON a.invoice_id = i.id
      WHERE i.school_id = p_school_id AND i.supplier_id = p_supplier_id
        AND i.status IN ('posted', 'part_paid')
      GROUP BY i.id
      HAVING i.total - COALESCE(SUM(a.amount), 0) > 0
      ORDER BY i.bill_date, i.created_at
    LOOP
      EXIT WHEN v_remaining <= 0;
      v_take := LEAST(v_remaining, v_bill.outstanding);
      INSERT INTO supplier_payment_allocations (school_id, payment_id, invoice_id, amount)
      VALUES (p_school_id, v_pid, v_bill.id, v_take);
      v_remaining := v_remaining - v_take;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('ok', true, 'payment_id', v_pid, 'voucher_no', v_voucher_no);
END;
$$;

REVOKE ALL ON FUNCTION public.record_supplier_payment(UUID, UUID, UUID, NUMERIC, DATE, TEXT, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_supplier_payment(UUID, UUID, UUID, NUMERIC, DATE, TEXT, TEXT, JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.void_supplier_payment(p_school_id UUID, p_payment_id UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_school_admin(p_school_id)
     AND NOT public.is_finance_staff(p_school_id) THEN
    RAISE EXCEPTION 'Not authorized to void supplier payments';
  END IF;

  -- Remove the settlements first (bill statuses recompute), then void —
  -- the payment trigger posts the ledger reversal.
  DELETE FROM supplier_payment_allocations
  WHERE payment_id = p_payment_id AND school_id = p_school_id;

  UPDATE supplier_payments SET status = 'voided', void_reason = p_reason
  WHERE id = p_payment_id AND school_id = p_school_id AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found (or already void)';
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.void_supplier_payment(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_supplier_payment(UUID, UUID, TEXT) TO authenticated;

-- --- get_ap_summary — per-supplier billed / paid / outstanding --------------

CREATE OR REPLACE FUNCTION public.get_ap_summary(p_school_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF NOT public.is_school_admin(p_school_id)
     AND NOT public.is_finance_reader(p_school_id) THEN
    RAISE EXCEPTION 'Not authorized to read supplier balances';
  END IF;

  SELECT COALESCE(jsonb_agg(row ORDER BY row->>'name'), '[]'::jsonb) INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'supplier_id', s.id,
      'name',        s.name,
      'bills_total', COALESCE(b.billed, 0),
      'paid_total',  COALESCE(p.paid, 0),
      'outstanding', COALESCE(b.outstanding, 0),
      'open_bills',  COALESCE(b.open_bills, 0)
    ) AS row
    FROM suppliers s
    LEFT JOIN (
      SELECT i.supplier_id,
             SUM(i.total) AS billed,
             SUM(i.total - COALESCE(al.allocated, 0)) AS outstanding,
             COUNT(*) FILTER (WHERE i.status IN ('posted', 'part_paid')) AS open_bills
      FROM supplier_invoices i
      LEFT JOIN (
        SELECT invoice_id, SUM(amount) AS allocated
        FROM supplier_payment_allocations GROUP BY invoice_id
      ) al ON al.invoice_id = i.id
      WHERE i.school_id = p_school_id AND i.status IN ('posted', 'part_paid', 'paid')
      GROUP BY i.supplier_id
    ) b ON b.supplier_id = s.id
    LEFT JOIN (
      SELECT supplier_id, SUM(amount) AS paid
      FROM supplier_payments
      WHERE school_id = p_school_id AND status = 'active'
      GROUP BY supplier_id
    ) p ON p.supplier_id = s.id
    WHERE s.school_id = p_school_id
  ) t;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_ap_summary(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ap_summary(UUID) TO authenticated;

-- Final Accounts — Phase C2: LPOs, petty-cash vouchers, AP reports.
--
-- Adds:
--   purchase_orders (+items)  -- LPO-YYYY-NNNNNN; open → billed | cancelled.
--                                 NO GL effect until billed (an LPO is a promise,
--                                 not a transaction). Items optionally pre-coded
--                                 to GL accounts so the bill can be prefilled.
--   supplier_invoices.purchase_order_id -- the bill that fulfils an LPO; posting
--                                 the bill marks the LPO billed, voiding it re-opens.
--   expense_vouchers           -- PCV-YYYY-NNNNNN one-step small spend:
--                                 Dr expense/asset, Cr the paying (petty-cash)
--                                 account. Void posts the exact reversal.
--   RPCs: create_purchase_order, cancel_purchase_order,
--         record_expense_voucher, void_expense_voucher,
--         get_supplier_statement, get_ap_aging
--
-- Expense summary by account needs no new RPC — get_gl_trial_balance(from, to)
-- filtered to expense accounts already is that report.

-- =====================================================================
-- 1. purchase_orders + items
-- =====================================================================

CREATE TABLE IF NOT EXISTS purchase_orders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES school_registrations(id) ON DELETE CASCADE,
  supplier_id   UUID NOT NULL REFERENCES suppliers(id),
  lpo_no        TEXT NOT NULL,          -- LPO-YYYY-NNNNNN
  order_date    DATE NOT NULL DEFAULT current_date,
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'billed', 'cancelled')),
  total         NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  memo          TEXT,
  cancel_reason TEXT,
  created_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, lpo_no)
);

CREATE INDEX IF NOT EXISTS purchase_orders_supplier_idx ON purchase_orders (supplier_id, status);
CREATE INDEX IF NOT EXISTS purchase_orders_school_idx   ON purchase_orders (school_id, order_date);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES school_registrations(id) ON DELETE CASCADE,
  po_id         UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  gl_account_id UUID REFERENCES gl_accounts(id),   -- optional pre-coding for the bill
  description   TEXT NOT NULL,
  quantity      NUMERIC(12,3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_cost     NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  amount        NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS purchase_order_items_po_idx ON purchase_order_items (po_id);

ALTER TABLE purchase_orders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS purchase_orders_admin_all ON purchase_orders;
CREATE POLICY purchase_orders_admin_all ON purchase_orders
  FOR ALL TO authenticated
  USING (public.is_school_admin(school_id))
  WITH CHECK (public.is_school_admin(school_id));

DROP POLICY IF EXISTS purchase_orders_finance_all ON purchase_orders;
CREATE POLICY purchase_orders_finance_all ON purchase_orders
  FOR ALL TO authenticated
  USING (public.is_finance_staff(school_id))
  WITH CHECK (public.is_finance_staff(school_id));

DROP POLICY IF EXISTS purchase_orders_finance_read ON purchase_orders;
CREATE POLICY purchase_orders_finance_read ON purchase_orders
  FOR SELECT TO authenticated
  USING (public.is_finance_reader(school_id));

DROP POLICY IF EXISTS purchase_order_items_admin_all ON purchase_order_items;
CREATE POLICY purchase_order_items_admin_all ON purchase_order_items
  FOR ALL TO authenticated
  USING (public.is_school_admin(school_id))
  WITH CHECK (public.is_school_admin(school_id));

DROP POLICY IF EXISTS purchase_order_items_finance_all ON purchase_order_items;
CREATE POLICY purchase_order_items_finance_all ON purchase_order_items
  FOR ALL TO authenticated
  USING (public.is_finance_staff(school_id))
  WITH CHECK (public.is_finance_staff(school_id));

DROP POLICY IF EXISTS purchase_order_items_finance_read ON purchase_order_items;
CREATE POLICY purchase_order_items_finance_read ON purchase_order_items
  FOR SELECT TO authenticated
  USING (public.is_finance_reader(school_id));

DROP TRIGGER IF EXISTS purchase_orders_audit ON purchase_orders;
CREATE TRIGGER purchase_orders_audit
  AFTER INSERT OR UPDATE OR DELETE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.fee_audit_row();

DROP TRIGGER IF EXISTS purchase_order_items_audit ON purchase_order_items;
CREATE TRIGGER purchase_order_items_audit
  AFTER INSERT OR UPDATE OR DELETE ON purchase_order_items
  FOR EACH ROW EXECUTE FUNCTION public.fee_audit_row();

-- Items only change while the LPO is open; total stays in sync.
CREATE OR REPLACE FUNCTION public.purchase_order_items_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_status TEXT;
  v_row    purchase_order_items%ROWTYPE;
BEGIN
  v_row := COALESCE(NEW, OLD);
  SELECT status INTO v_status FROM purchase_orders WHERE id = v_row.po_id;
  IF v_status IS DISTINCT FROM 'open' THEN
    RAISE EXCEPTION 'LPO items can only change while the LPO is open';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS purchase_order_items_guard ON purchase_order_items;
CREATE TRIGGER purchase_order_items_guard
  BEFORE INSERT OR UPDATE OR DELETE ON purchase_order_items
  FOR EACH ROW EXECUTE FUNCTION public.purchase_order_items_guard();

CREATE OR REPLACE FUNCTION public.purchase_order_sync_total()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_po UUID := COALESCE(NEW.po_id, OLD.po_id);
BEGIN
  UPDATE purchase_orders
  SET total = COALESCE((SELECT SUM(amount) FROM purchase_order_items WHERE po_id = v_po), 0)
  WHERE id = v_po AND status = 'open';
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS purchase_order_items_sync_total ON purchase_order_items;
CREATE TRIGGER purchase_order_items_sync_total
  AFTER INSERT OR UPDATE OR DELETE ON purchase_order_items
  FOR EACH ROW EXECUTE FUNCTION public.purchase_order_sync_total();

-- LPO lifecycle: an issued document is never deleted; cancel needs a reason;
-- billed ↔ open flips only follow the linked bill.
CREATE OR REPLACE FUNCTION public.purchase_orders_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'LPOs are never deleted — cancel % instead', OLD.lpo_no;
  END IF;
  IF OLD.status = 'cancelled' THEN
    RAISE EXCEPTION 'LPO % is cancelled and cannot change', OLD.lpo_no;
  END IF;
  IF NEW.status = 'cancelled' THEN
    IF OLD.status = 'billed' THEN
      RAISE EXCEPTION 'LPO % is billed — void the bill first', OLD.lpo_no;
    END IF;
    IF NULLIF(trim(COALESCE(NEW.cancel_reason, '')), '') IS NULL THEN
      RAISE EXCEPTION 'A reason is required to cancel an LPO';
    END IF;
  END IF;
  IF OLD.status = 'billed'
     AND (NEW.supplier_id IS DISTINCT FROM OLD.supplier_id
          OR NEW.total    IS DISTINCT FROM OLD.total
          OR NEW.lpo_no   IS DISTINCT FROM OLD.lpo_no) THEN
    RAISE EXCEPTION 'A billed LPO cannot be edited';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS purchase_orders_guard ON purchase_orders;
CREATE TRIGGER purchase_orders_guard
  BEFORE UPDATE OR DELETE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.purchase_orders_guard();

-- =====================================================================
-- 2. Bill ↔ LPO link
-- =====================================================================

ALTER TABLE supplier_invoices
  ADD COLUMN IF NOT EXISTS purchase_order_id UUID REFERENCES purchase_orders(id);

CREATE INDEX IF NOT EXISTS supplier_invoices_po_idx
  ON supplier_invoices (purchase_order_id) WHERE purchase_order_id IS NOT NULL;

-- Posting a linked bill marks the LPO billed; voiding that bill re-opens it.
CREATE OR REPLACE FUNCTION public.supplier_invoices_sync_lpo()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.purchase_order_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.status = 'posted' AND OLD.status = 'draft' THEN
    UPDATE purchase_orders SET status = 'billed'
    WHERE id = NEW.purchase_order_id AND status = 'open';
  ELSIF NEW.status = 'void' AND OLD.status <> 'void' THEN
    UPDATE purchase_orders SET status = 'open'
    WHERE id = NEW.purchase_order_id AND status = 'billed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS supplier_invoices_sync_lpo ON supplier_invoices;
CREATE TRIGGER supplier_invoices_sync_lpo
  AFTER UPDATE ON supplier_invoices
  FOR EACH ROW EXECUTE FUNCTION public.supplier_invoices_sync_lpo();

-- create_supplier_bill gains the LPO link (replaces the C1 signature).
DROP FUNCTION IF EXISTS public.create_supplier_bill(UUID, UUID, TEXT, DATE, DATE, TEXT, JSONB, BOOLEAN);

CREATE OR REPLACE FUNCTION public.create_supplier_bill(
  p_school_id         UUID,
  p_supplier_id       UUID,
  p_supplier_ref      TEXT,
  p_bill_date         DATE,
  p_due_date          DATE,
  p_memo              TEXT,
  p_items             JSONB,
  p_post              BOOLEAN DEFAULT false,
  p_purchase_order_id UUID DEFAULT NULL
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
  IF p_purchase_order_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM purchase_orders
    WHERE id = p_purchase_order_id AND school_id = p_school_id
      AND supplier_id = p_supplier_id AND status = 'open'
  ) THEN
    RAISE EXCEPTION 'LPO not found, not open, or belongs to another supplier';
  END IF;

  v_no := public.next_fee_doc_no(p_school_id, 'BILL', v_year);
  v_bill_no := 'BILL-' || v_year || '-' || lpad(v_no::TEXT, 6, '0');

  INSERT INTO supplier_invoices (school_id, supplier_id, bill_no, supplier_ref,
                                 bill_date, due_date, memo, purchase_order_id, created_by)
  VALUES (p_school_id, p_supplier_id, v_bill_no, NULLIF(trim(COALESCE(p_supplier_ref, '')), ''),
          v_date, COALESCE(p_due_date, v_date + v_supplier.terms_days),
          NULLIF(trim(COALESCE(p_memo, '')), ''), p_purchase_order_id, auth.uid())
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

REVOKE ALL ON FUNCTION public.create_supplier_bill(UUID, UUID, TEXT, DATE, DATE, TEXT, JSONB, BOOLEAN, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_supplier_bill(UUID, UUID, TEXT, DATE, DATE, TEXT, JSONB, BOOLEAN, UUID) TO authenticated;

-- --- LPO RPCs ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_purchase_order(
  p_school_id   UUID,
  p_supplier_id UUID,
  p_order_date  DATE,
  p_memo        TEXT,
  p_items       JSONB      -- [{description, quantity?, unit_cost?, amount, gl_account_id?}]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_date   DATE := COALESCE(p_order_date, current_date);
  v_year   INT  := EXTRACT(YEAR FROM COALESCE(p_order_date, current_date))::INT;
  v_no     INT;
  v_lpo_no TEXT;
  v_id     UUID;
BEGIN
  IF NOT public.is_school_admin(p_school_id)
     AND NOT public.is_finance_staff(p_school_id) THEN
    RAISE EXCEPTION 'Not authorized to raise purchase orders';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM suppliers
                 WHERE id = p_supplier_id AND school_id = p_school_id AND is_active) THEN
    RAISE EXCEPTION 'Unknown or inactive supplier for this school';
  END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'An LPO needs at least one line';
  END IF;

  v_no := public.next_fee_doc_no(p_school_id, 'LPO', v_year);
  v_lpo_no := 'LPO-' || v_year || '-' || lpad(v_no::TEXT, 6, '0');

  INSERT INTO purchase_orders (school_id, supplier_id, lpo_no, order_date, memo, created_by)
  VALUES (p_school_id, p_supplier_id, v_lpo_no, v_date,
          NULLIF(trim(COALESCE(p_memo, '')), ''), auth.uid())
  RETURNING id INTO v_id;

  INSERT INTO purchase_order_items (school_id, po_id, gl_account_id,
                                    description, quantity, unit_cost, amount)
  SELECT p_school_id, v_id,
         NULLIF(l->>'gl_account_id', '')::UUID,
         COALESCE(NULLIF(trim(l->>'description'), ''), 'Item'),
         COALESCE(NULLIF(l->>'quantity', '')::NUMERIC, 1),
         COALESCE(NULLIF(l->>'unit_cost', '')::NUMERIC, 0),
         round((l->>'amount')::NUMERIC, 2)
  FROM jsonb_array_elements(p_items) AS l;

  RETURN jsonb_build_object('ok', true, 'po_id', v_id, 'lpo_no', v_lpo_no);
END;
$$;

REVOKE ALL ON FUNCTION public.create_purchase_order(UUID, UUID, DATE, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_purchase_order(UUID, UUID, DATE, TEXT, JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_purchase_order(p_school_id UUID, p_po_id UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_school_admin(p_school_id)
     AND NOT public.is_finance_staff(p_school_id) THEN
    RAISE EXCEPTION 'Not authorized to cancel purchase orders';
  END IF;
  UPDATE purchase_orders SET status = 'cancelled', cancel_reason = p_reason
  WHERE id = p_po_id AND school_id = p_school_id AND status = 'open';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'LPO not found or not open';
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_purchase_order(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_purchase_order(UUID, UUID, TEXT) TO authenticated;

-- =====================================================================
-- 3. expense_vouchers — one-step petty-cash / direct expense
-- =====================================================================

CREATE TABLE IF NOT EXISTS expense_vouchers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID NOT NULL REFERENCES school_registrations(id) ON DELETE CASCADE,
  bank_account_id UUID NOT NULL REFERENCES bank_accounts(id),   -- usually petty cash
  gl_account_id   UUID NOT NULL REFERENCES gl_accounts(id),     -- the expense head
  voucher_no      TEXT NOT NULL,       -- PCV-YYYY-NNNNNN
  payee           TEXT NOT NULL,       -- who received the money
  description     TEXT NOT NULL,
  amount          NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  expense_date    DATE NOT NULL DEFAULT current_date,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'voided')),
  void_reason     TEXT,
  voided_at       TIMESTAMPTZ,
  voided_by       UUID,
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, voucher_no)
);

CREATE INDEX IF NOT EXISTS expense_vouchers_school_idx ON expense_vouchers (school_id, expense_date);

ALTER TABLE expense_vouchers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS expense_vouchers_admin_all ON expense_vouchers;
CREATE POLICY expense_vouchers_admin_all ON expense_vouchers
  FOR ALL TO authenticated
  USING (public.is_school_admin(school_id))
  WITH CHECK (public.is_school_admin(school_id));

DROP POLICY IF EXISTS expense_vouchers_finance_all ON expense_vouchers;
CREATE POLICY expense_vouchers_finance_all ON expense_vouchers
  FOR ALL TO authenticated
  USING (public.is_finance_staff(school_id))
  WITH CHECK (public.is_finance_staff(school_id));

DROP POLICY IF EXISTS expense_vouchers_finance_read ON expense_vouchers;
CREATE POLICY expense_vouchers_finance_read ON expense_vouchers
  FOR SELECT TO authenticated
  USING (public.is_finance_reader(school_id));

DROP TRIGGER IF EXISTS expense_vouchers_audit ON expense_vouchers;
CREATE TRIGGER expense_vouchers_audit
  AFTER INSERT OR UPDATE OR DELETE ON expense_vouchers
  FOR EACH ROW EXECUTE FUNCTION public.fee_audit_row();

-- Lifecycle: never deleted, never edited — void with a reason.
CREATE OR REPLACE FUNCTION public.expense_vouchers_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_acct RECORD;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Vouchers are never deleted — void % instead', OLD.voucher_no;
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT type, is_active, school_id INTO v_acct
    FROM gl_accounts WHERE id = NEW.gl_account_id;
    IF v_acct IS NULL OR v_acct.school_id <> NEW.school_id THEN
      RAISE EXCEPTION 'Unknown ledger account on voucher';
    END IF;
    IF v_acct.type NOT IN ('expense', 'asset') THEN
      RAISE EXCEPTION 'Vouchers must be coded to an expense or asset account';
    END IF;
    IF NOT v_acct.is_active THEN
      RAISE EXCEPTION 'Cannot code a voucher to a deactivated account';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = 'voided' THEN
    RAISE EXCEPTION 'Voucher % is void and cannot change', OLD.voucher_no;
  END IF;
  IF NEW.status = 'voided' THEN
    IF NULLIF(trim(COALESCE(NEW.void_reason, '')), '') IS NULL THEN
      RAISE EXCEPTION 'A reason is required to void a voucher';
    END IF;
    NEW.voided_at := now();
    NEW.voided_by := COALESCE(NEW.voided_by, auth.uid());
  ELSIF (NEW.bank_account_id IS DISTINCT FROM OLD.bank_account_id
      OR NEW.gl_account_id   IS DISTINCT FROM OLD.gl_account_id
      OR NEW.amount          IS DISTINCT FROM OLD.amount
      OR NEW.expense_date    IS DISTINCT FROM OLD.expense_date
      OR NEW.voucher_no      IS DISTINCT FROM OLD.voucher_no) THEN
    RAISE EXCEPTION 'A voucher cannot be edited — void it and record afresh';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS expense_vouchers_guard ON expense_vouchers;
CREATE TRIGGER expense_vouchers_guard
  BEFORE INSERT OR UPDATE OR DELETE ON expense_vouchers
  FOR EACH ROW EXECUTE FUNCTION public.expense_vouchers_guard();

-- GL: Dr expense/asset, Cr paying account; void reverses.
CREATE OR REPLACE FUNCTION public.expense_vouchers_post_gl()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
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

  SELECT gl_account_id INTO v_bank_gl FROM bank_accounts WHERE id = NEW.bank_account_id;
  IF v_bank_gl IS NULL THEN
    RAISE EXCEPTION 'Paying account has no ledger account';
  END IF;

  v_year := EXTRACT(YEAR FROM CASE WHEN v_void THEN current_date ELSE NEW.expense_date END)::INT;
  v_memo := CASE WHEN v_void
    THEN 'VOID ' || NEW.voucher_no || ' — ' || COALESCE(NEW.void_reason, '')
    ELSE NEW.voucher_no || ' — ' || NEW.payee || ': ' || NEW.description END;

  v_no := public.next_fee_doc_no(NEW.school_id, 'JRN', v_year);
  INSERT INTO gl_journals (school_id, journal_no, entry_date, source_type, source_id, memo, posted_by)
  VALUES (NEW.school_id, 'JRN-' || v_year || '-' || lpad(v_no::TEXT, 6, '0'),
          CASE WHEN v_void THEN current_date ELSE NEW.expense_date END,
          CASE WHEN v_void THEN 'petty_expense_void' ELSE 'petty_expense' END,
          NEW.id, v_memo, auth.uid())
  RETURNING id INTO v_jid;

  IF v_void THEN
    INSERT INTO gl_journal_lines (school_id, journal_id, account_id, debit, credit, narration)
    VALUES
      (NEW.school_id, v_jid, v_bank_gl,        NEW.amount, 0, v_memo),
      (NEW.school_id, v_jid, NEW.gl_account_id, 0, NEW.amount, v_memo);
  ELSE
    INSERT INTO gl_journal_lines (school_id, journal_id, account_id, debit, credit, narration)
    VALUES
      (NEW.school_id, v_jid, NEW.gl_account_id, NEW.amount, 0, v_memo),
      (NEW.school_id, v_jid, v_bank_gl,        0, NEW.amount, v_memo);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS expense_vouchers_post_gl ON expense_vouchers;
CREATE TRIGGER expense_vouchers_post_gl
  AFTER INSERT OR UPDATE ON expense_vouchers
  FOR EACH ROW EXECUTE FUNCTION public.expense_vouchers_post_gl();

CREATE OR REPLACE FUNCTION public.record_expense_voucher(
  p_school_id       UUID,
  p_bank_account_id UUID,
  p_gl_account_id   UUID,
  p_payee           TEXT,
  p_description     TEXT,
  p_amount          NUMERIC,
  p_expense_date    DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_date       DATE := COALESCE(p_expense_date, current_date);
  v_year       INT  := EXTRACT(YEAR FROM COALESCE(p_expense_date, current_date))::INT;
  v_no         INT;
  v_voucher_no TEXT;
  v_id         UUID;
BEGIN
  IF NOT public.is_school_admin(p_school_id)
     AND NOT public.is_finance_staff(p_school_id) THEN
    RAISE EXCEPTION 'Not authorized to record expenses';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero';
  END IF;
  IF NULLIF(trim(COALESCE(p_payee, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Say who received the money';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM bank_accounts
                 WHERE id = p_bank_account_id AND school_id = p_school_id AND is_active) THEN
    RAISE EXCEPTION 'Unknown or inactive paying account';
  END IF;

  v_no := public.next_fee_doc_no(p_school_id, 'PCV', v_year);
  v_voucher_no := 'PCV-' || v_year || '-' || lpad(v_no::TEXT, 6, '0');

  INSERT INTO expense_vouchers (school_id, bank_account_id, gl_account_id, voucher_no,
                                payee, description, amount, expense_date, created_by)
  VALUES (p_school_id, p_bank_account_id, p_gl_account_id, v_voucher_no,
          trim(p_payee), COALESCE(NULLIF(trim(COALESCE(p_description, '')), ''), 'Expense'),
          round(p_amount, 2), v_date, auth.uid())
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'voucher_id', v_id, 'voucher_no', v_voucher_no);
END;
$$;

REVOKE ALL ON FUNCTION public.record_expense_voucher(UUID, UUID, UUID, TEXT, TEXT, NUMERIC, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_expense_voucher(UUID, UUID, UUID, TEXT, TEXT, NUMERIC, DATE) TO authenticated;

CREATE OR REPLACE FUNCTION public.void_expense_voucher(p_school_id UUID, p_voucher_id UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_school_admin(p_school_id)
     AND NOT public.is_finance_staff(p_school_id) THEN
    RAISE EXCEPTION 'Not authorized to void vouchers';
  END IF;
  UPDATE expense_vouchers SET status = 'voided', void_reason = p_reason
  WHERE id = p_voucher_id AND school_id = p_school_id AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Voucher not found (or already void)';
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.void_expense_voucher(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_expense_voucher(UUID, UUID, TEXT) TO authenticated;

-- =====================================================================
-- 4. Reports — supplier statement + AP aging
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_supplier_statement(
  p_school_id   UUID,
  p_supplier_id UUID,
  p_from        DATE DEFAULT NULL,
  p_to          DATE DEFAULT NULL
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
    RAISE EXCEPTION 'Not authorized to read supplier statements';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM suppliers WHERE id = p_supplier_id AND school_id = p_school_id) THEN
    RAISE EXCEPTION 'Unknown supplier for this school';
  END IF;

  IF p_from IS NOT NULL THEN
    SELECT COALESCE((
      SELECT SUM(total) FROM supplier_invoices
      WHERE school_id = p_school_id AND supplier_id = p_supplier_id
        AND status IN ('posted', 'part_paid', 'paid') AND bill_date < p_from), 0)
    - COALESCE((
      SELECT SUM(amount) FROM supplier_payments
      WHERE school_id = p_school_id AND supplier_id = p_supplier_id
        AND status = 'active' AND paid_at < p_from), 0)
    INTO v_opening;
  END IF;

  SELECT COALESCE(jsonb_agg(row ORDER BY (row->>'seq')::BIGINT), '[]'::jsonb) INTO v_entries
  FROM (
    SELECT jsonb_build_object(
      'seq',        row_number() OVER w,
      'entry_date', d.entry_date,
      'doc_no',     d.doc_no,
      'kind',       d.kind,
      'description', d.description,
      'debit',      d.debit,     -- billed (owed goes up)
      'credit',     d.credit,    -- paid (owed goes down)
      'balance',    v_opening + SUM(d.debit - d.credit) OVER w
    ) AS row
    FROM (
      SELECT i.bill_date AS entry_date, i.bill_no AS doc_no, 'bill' AS kind,
             COALESCE(i.memo, i.supplier_ref, '') AS description,
             i.total AS debit, 0::NUMERIC AS credit, i.created_at
      FROM supplier_invoices i
      WHERE i.school_id = p_school_id AND i.supplier_id = p_supplier_id
        AND i.status IN ('posted', 'part_paid', 'paid')
      UNION ALL
      SELECT p.paid_at, p.voucher_no, 'payment',
             COALESCE(p.memo, p.reference, ''),
             0::NUMERIC, p.amount, p.created_at
      FROM supplier_payments p
      WHERE p.school_id = p_school_id AND p.supplier_id = p_supplier_id
        AND p.status = 'active'
    ) d
    WHERE (p_from IS NULL OR d.entry_date >= p_from)
      AND (p_to   IS NULL OR d.entry_date <= p_to)
    WINDOW w AS (ORDER BY d.entry_date, d.created_at)
  ) t;

  RETURN jsonb_build_object('opening_balance', v_opening, 'entries', v_entries);
END;
$$;

REVOKE ALL ON FUNCTION public.get_supplier_statement(UUID, UUID, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_supplier_statement(UUID, UUID, DATE, DATE) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_ap_aging(
  p_school_id UUID,
  p_as_of     DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_as_of  DATE := COALESCE(p_as_of, current_date);
  v_result JSONB;
BEGIN
  IF NOT public.is_school_admin(p_school_id)
     AND NOT public.is_finance_reader(p_school_id) THEN
    RAISE EXCEPTION 'Not authorized to read AP aging';
  END IF;

  SELECT COALESCE(jsonb_agg(row ORDER BY row->>'name'), '[]'::jsonb) INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'supplier_id', s.id,
      'name',        s.name,
      'current',     SUM(o.outstanding) FILTER (WHERE o.age <= 0),
      'd1_30',       SUM(o.outstanding) FILTER (WHERE o.age BETWEEN 1 AND 30),
      'd31_60',      SUM(o.outstanding) FILTER (WHERE o.age BETWEEN 31 AND 60),
      'd61_90',      SUM(o.outstanding) FILTER (WHERE o.age BETWEEN 61 AND 90),
      'd90_plus',    SUM(o.outstanding) FILTER (WHERE o.age > 90),
      'total',       SUM(o.outstanding)
    ) AS row
    FROM suppliers s
    JOIN (
      SELECT i.supplier_id,
             i.total - COALESCE(SUM(a.amount), 0) AS outstanding,
             (v_as_of - COALESCE(i.due_date, i.bill_date))::INT AS age
      FROM supplier_invoices i
      LEFT JOIN supplier_payment_allocations a ON a.invoice_id = i.id
      WHERE i.school_id = p_school_id
        AND i.status IN ('posted', 'part_paid')
        AND i.bill_date <= v_as_of
      GROUP BY i.id
      HAVING i.total - COALESCE(SUM(a.amount), 0) > 0
    ) o ON o.supplier_id = s.id
    WHERE s.school_id = p_school_id
    GROUP BY s.id, s.name
  ) t;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_ap_aging(UUID, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ap_aging(UUID, DATE) TO authenticated;

-- Fees module — Phase 3: payments, allocation & receipts.
--
-- Adds:
--   fee_payments (extended)        -- payer_name, narration, void semantics
--   fee_payment_allocations        -- payment -> invoice item splits
--   fee_receipts                   -- sequential receipts (RCT-2026-000318)
--   allocate_student_payments()    -- THE allocator: applies any unallocated
--                                     active payment money to outstanding
--                                     invoice items (oldest invoice first,
--                                     then votehead priority)
--   refresh_student_invoice_statuses() -- issued/partially_paid/paid
--   record_fee_payment()           -- insert + allocate + receipt, one txn
--   void_fee_payment()             -- soft void; receipt marked void
--   generate_invoices()            -- REPLACED: now auto-applies existing
--                                     credit to freshly created invoices
--   get_student_fee_summary()      -- paid now excludes voided payments
--
-- Design notes:
--   - Allocations reference invoice ITEMS (which carry the votehead), so a
--     receipt can show exactly which votehead each shilling settled.
--   - Overpayment: whatever the allocator cannot place stays unallocated on
--     the payment = the student's credit. When new invoices are generated,
--     generate_invoices() re-runs the allocator, so credit auto-applies
--     (PRD AC-3).
--   - Voiding never deletes: the payment row, its allocation rows and its
--     receipt all remain, but every computation filters status <> 'voided'
--     (PRD AC-4; the append-only ledger arrives in Phase 5).
--   - Historical fee_payments rows become status 'active' with no
--     allocations; they behave as credit and settle automatically the next
--     time invoices are generated or a payment is recorded.

-- =====================================================================
-- 1. fee_payments: void semantics + payer details
-- =====================================================================

ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS payer_name  TEXT;
ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS narration   TEXT;
ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS status      TEXT NOT NULL DEFAULT 'active';
ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS void_reason TEXT;
ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS voided_at   TIMESTAMPTZ;
ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS voided_by   UUID;

DO $$
BEGIN
  ALTER TABLE fee_payments
    ADD CONSTRAINT fee_payments_status_check
    CHECK (status IN ('active', 'voided'));
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$$;

-- =====================================================================
-- 2. fee_payment_allocations + fee_receipts
-- =====================================================================

CREATE TABLE IF NOT EXISTS fee_payment_allocations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID NOT NULL REFERENCES school_registrations(id) ON DELETE CASCADE,
  payment_id       UUID NOT NULL REFERENCES fee_payments(id) ON DELETE CASCADE,
  invoice_id       UUID NOT NULL REFERENCES fee_invoices(id) ON DELETE CASCADE,
  invoice_item_id  UUID NOT NULL REFERENCES fee_invoice_items(id) ON DELETE CASCADE,
  amount           NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fee_payment_allocations_payment_idx ON fee_payment_allocations (payment_id);
CREATE INDEX IF NOT EXISTS fee_payment_allocations_invoice_idx ON fee_payment_allocations (invoice_id);
CREATE INDEX IF NOT EXISTS fee_payment_allocations_item_idx    ON fee_payment_allocations (invoice_item_id);

CREATE TABLE IF NOT EXISTS fee_receipts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID NOT NULL REFERENCES school_registrations(id) ON DELETE CASCADE,
  payment_id  UUID NOT NULL REFERENCES fee_payments(id) ON DELETE CASCADE,
  receipt_no  TEXT NOT NULL,
  issued_by   UUID,
  issued_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_void     BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (school_id, receipt_no)
);

CREATE UNIQUE INDEX IF NOT EXISTS fee_receipts_payment_idx ON fee_receipts (payment_id);

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY['fee_payment_allocations', 'fee_receipts'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS %I_admin_all ON %I', t, t);
    EXECUTE format($f$
      CREATE POLICY %I_admin_all ON %I
      FOR ALL TO authenticated
      USING (public.is_school_admin(school_id))
      WITH CHECK (public.is_school_admin(school_id))
    $f$, t, t);

    EXECUTE format('DROP POLICY IF EXISTS %I_finance_all ON %I', t, t);
    EXECUTE format($f$
      CREATE POLICY %I_finance_all ON %I
      FOR ALL TO authenticated
      USING (public.is_finance_staff(school_id))
      WITH CHECK (public.is_finance_staff(school_id))
    $f$, t, t);

    EXECUTE format('DROP POLICY IF EXISTS %I_finance_read ON %I', t, t);
    EXECUTE format($f$
      CREATE POLICY %I_finance_read ON %I
      FOR SELECT TO authenticated
      USING (public.is_finance_reader(school_id))
    $f$, t, t);
  END LOOP;
END;
$$;

-- =====================================================================
-- 3. Invoice status refresh (issued / partially_paid / paid)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.refresh_student_invoice_statuses(p_student_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE fee_invoices i
  SET status = CASE
    WHEN paid.amt >= i.total AND i.total > 0 THEN 'paid'
    WHEN paid.amt > 0                        THEN 'partially_paid'
    ELSE 'issued'
  END
  FROM (
    SELECT i2.id,
           COALESCE(SUM(CASE WHEN p.status = 'active' THEN a.amount ELSE 0 END), 0) AS amt
    FROM fee_invoices i2
    LEFT JOIN fee_payment_allocations a ON a.invoice_id = i2.id
    LEFT JOIN fee_payments p ON p.id = a.payment_id
    WHERE i2.student_id = p_student_id AND i2.status <> 'cancelled'
    GROUP BY i2.id
  ) paid
  WHERE i.id = paid.id AND i.status <> 'cancelled';
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_student_invoice_statuses(UUID) FROM PUBLIC, anon, authenticated;

-- =====================================================================
-- 4. The allocator
-- =====================================================================
-- Applies every active payment's unallocated remainder to the student's
-- outstanding invoice items: oldest invoice first, then votehead priority.
-- Idempotent: re-running with nothing to place allocates nothing.

CREATE OR REPLACE FUNCTION public.allocate_student_payments(p_student_id UUID)
RETURNS NUMERIC   -- total newly allocated by this call
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pay        RECORD;
  v_item       RECORD;
  v_remaining  NUMERIC(14,2);
  v_alloc      NUMERIC(14,2);
  v_total_new  NUMERIC(14,2) := 0;
BEGIN
  FOR v_pay IN
    SELECT p.id, p.school_id,
           p.amount - COALESCE((
             SELECT SUM(a.amount) FROM fee_payment_allocations a
             WHERE a.payment_id = p.id
           ), 0) AS unallocated
    FROM fee_payments p
    WHERE p.student_id = p_student_id
      AND p.status = 'active'
    ORDER BY p.paid_at, p.created_at
  LOOP
    v_remaining := v_pay.unallocated;
    CONTINUE WHEN v_remaining <= 0;

    FOR v_item IN
      SELECT ii.id, ii.invoice_id,
             ii.amount - COALESCE((
               SELECT SUM(a.amount)
               FROM fee_payment_allocations a
               JOIN fee_payments pp ON pp.id = a.payment_id AND pp.status = 'active'
               WHERE a.invoice_item_id = ii.id
             ), 0) AS outstanding
      FROM fee_invoice_items ii
      JOIN fee_invoices i ON i.id = ii.invoice_id
      LEFT JOIN voteheads vh ON vh.id = ii.votehead_id
      WHERE i.student_id = p_student_id
        AND i.status <> 'cancelled'
      ORDER BY i.issue_date, i.created_at, COALESCE(vh.priority, 999), ii.created_at
    LOOP
      EXIT WHEN v_remaining <= 0;
      CONTINUE WHEN v_item.outstanding <= 0;

      v_alloc := LEAST(v_remaining, v_item.outstanding);
      INSERT INTO fee_payment_allocations (school_id, payment_id, invoice_id, invoice_item_id, amount)
      VALUES (v_pay.school_id, v_pay.id, v_item.invoice_id, v_item.id, v_alloc);

      v_remaining := v_remaining - v_alloc;
      v_total_new := v_total_new + v_alloc;
    END LOOP;
  END LOOP;

  PERFORM public.refresh_student_invoice_statuses(p_student_id);
  RETURN v_total_new;
END;
$$;

REVOKE ALL ON FUNCTION public.allocate_student_payments(UUID) FROM PUBLIC, anon, authenticated;

-- =====================================================================
-- 5. record_fee_payment — insert + allocate + receipt in one transaction
-- =====================================================================

CREATE OR REPLACE FUNCTION public.record_fee_payment(
  p_school_id  UUID,
  p_student_id UUID,
  p_amount     NUMERIC,
  p_year       INT,
  p_method     TEXT DEFAULT NULL,
  p_reference  TEXT DEFAULT NULL,
  p_payer_name TEXT DEFAULT NULL,
  p_narration  TEXT DEFAULT NULL,
  p_term       INT  DEFAULT NULL,
  p_paid_on    DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment_id  UUID;
  v_receipt_no  TEXT;
  v_seq         INT;
  v_allocated   NUMERIC(14,2);
  v_credit      NUMERIC(14,2);
  v_allocations JSONB;
  v_paid_at     TIMESTAMPTZ;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero';
  END IF;
  IF NOT public.is_school_admin(p_school_id)
     AND NOT public.is_finance_staff(p_school_id) THEN
    RAISE EXCEPTION 'Not authorized to record payments for this school';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM students WHERE id = p_student_id AND school_id = p_school_id) THEN
    RAISE EXCEPTION 'Student not found in this school';
  END IF;

  v_paid_at := COALESCE(p_paid_on::timestamptz, now());

  INSERT INTO fee_payments (school_id, student_id, amount, year, term, method,
                            reference, payer_name, narration, paid_at, status, recorded_by)
  VALUES (p_school_id, p_student_id, round(p_amount::numeric, 2), p_year, p_term,
          NULLIF(trim(COALESCE(p_method, '')), ''),
          NULLIF(trim(COALESCE(p_reference, '')), ''),
          NULLIF(trim(COALESCE(p_payer_name, '')), ''),
          NULLIF(trim(COALESCE(p_narration, '')), ''),
          v_paid_at, 'active', auth.uid())
  RETURNING id INTO v_payment_id;

  PERFORM public.allocate_student_payments(p_student_id);

  -- How this specific payment landed
  SELECT COALESCE(SUM(a.amount), 0),
         COALESCE(jsonb_agg(jsonb_build_object(
           'description', ii.description,
           'invoice_no',  i.invoice_no,
           'amount',      a.amount
         ) ORDER BY a.created_at), '[]'::jsonb)
  INTO v_allocated, v_allocations
  FROM fee_payment_allocations a
  JOIN fee_invoice_items ii ON ii.id = a.invoice_item_id
  JOIN fee_invoices i ON i.id = a.invoice_id
  WHERE a.payment_id = v_payment_id;

  v_credit := round(p_amount::numeric, 2) - v_allocated;

  v_seq := public.next_fee_doc_no(p_school_id, 'RCT', p_year);
  v_receipt_no := format('RCT-%s-%s', p_year, lpad(v_seq::text, 6, '0'));

  INSERT INTO fee_receipts (school_id, payment_id, receipt_no, issued_by)
  VALUES (p_school_id, v_payment_id, v_receipt_no, auth.uid());

  RETURN jsonb_build_object(
    'payment_id',  v_payment_id,
    'receipt_no',  v_receipt_no,
    'amount',      round(p_amount::numeric, 2),
    'allocated',   v_allocated,
    'credit',      v_credit,
    'allocations', v_allocations
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_fee_payment(UUID, UUID, NUMERIC, INT, TEXT, TEXT, TEXT, TEXT, INT, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_fee_payment(UUID, UUID, NUMERIC, INT, TEXT, TEXT, TEXT, TEXT, INT, DATE) TO authenticated;

-- =====================================================================
-- 6. void_fee_payment — soft void, receipt voided, statuses refreshed
-- =====================================================================

CREATE OR REPLACE FUNCTION public.void_fee_payment(p_payment_id UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id  UUID;
  v_student_id UUID;
  v_status     TEXT;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'A void reason is required';
  END IF;

  SELECT school_id, student_id, status INTO v_school_id, v_student_id, v_status
  FROM fee_payments WHERE id = p_payment_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'Payment not found'; END IF;

  IF NOT public.is_school_admin(v_school_id)
     AND NOT public.is_finance_staff(v_school_id) THEN
    RAISE EXCEPTION 'Not authorized to void payments for this school';
  END IF;

  IF v_status = 'voided' THEN
    RAISE EXCEPTION 'Payment is already voided';
  END IF;

  UPDATE fee_payments
  SET status = 'voided',
      void_reason = trim(p_reason),
      voided_at = now(),
      voided_by = auth.uid()
  WHERE id = p_payment_id;

  UPDATE fee_receipts SET is_void = true WHERE payment_id = p_payment_id;

  -- Allocation rows are kept for audit; every computation filters them out
  -- via payment status. Invoice statuses must be recomputed now.
  PERFORM public.refresh_student_invoice_statuses(v_student_id);

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.void_fee_payment(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_fee_payment(UUID, TEXT) TO authenticated;

-- =====================================================================
-- 7. generate_invoices — REPLACED: auto-apply existing credit (AC-3)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.generate_invoices(
  p_school_id  UUID,
  p_year       INT,
  p_term       INT,
  p_fee_level  TEXT DEFAULT NULL,
  p_level_id   TEXT DEFAULT NULL,
  p_stream_id  UUID DEFAULT NULL,
  p_student_id UUID DEFAULT NULL,
  p_due_date   DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student           RECORD;
  v_line              RECORD;
  v_fee_level         TEXT;
  v_invoice_id        UUID;
  v_invoice_no        TEXT;
  v_seq               INT;
  v_total             NUMERIC(14,2);
  v_created           INT := 0;
  v_skipped_existing  INT := 0;
  v_skipped_no_items  INT := 0;
  v_amount_total      NUMERIC(14,2) := 0;
  v_credit_applied    NUMERIC(14,2) := 0;
BEGIN
  IF p_term NOT IN (1, 2, 3) THEN
    RAISE EXCEPTION 'Term must be 1, 2 or 3';
  END IF;

  IF NOT public.is_school_admin(p_school_id)
     AND NOT public.is_finance_staff(p_school_id) THEN
    RAISE EXCEPTION 'Not authorized to generate invoices for this school';
  END IF;

  FOR v_student IN
    SELECT s.id, s.level_id, s.dorm_id
    FROM students s
    WHERE s.school_id = p_school_id
      AND (p_student_id IS NULL OR s.id = p_student_id)
      AND (p_level_id  IS NULL OR s.level_id = p_level_id)
      AND (p_stream_id IS NULL OR s.stream_id = p_stream_id)
      AND (p_fee_level IS NULL OR public.fee_level_for_grade(s.level_id) = p_fee_level)
    ORDER BY s.adm_no
  LOOP
    IF EXISTS (
      SELECT 1 FROM fee_invoices i
      WHERE i.student_id = v_student.id
        AND i.year = p_year AND i.term = p_term
        AND i.status <> 'cancelled'
    ) THEN
      v_skipped_existing := v_skipped_existing + 1;
      CONTINUE;
    END IF;

    v_fee_level := public.fee_level_for_grade(v_student.level_id);
    v_total := 0;

    SELECT COALESCE(SUM(
      CASE p_term WHEN 1 THEN fs.t1 WHEN 2 THEN fs.t2 ELSE fs.t3 END
    ), 0) INTO v_total
    FROM fee_structures fs
    JOIN voteheads vh ON vh.id = fs.votehead_id
    WHERE fs.school_id = p_school_id
      AND fs.fee_level = v_fee_level
      AND fs.year = p_year
      AND fs.status = 'published'
      AND vh.is_active
      AND (
        vh.applies_to = 'all'
        OR (vh.applies_to = 'boarders' AND v_student.dorm_id IS NOT NULL)
        OR (vh.applies_to = 'day'      AND v_student.dorm_id IS NULL)
      )
      AND (CASE p_term WHEN 1 THEN fs.t1 WHEN 2 THEN fs.t2 ELSE fs.t3 END) > 0;

    IF v_total <= 0 THEN
      v_skipped_no_items := v_skipped_no_items + 1;
      CONTINUE;
    END IF;

    v_seq := public.next_fee_doc_no(p_school_id, 'INV', p_year);
    v_invoice_no := format('INV-%s-T%s-%s', p_year, p_term, lpad(v_seq::text, 6, '0'));

    INSERT INTO fee_invoices (school_id, student_id, invoice_no, year, term,
                              fee_level, due_date, status, total, created_by)
    VALUES (p_school_id, v_student.id, v_invoice_no, p_year, p_term,
            v_fee_level, p_due_date, 'issued', v_total, auth.uid())
    RETURNING id INTO v_invoice_id;

    FOR v_line IN
      SELECT vh.id AS votehead_id, vh.description,
             (CASE p_term WHEN 1 THEN fs.t1 WHEN 2 THEN fs.t2 ELSE fs.t3 END) AS amount
      FROM fee_structures fs
      JOIN voteheads vh ON vh.id = fs.votehead_id
      WHERE fs.school_id = p_school_id
        AND fs.fee_level = v_fee_level
        AND fs.year = p_year
        AND fs.status = 'published'
        AND vh.is_active
        AND (
          vh.applies_to = 'all'
          OR (vh.applies_to = 'boarders' AND v_student.dorm_id IS NOT NULL)
          OR (vh.applies_to = 'day'      AND v_student.dorm_id IS NULL)
        )
        AND (CASE p_term WHEN 1 THEN fs.t1 WHEN 2 THEN fs.t2 ELSE fs.t3 END) > 0
      ORDER BY vh.priority, vh.display_order
    LOOP
      INSERT INTO fee_invoice_items (school_id, invoice_id, votehead_id, description, amount)
      VALUES (p_school_id, v_invoice_id, v_line.votehead_id, v_line.description, v_line.amount);
    END LOOP;

    -- AC-3: any unallocated credit (overpayments, historical payments)
    -- settles this fresh invoice immediately.
    v_credit_applied := v_credit_applied + public.allocate_student_payments(v_student.id);

    v_created := v_created + 1;
    v_amount_total := v_amount_total + v_total;
  END LOOP;

  RETURN jsonb_build_object(
    'created',              v_created,
    'skipped_existing',     v_skipped_existing,
    'skipped_no_structure', v_skipped_no_items,
    'total_billed',         v_amount_total,
    'credit_applied',       v_credit_applied
  );
END;
$$;

-- =====================================================================
-- 8. get_student_fee_summary — exclude voided payments
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_student_fee_summary(p_student_id UUID, p_year INT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id  UUID;
  v_level_id   TEXT;
  v_dorm_id    UUID;
  v_fee_level  TEXT;
  v_billed_t1  NUMERIC := 0;
  v_billed_t2  NUMERIC := 0;
  v_billed_t3  NUMERIC := 0;
  v_paid       NUMERIC := 0;
  v_payments   JSONB;
BEGIN
  SELECT school_id, level_id, dorm_id INTO v_school_id, v_level_id, v_dorm_id
  FROM students WHERE id = p_student_id;
  IF v_school_id IS NULL THEN RETURN NULL; END IF;

  IF auth.uid() IS NOT NULL
     AND NOT public.is_school_admin(v_school_id)
     AND NOT public.is_finance_reader(v_school_id) THEN
    RAISE EXCEPTION 'Not authorized to view fees for this student';
  END IF;

  v_fee_level := public.fee_level_for_grade(v_level_id);

  SELECT COALESCE(SUM(fs.t1), 0), COALESCE(SUM(fs.t2), 0), COALESCE(SUM(fs.t3), 0)
  INTO v_billed_t1, v_billed_t2, v_billed_t3
  FROM fee_structures fs
  JOIN voteheads vh ON vh.id = fs.votehead_id
  WHERE fs.school_id = v_school_id
    AND fs.fee_level = v_fee_level
    AND fs.year = p_year
    AND fs.status = 'published'
    AND vh.is_active
    AND (
      vh.applies_to = 'all'
      OR (vh.applies_to = 'boarders' AND v_dorm_id IS NOT NULL)
      OR (vh.applies_to = 'day'      AND v_dorm_id IS NULL)
    );

  SELECT COALESCE(SUM(amount), 0) INTO v_paid
  FROM fee_payments
  WHERE student_id = p_student_id AND year = p_year AND status <> 'voided';

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id, 'amount', p.amount, 'term', p.term,
        'method', p.method, 'reference', p.reference, 'paid_at', p.paid_at,
        'receipt_no', r.receipt_no
      ) ORDER BY p.paid_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_payments
  FROM fee_payments p
  LEFT JOIN fee_receipts r ON r.payment_id = p.id AND NOT r.is_void
  WHERE p.student_id = p_student_id AND p.year = p_year AND p.status <> 'voided';

  RETURN jsonb_build_object(
    'year',       p_year,
    'fee_level',  v_fee_level,
    'is_boarder', v_dorm_id IS NOT NULL,
    'billed',     v_billed_t1 + v_billed_t2 + v_billed_t3,
    'billed_t1',  v_billed_t1,
    'billed_t2',  v_billed_t2,
    'billed_t3',  v_billed_t3,
    'paid',       v_paid,
    'balance',    (v_billed_t1 + v_billed_t2 + v_billed_t3) - v_paid,
    'payments',   v_payments
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_student_fee_summary(UUID, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_fee_summary(UUID, INT) TO authenticated, service_role;

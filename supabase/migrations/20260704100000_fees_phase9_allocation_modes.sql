-- Fees module — Phase 9: allocation modes (priority | percentage) + settings.
--
-- Adds:
--   fee_settings                 -- per-school finance settings (allocation_mode)
--   fee_payments.allocation_mode -- how THIS payment spreads across voteheads
--   get_fee_allocation_mode()    -- school default (priority if unset)
--   allocate_student_payments()  -- REPLACED: supports percentage (pro-rata)
--                                   per payment; bursaries stay priority
--   record_fee_payment()         -- REPLACED: takes p_allocation_mode override
--
-- Priority mode: fill charges oldest-invoice-first, then by votehead priority
--   (the votehead order set in Fee Structure). Top of the list clears first.
-- Percentage mode: distribute a payment across ALL outstanding charges in
--   proportion to what is owed on each (PRD §10 ratio mode), rounding leftover
--   cents to the highest-priority charge.

-- =====================================================================
-- 1. fee_settings
-- =====================================================================

CREATE TABLE IF NOT EXISTS fee_settings (
  school_id       UUID PRIMARY KEY REFERENCES school_registrations(id) ON DELETE CASCADE,
  allocation_mode TEXT NOT NULL DEFAULT 'priority'
                  CHECK (allocation_mode IN ('priority', 'percentage')),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      UUID
);

ALTER TABLE fee_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fee_settings_admin_all ON fee_settings;
CREATE POLICY fee_settings_admin_all ON fee_settings
  FOR ALL TO authenticated
  USING (public.is_school_admin(school_id))
  WITH CHECK (public.is_school_admin(school_id));

DROP POLICY IF EXISTS fee_settings_finance_all ON fee_settings;
CREATE POLICY fee_settings_finance_all ON fee_settings
  FOR ALL TO authenticated
  USING (public.is_finance_staff(school_id))
  WITH CHECK (public.is_finance_staff(school_id));

DROP POLICY IF EXISTS fee_settings_finance_read ON fee_settings;
CREATE POLICY fee_settings_finance_read ON fee_settings
  FOR SELECT TO authenticated
  USING (public.is_finance_reader(school_id));

CREATE OR REPLACE FUNCTION public.get_fee_allocation_mode(p_school_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT allocation_mode FROM fee_settings WHERE school_id = p_school_id),
    'priority'
  );
$$;

-- =====================================================================
-- 2. fee_payments.allocation_mode
-- =====================================================================

ALTER TABLE fee_payments
  ADD COLUMN IF NOT EXISTS allocation_mode TEXT NOT NULL DEFAULT 'priority';

DO $$
BEGIN
  ALTER TABLE fee_payments
    ADD CONSTRAINT fee_payments_allocation_mode_check
    CHECK (allocation_mode IN ('priority', 'percentage'));
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$$;

-- =====================================================================
-- 3. Allocator with per-payment percentage support
-- =====================================================================

CREATE OR REPLACE FUNCTION public.allocate_student_payments(p_student_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_src        RECORD;
  v_item       RECORD;
  v_remaining  NUMERIC(14,2);
  v_alloc      NUMERIC(14,2);
  v_total_out  NUMERIC(14,2);
  v_total_new  NUMERIC(14,2) := 0;
  v_mode       TEXT;
BEGIN
  FOR v_src IN
    SELECT 'P' AS kind, p.id, p.school_id, p.allocation_mode AS mode,
           NULL::int AS year, NULL::int AS term, p.paid_at AS at,
           p.amount - COALESCE((SELECT SUM(a.amount) FROM fee_payment_allocations a
                                WHERE a.payment_id = p.id), 0) AS unallocated
    FROM fee_payments p
    WHERE p.student_id = p_student_id AND p.status = 'active'
    UNION ALL
    SELECT 'B' AS kind, b.id, b.school_id, 'priority' AS mode,
           b.year, b.term, b.created_at AS at,
           b.amount - COALESCE((SELECT SUM(a.amount) FROM fee_payment_allocations a
                                WHERE a.bursary_id = b.id), 0) AS unallocated
    FROM fee_bursary_awards b
    WHERE b.student_id = p_student_id AND b.status = 'active'
    ORDER BY 1, at   -- 'B' before 'P': bursaries first, each oldest-first
  LOOP
    v_remaining := v_src.unallocated;
    CONTINUE WHEN v_remaining <= 0;
    v_mode := COALESCE(v_src.mode, 'priority');

    -- ---- Percentage pre-pass: floored pro-rata across outstanding items ----
    IF v_mode = 'percentage' THEN
      SELECT COALESCE(SUM(x.outstanding), 0) INTO v_total_out
      FROM (
        SELECT ii.amount - COALESCE((
                 SELECT SUM(a.amount)
                 FROM fee_payment_allocations a
                 LEFT JOIN fee_payments pp       ON pp.id = a.payment_id
                 LEFT JOIN fee_adjustments ad    ON ad.id = a.adjustment_id
                 LEFT JOIN fee_bursary_awards bw ON bw.id = a.bursary_id
                 WHERE a.invoice_item_id = ii.id
                   AND COALESCE(pp.status, ad.status, bw.status) = 'active'
               ), 0) AS outstanding
        FROM fee_invoice_items ii
        JOIN fee_invoices i ON i.id = ii.invoice_id
        WHERE i.student_id = p_student_id AND i.status <> 'cancelled'
          AND (v_src.year IS NULL OR i.year = v_src.year)
          AND (v_src.term IS NULL OR i.term = v_src.term)
      ) x
      WHERE x.outstanding > 0;

      IF v_total_out > 0 THEN
        FOR v_item IN
          SELECT ii.id, ii.invoice_id,
                 ii.amount - COALESCE((
                   SELECT SUM(a.amount)
                   FROM fee_payment_allocations a
                   LEFT JOIN fee_payments pp       ON pp.id = a.payment_id
                   LEFT JOIN fee_adjustments ad    ON ad.id = a.adjustment_id
                   LEFT JOIN fee_bursary_awards bw ON bw.id = a.bursary_id
                   WHERE a.invoice_item_id = ii.id
                     AND COALESCE(pp.status, ad.status, bw.status) = 'active'
                 ), 0) AS outstanding
          FROM fee_invoice_items ii
          JOIN fee_invoices i ON i.id = ii.invoice_id
          LEFT JOIN voteheads vh ON vh.id = ii.votehead_id
          WHERE i.student_id = p_student_id AND i.status <> 'cancelled'
            AND (v_src.year IS NULL OR i.year = v_src.year)
            AND (v_src.term IS NULL OR i.term = v_src.term)
          ORDER BY i.issue_date, i.created_at, COALESCE(vh.priority, 999), ii.created_at
        LOOP
          CONTINUE WHEN v_item.outstanding <= 0;
          -- floor to the cent so we never over-allocate; priority pass mops up
          v_alloc := floor((v_remaining * v_item.outstanding / v_total_out) * 100) / 100.0;
          v_alloc := LEAST(v_alloc, v_item.outstanding);
          IF v_alloc > 0 THEN
            INSERT INTO fee_payment_allocations (school_id, payment_id, invoice_id, invoice_item_id, amount)
            VALUES (v_src.school_id, v_src.id, v_item.invoice_id, v_item.id, v_alloc);
            v_total_new := v_total_new + v_alloc;
          END IF;
        END LOOP;
        -- recompute this source's remainder after the pro-rata pass
        v_remaining := v_src.unallocated - COALESCE((
          SELECT SUM(a.amount) FROM fee_payment_allocations a WHERE a.payment_id = v_src.id
        ), 0);
      END IF;
    END IF;

    -- ---- Priority pass (whole allocation for priority mode; rounding
    --       remainder + any residual for percentage mode) ----
    FOR v_item IN
      SELECT ii.id, ii.invoice_id,
             ii.amount - COALESCE((
               SELECT SUM(a.amount)
               FROM fee_payment_allocations a
               LEFT JOIN fee_payments pp       ON pp.id = a.payment_id
               LEFT JOIN fee_adjustments ad    ON ad.id = a.adjustment_id
               LEFT JOIN fee_bursary_awards bw ON bw.id = a.bursary_id
               WHERE a.invoice_item_id = ii.id
                 AND COALESCE(pp.status, ad.status, bw.status) = 'active'
             ), 0) AS outstanding
      FROM fee_invoice_items ii
      JOIN fee_invoices i ON i.id = ii.invoice_id
      LEFT JOIN voteheads vh ON vh.id = ii.votehead_id
      WHERE i.student_id = p_student_id
        AND i.status <> 'cancelled'
        AND (v_src.year IS NULL OR i.year = v_src.year)
        AND (v_src.term IS NULL OR i.term = v_src.term)
      ORDER BY i.issue_date, i.created_at, COALESCE(vh.priority, 999), ii.created_at
    LOOP
      EXIT WHEN v_remaining <= 0;
      CONTINUE WHEN v_item.outstanding <= 0;

      v_alloc := LEAST(v_remaining, v_item.outstanding);
      IF v_src.kind = 'P' THEN
        INSERT INTO fee_payment_allocations (school_id, payment_id, invoice_id, invoice_item_id, amount)
        VALUES (v_src.school_id, v_src.id, v_item.invoice_id, v_item.id, v_alloc);
      ELSE
        INSERT INTO fee_payment_allocations (school_id, bursary_id, invoice_id, invoice_item_id, amount)
        VALUES (v_src.school_id, v_src.id, v_item.invoice_id, v_item.id, v_alloc);
      END IF;

      v_remaining := v_remaining - v_alloc;
      v_total_new := v_total_new + v_alloc;
    END LOOP;
  END LOOP;

  PERFORM public.refresh_student_invoice_statuses(p_student_id);
  RETURN v_total_new;
END;
$$;

-- =====================================================================
-- 4. record_fee_payment with allocation-mode override
-- =====================================================================

DROP FUNCTION IF EXISTS public.record_fee_payment(UUID, UUID, NUMERIC, INT, TEXT, TEXT, TEXT, TEXT, INT, DATE);

CREATE OR REPLACE FUNCTION public.record_fee_payment(
  p_school_id       UUID,
  p_student_id      UUID,
  p_amount          NUMERIC,
  p_year            INT,
  p_method          TEXT DEFAULT NULL,
  p_reference       TEXT DEFAULT NULL,
  p_payer_name      TEXT DEFAULT NULL,
  p_narration       TEXT DEFAULT NULL,
  p_term            INT  DEFAULT NULL,
  p_paid_on         DATE DEFAULT NULL,
  p_allocation_mode TEXT DEFAULT NULL
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
  v_mode        TEXT;
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

  v_mode := COALESCE(NULLIF(p_allocation_mode, ''), public.get_fee_allocation_mode(p_school_id));
  IF v_mode NOT IN ('priority', 'percentage') THEN v_mode := 'priority'; END IF;

  v_paid_at := COALESCE(p_paid_on::timestamptz, now());

  INSERT INTO fee_payments (school_id, student_id, amount, year, term, method,
                            reference, payer_name, narration, paid_at, status,
                            allocation_mode, recorded_by)
  VALUES (p_school_id, p_student_id, round(p_amount::numeric, 2), p_year, p_term,
          NULLIF(trim(COALESCE(p_method, '')), ''),
          NULLIF(trim(COALESCE(p_reference, '')), ''),
          NULLIF(trim(COALESCE(p_payer_name, '')), ''),
          NULLIF(trim(COALESCE(p_narration, '')), ''),
          v_paid_at, 'active', v_mode, auth.uid())
  RETURNING id INTO v_payment_id;

  PERFORM public.allocate_student_payments(p_student_id);

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
    'mode',        v_mode,
    'allocations', v_allocations
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_fee_payment(UUID, UUID, NUMERIC, INT, TEXT, TEXT, TEXT, TEXT, INT, DATE, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_fee_payment(UUID, UUID, NUMERIC, INT, TEXT, TEXT, TEXT, TEXT, INT, DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_fee_allocation_mode(UUID) TO authenticated, service_role;

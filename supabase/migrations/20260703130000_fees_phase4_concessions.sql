-- Fees module — Phase 4: discounts, waivers, sponsors & bursaries.
--
-- Adds:
--   fee_sponsors                 -- CDF, county, NGO, individual, school, other
--   fee_adjustments              -- discount | waiver | credit_note on an invoice
--   fee_bursary_awards           -- sponsor money awarded to a student for a year/term
--   fee_payment_allocations      -- EXTENDED: an allocation's source is now a
--                                   payment OR an adjustment OR a bursary
--   apply_fee_adjustment()       -- resolve %, cap at outstanding, allocate
--   award_fee_bursary()          -- award + allocate via the shared allocator
--   void_fee_adjustment()        -- soft void + status refresh
--   void_fee_bursary()           -- soft void + status refresh
--   allocate_student_payments()  -- REPLACED: also places unallocated bursary
--                                   money (year/term scoped)
--   refresh_student_invoice_statuses() -- REPLACED: counts all active sources
--   get_student_fee_summary()    -- REPLACED: balance = billed - paid - concessions,
--                                   with labelled concession lines (AC-7)
--
-- Design notes:
--   - Adjustments are INVOICE-scoped (optionally one votehead) and capped at
--     the target's outstanding when applied, so they never carry a remainder.
--   - Bursaries are STUDENT+YEAR scoped (term optional). A remainder beyond
--     what is outstanding stays on the award and auto-applies when new
--     invoices are generated, same as payment credit.
--   - Everything voids softly with a reason; allocation rows stay for audit
--     and are excluded via their source's status.

-- =====================================================================
-- 1. fee_sponsors
-- =====================================================================

CREATE TABLE IF NOT EXISTS fee_sponsors (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  UUID NOT NULL REFERENCES school_registrations(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  type       TEXT NOT NULL DEFAULT 'other'
             CHECK (type IN ('cdf', 'county', 'ngo', 'individual', 'school', 'other')),
  contact    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fee_sponsors_school_idx ON fee_sponsors (school_id);

-- =====================================================================
-- 2. fee_adjustments + fee_bursary_awards
-- =====================================================================

CREATE TABLE IF NOT EXISTS fee_adjustments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    UUID NOT NULL REFERENCES school_registrations(id) ON DELETE CASCADE,
  student_id   UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  invoice_id   UUID NOT NULL REFERENCES fee_invoices(id) ON DELETE CASCADE,
  votehead_id  UUID REFERENCES voteheads(id),   -- NULL => whole invoice
  kind         TEXT NOT NULL CHECK (kind IN ('discount', 'waiver', 'credit_note')),
  calc         TEXT NOT NULL CHECK (calc IN ('percentage', 'fixed')),
  value        NUMERIC(14,2) NOT NULL CHECK (value > 0),
  amount       NUMERIC(14,2) NOT NULL CHECK (amount > 0),  -- resolved KES
  year         INT NOT NULL,
  reason       TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'voided')),
  void_reason  TEXT,
  voided_at    TIMESTAMPTZ,
  voided_by    UUID,
  created_by   UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fee_adjustments_student_idx ON fee_adjustments (student_id, year);
CREATE INDEX IF NOT EXISTS fee_adjustments_school_idx  ON fee_adjustments (school_id, year);

CREATE TABLE IF NOT EXISTS fee_bursary_awards (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    UUID NOT NULL REFERENCES school_registrations(id) ON DELETE CASCADE,
  student_id   UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  sponsor_id   UUID NOT NULL REFERENCES fee_sponsors(id),
  year         INT NOT NULL,
  term         INT CHECK (term IN (1, 2, 3)),   -- NULL => whole year
  amount       NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  reference    TEXT,
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'voided')),
  void_reason  TEXT,
  voided_at    TIMESTAMPTZ,
  voided_by    UUID,
  awarded_by   UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fee_bursary_awards_student_idx ON fee_bursary_awards (student_id, year);
CREATE INDEX IF NOT EXISTS fee_bursary_awards_sponsor_idx ON fee_bursary_awards (sponsor_id, year);
CREATE INDEX IF NOT EXISTS fee_bursary_awards_school_idx  ON fee_bursary_awards (school_id, year);

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY['fee_sponsors', 'fee_adjustments', 'fee_bursary_awards'];
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
-- 3. fee_payment_allocations: three possible sources, exactly one set
-- =====================================================================

ALTER TABLE fee_payment_allocations ALTER COLUMN payment_id DROP NOT NULL;
ALTER TABLE fee_payment_allocations
  ADD COLUMN IF NOT EXISTS adjustment_id UUID REFERENCES fee_adjustments(id) ON DELETE CASCADE;
ALTER TABLE fee_payment_allocations
  ADD COLUMN IF NOT EXISTS bursary_id UUID REFERENCES fee_bursary_awards(id) ON DELETE CASCADE;

DO $$
BEGIN
  ALTER TABLE fee_payment_allocations
    ADD CONSTRAINT fee_payment_allocations_one_source_check
    CHECK (
      (payment_id IS NOT NULL)::int
      + (adjustment_id IS NOT NULL)::int
      + (bursary_id IS NOT NULL)::int = 1
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$$;

CREATE INDEX IF NOT EXISTS fee_payment_allocations_adjustment_idx ON fee_payment_allocations (adjustment_id);
CREATE INDEX IF NOT EXISTS fee_payment_allocations_bursary_idx    ON fee_payment_allocations (bursary_id);

-- =====================================================================
-- 4. Status refresh — counts all active sources
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
    WHEN settled.amt >= i.total AND i.total > 0 THEN 'paid'
    WHEN settled.amt > 0                        THEN 'partially_paid'
    ELSE 'issued'
  END
  FROM (
    SELECT i2.id,
           COALESCE(SUM(
             CASE WHEN COALESCE(p.status, ad.status, bw.status) = 'active'
                  THEN a.amount ELSE 0 END
           ), 0) AS amt
    FROM fee_invoices i2
    LEFT JOIN fee_payment_allocations a ON a.invoice_id = i2.id
    LEFT JOIN fee_payments p        ON p.id  = a.payment_id
    LEFT JOIN fee_adjustments ad    ON ad.id = a.adjustment_id
    LEFT JOIN fee_bursary_awards bw ON bw.id = a.bursary_id
    WHERE i2.student_id = p_student_id AND i2.status <> 'cancelled'
    GROUP BY i2.id
  ) settled
  WHERE i.id = settled.id AND i.status <> 'cancelled';
END;
$$;

-- =====================================================================
-- 5. Allocator — payments first, then unallocated bursary money
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
  v_total_new  NUMERIC(14,2) := 0;
BEGIN
  -- One pass over both credit sources. Bursaries (kind 'B') deliberately
  -- allocate BEFORE payments (kind 'P'): a concession reduces what is
  -- payable before cash is applied. Bursaries are restricted to invoices
  -- of the award's year and, if set, term.
  FOR v_src IN
    SELECT 'P' AS kind, p.id, p.school_id, NULL::int AS year, NULL::int AS term,
           p.paid_at AS at,
           p.amount - COALESCE((SELECT SUM(a.amount) FROM fee_payment_allocations a
                                WHERE a.payment_id = p.id), 0) AS unallocated
    FROM fee_payments p
    WHERE p.student_id = p_student_id AND p.status = 'active'
    UNION ALL
    SELECT 'B' AS kind, b.id, b.school_id, b.year, b.term,
           b.created_at AS at,
           b.amount - COALESCE((SELECT SUM(a.amount) FROM fee_payment_allocations a
                                WHERE a.bursary_id = b.id), 0) AS unallocated
    FROM fee_bursary_awards b
    WHERE b.student_id = p_student_id AND b.status = 'active'
    ORDER BY 1, at   -- 'B' sorts before 'P': bursaries first, each oldest-first
  LOOP
    v_remaining := v_src.unallocated;
    CONTINUE WHEN v_remaining <= 0;

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
-- 6. apply_fee_adjustment — resolve, cap at outstanding, allocate
-- =====================================================================

CREATE OR REPLACE FUNCTION public.apply_fee_adjustment(
  p_invoice_id  UUID,
  p_kind        TEXT,
  p_calc        TEXT,
  p_value       NUMERIC,
  p_reason      TEXT,
  p_votehead_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv           RECORD;
  v_item          RECORD;
  v_outstanding   NUMERIC(14,2) := 0;
  v_base          NUMERIC(14,2) := 0;
  v_amount        NUMERIC(14,2);
  v_remaining     NUMERIC(14,2);
  v_alloc         NUMERIC(14,2);
  v_adjustment_id UUID;
BEGIN
  IF p_kind NOT IN ('discount', 'waiver', 'credit_note') THEN
    RAISE EXCEPTION 'Kind must be discount, waiver or credit_note';
  END IF;
  IF p_calc NOT IN ('percentage', 'fixed') THEN
    RAISE EXCEPTION 'Calc must be percentage or fixed';
  END IF;
  IF p_value IS NULL OR p_value <= 0 THEN
    RAISE EXCEPTION 'Value must be greater than zero';
  END IF;
  IF p_calc = 'percentage' AND p_value > 100 THEN
    RAISE EXCEPTION 'Percentage cannot exceed 100';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'A reason is required';
  END IF;

  SELECT id, school_id, student_id, year, status INTO v_inv
  FROM fee_invoices WHERE id = p_invoice_id;
  IF v_inv.id IS NULL THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  IF v_inv.status = 'cancelled' THEN RAISE EXCEPTION 'Invoice is cancelled'; END IF;

  IF NOT public.is_school_admin(v_inv.school_id)
     AND NOT public.is_finance_staff(v_inv.school_id) THEN
    RAISE EXCEPTION 'Not authorized to adjust invoices for this school';
  END IF;

  -- Base (original amounts) and outstanding of the targeted lines
  SELECT COALESCE(SUM(ii.amount), 0),
         COALESCE(SUM(ii.amount - COALESCE((
           SELECT SUM(a.amount)
           FROM fee_payment_allocations a
           LEFT JOIN fee_payments pp       ON pp.id = a.payment_id
           LEFT JOIN fee_adjustments ad    ON ad.id = a.adjustment_id
           LEFT JOIN fee_bursary_awards bw ON bw.id = a.bursary_id
           WHERE a.invoice_item_id = ii.id
             AND COALESCE(pp.status, ad.status, bw.status) = 'active'
         ), 0)), 0)
  INTO v_base, v_outstanding
  FROM fee_invoice_items ii
  WHERE ii.invoice_id = p_invoice_id
    AND (p_votehead_id IS NULL OR ii.votehead_id = p_votehead_id);

  IF v_base <= 0 THEN
    RAISE EXCEPTION 'No matching line items on this invoice';
  END IF;

  v_amount := CASE p_calc
    WHEN 'percentage' THEN round(v_base * p_value / 100.0, 2)
    ELSE round(p_value::numeric, 2)
  END;
  v_amount := LEAST(v_amount, v_outstanding);

  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Nothing outstanding on the targeted lines — the concession would have no effect';
  END IF;

  INSERT INTO fee_adjustments (school_id, student_id, invoice_id, votehead_id, kind,
                               calc, value, amount, year, reason, created_by)
  VALUES (v_inv.school_id, v_inv.student_id, p_invoice_id, p_votehead_id, p_kind,
          p_calc, round(p_value::numeric, 2), v_amount, v_inv.year, trim(p_reason), auth.uid())
  RETURNING id INTO v_adjustment_id;

  -- Allocate against the targeted lines (capped, so it always fits)
  v_remaining := v_amount;
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
    LEFT JOIN voteheads vh ON vh.id = ii.votehead_id
    WHERE ii.invoice_id = p_invoice_id
      AND (p_votehead_id IS NULL OR ii.votehead_id = p_votehead_id)
    ORDER BY COALESCE(vh.priority, 999), ii.created_at
  LOOP
    EXIT WHEN v_remaining <= 0;
    CONTINUE WHEN v_item.outstanding <= 0;
    v_alloc := LEAST(v_remaining, v_item.outstanding);
    INSERT INTO fee_payment_allocations (school_id, adjustment_id, invoice_id, invoice_item_id, amount)
    VALUES (v_inv.school_id, v_adjustment_id, v_item.invoice_id, v_item.id, v_alloc);
    v_remaining := v_remaining - v_alloc;
  END LOOP;

  PERFORM public.refresh_student_invoice_statuses(v_inv.student_id);

  RETURN jsonb_build_object('ok', true, 'adjustment_id', v_adjustment_id, 'amount', v_amount);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_fee_adjustment(UUID, TEXT, TEXT, NUMERIC, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_fee_adjustment(UUID, TEXT, TEXT, NUMERIC, TEXT, UUID) TO authenticated;

-- =====================================================================
-- 7. award_fee_bursary — award + allocate via the shared allocator
-- =====================================================================

CREATE OR REPLACE FUNCTION public.award_fee_bursary(
  p_school_id  UUID,
  p_student_id UUID,
  p_sponsor_id UUID,
  p_year       INT,
  p_amount     NUMERIC,
  p_term       INT  DEFAULT NULL,
  p_reference  TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bursary_id UUID;
  v_allocated  NUMERIC(14,2);
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Bursary amount must be greater than zero';
  END IF;
  IF NOT public.is_school_admin(p_school_id)
     AND NOT public.is_finance_staff(p_school_id) THEN
    RAISE EXCEPTION 'Not authorized to award bursaries for this school';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM students WHERE id = p_student_id AND school_id = p_school_id) THEN
    RAISE EXCEPTION 'Student not found in this school';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM fee_sponsors WHERE id = p_sponsor_id AND school_id = p_school_id) THEN
    RAISE EXCEPTION 'Sponsor not found in this school';
  END IF;

  INSERT INTO fee_bursary_awards (school_id, student_id, sponsor_id, year, term,
                                  amount, reference, awarded_by)
  VALUES (p_school_id, p_student_id, p_sponsor_id, p_year, p_term,
          round(p_amount::numeric, 2), NULLIF(trim(COALESCE(p_reference, '')), ''), auth.uid())
  RETURNING id INTO v_bursary_id;

  PERFORM public.allocate_student_payments(p_student_id);

  SELECT COALESCE(SUM(amount), 0) INTO v_allocated
  FROM fee_payment_allocations WHERE bursary_id = v_bursary_id;

  RETURN jsonb_build_object(
    'ok', true,
    'bursary_id', v_bursary_id,
    'allocated',  v_allocated,
    'unapplied',  round(p_amount::numeric, 2) - v_allocated
  );
END;
$$;

REVOKE ALL ON FUNCTION public.award_fee_bursary(UUID, UUID, UUID, INT, NUMERIC, INT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.award_fee_bursary(UUID, UUID, UUID, INT, NUMERIC, INT, TEXT) TO authenticated;

-- =====================================================================
-- 8. Voids
-- =====================================================================

CREATE OR REPLACE FUNCTION public.void_fee_adjustment(p_adjustment_id UUID, p_reason TEXT)
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
  FROM fee_adjustments WHERE id = p_adjustment_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'Adjustment not found'; END IF;
  IF NOT public.is_school_admin(v_school_id)
     AND NOT public.is_finance_staff(v_school_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF v_status = 'voided' THEN RAISE EXCEPTION 'Adjustment is already voided'; END IF;

  UPDATE fee_adjustments
  SET status = 'voided', void_reason = trim(p_reason), voided_at = now(), voided_by = auth.uid()
  WHERE id = p_adjustment_id;

  PERFORM public.refresh_student_invoice_statuses(v_student_id);
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.void_fee_adjustment(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_fee_adjustment(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.void_fee_bursary(p_bursary_id UUID, p_reason TEXT)
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
  FROM fee_bursary_awards WHERE id = p_bursary_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'Bursary award not found'; END IF;
  IF NOT public.is_school_admin(v_school_id)
     AND NOT public.is_finance_staff(v_school_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF v_status = 'voided' THEN RAISE EXCEPTION 'Bursary award is already voided'; END IF;

  UPDATE fee_bursary_awards
  SET status = 'voided', void_reason = trim(p_reason), voided_at = now(), voided_by = auth.uid()
  WHERE id = p_bursary_id;

  PERFORM public.refresh_student_invoice_statuses(v_student_id);
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.void_fee_bursary(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_fee_bursary(UUID, TEXT) TO authenticated;

-- =====================================================================
-- 9. get_student_fee_summary — concessions in the balance + AC-7 lines
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_student_fee_summary(p_student_id UUID, p_year INT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id   UUID;
  v_level_id    TEXT;
  v_dorm_id     UUID;
  v_fee_level   TEXT;
  v_billed_t1   NUMERIC := 0;
  v_billed_t2   NUMERIC := 0;
  v_billed_t3   NUMERIC := 0;
  v_paid        NUMERIC := 0;
  v_adjustments NUMERIC := 0;
  v_bursaries   NUMERIC := 0;
  v_payments    JSONB;
  v_concessions JSONB;
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

  SELECT COALESCE(SUM(amount), 0) INTO v_adjustments
  FROM fee_adjustments
  WHERE student_id = p_student_id AND year = p_year AND status = 'active';

  SELECT COALESCE(SUM(amount), 0) INTO v_bursaries
  FROM fee_bursary_awards
  WHERE student_id = p_student_id AND year = p_year AND status = 'active';

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

  -- Distinct, labelled concession lines (AC-7):
  -- "Bursary — County of Uasin Gishu: 10,000" / "Waiver: ..."
  SELECT COALESCE(jsonb_agg(line ORDER BY at DESC), '[]'::jsonb) INTO v_concessions
  FROM (
    SELECT ad.created_at AS at,
           jsonb_build_object(
             'kind', ad.kind, 'label', initcap(ad.kind) || ' — ' || ad.reason,
             'amount', ad.amount, 'date', ad.created_at
           ) AS line
    FROM fee_adjustments ad
    WHERE ad.student_id = p_student_id AND ad.year = p_year AND ad.status = 'active'
    UNION ALL
    SELECT b.created_at AS at,
           jsonb_build_object(
             'kind', 'bursary', 'label', 'Bursary — ' || sp.name
                     || COALESCE(' (' || b.reference || ')', ''),
             'amount', b.amount, 'date', b.created_at
           ) AS line
    FROM fee_bursary_awards b
    JOIN fee_sponsors sp ON sp.id = b.sponsor_id
    WHERE b.student_id = p_student_id AND b.year = p_year AND b.status = 'active'
  ) c;

  RETURN jsonb_build_object(
    'year',        p_year,
    'fee_level',   v_fee_level,
    'is_boarder',  v_dorm_id IS NOT NULL,
    'billed',      v_billed_t1 + v_billed_t2 + v_billed_t3,
    'billed_t1',   v_billed_t1,
    'billed_t2',   v_billed_t2,
    'billed_t3',   v_billed_t3,
    'paid',        v_paid,
    'concessions', v_adjustments + v_bursaries,
    'concession_items', v_concessions,
    'balance',     (v_billed_t1 + v_billed_t2 + v_billed_t3) - v_paid - v_adjustments - v_bursaries,
    'payments',    v_payments
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_student_fee_summary(UUID, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_fee_summary(UUID, INT) TO authenticated, service_role;

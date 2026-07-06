-- Fees module — Phase 10a: explicit boarding status.
--
-- Makes Boarder/Day an explicit, authoritative field on the student rather
-- than inferring it from dorm assignment. A specific dorm becomes optional
-- detail (which bed) that no longer gates boarding fees.
--
-- Adds:
--   students.boarding_status  ('day' | 'boarder', default 'day')
--   backfill: boarder where a dorm was already assigned
--   get_student_fee_summary() / generate_invoices()  -> use boarding_status
--     instead of "has a dorm" when matching votehead applies_to scope.

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS boarding_status TEXT NOT NULL DEFAULT 'day';

DO $$
BEGIN
  ALTER TABLE students
    ADD CONSTRAINT students_boarding_status_check
    CHECK (boarding_status IN ('day', 'boarder'));
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$$;

-- Existing dorm holders are boarders.
UPDATE students SET boarding_status = 'boarder'
WHERE dorm_id IS NOT NULL AND boarding_status <> 'boarder';

CREATE INDEX IF NOT EXISTS students_boarding_idx ON students (school_id, boarding_status);

-- =====================================================================
-- get_student_fee_summary — boarder = boarding_status, not dorm presence
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
  v_is_boarder  BOOLEAN;
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
  SELECT school_id, level_id, (boarding_status = 'boarder')
    INTO v_school_id, v_level_id, v_is_boarder
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
      OR (vh.applies_to = 'boarders' AND v_is_boarder)
      OR (vh.applies_to = 'day'      AND NOT v_is_boarder)
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
    'is_boarder',  v_is_boarder,
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

-- =====================================================================
-- generate_invoices — boarder = boarding_status
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
    SELECT s.id, s.level_id, (s.boarding_status = 'boarder') AS is_boarder
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
        OR (vh.applies_to = 'boarders' AND v_student.is_boarder)
        OR (vh.applies_to = 'day'      AND NOT v_student.is_boarder)
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
          OR (vh.applies_to = 'boarders' AND v_student.is_boarder)
          OR (vh.applies_to = 'day'      AND NOT v_student.is_boarder)
        )
        AND (CASE p_term WHEN 1 THEN fs.t1 WHEN 2 THEN fs.t2 ELSE fs.t3 END) > 0
      ORDER BY vh.priority, vh.display_order
    LOOP
      INSERT INTO fee_invoice_items (school_id, invoice_id, votehead_id, description, amount)
      VALUES (p_school_id, v_invoice_id, v_line.votehead_id, v_line.description, v_line.amount);
    END LOOP;

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

REVOKE ALL ON FUNCTION public.generate_invoices(UUID, INT, INT, TEXT, TEXT, UUID, UUID, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_invoices(UUID, INT, INT, TEXT, TEXT, UUID, UUID, DATE) TO authenticated;

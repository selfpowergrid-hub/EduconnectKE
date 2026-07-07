-- Fees module — Phase 11: student-specific votehead charges
--
-- Adds:
--   student_votehead_charges   -- per-student, per-votehead, per-year amounts
--
-- Replaces:
--   get_student_fee_summary()  -- incorporates student-specific charges
--   generate_invoices()        -- incorporates student-specific charges

CREATE TABLE IF NOT EXISTS student_votehead_charges (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID NOT NULL REFERENCES school_registrations(id) ON DELETE CASCADE,
  student_id  UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  votehead_id UUID NOT NULL REFERENCES voteheads(id) ON DELETE CASCADE,
  year        INT  NOT NULL,
  t1          NUMERIC(14,2) NOT NULL DEFAULT 0,
  t2          NUMERIC(14,2) NOT NULL DEFAULT 0,
  t3          NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes       TEXT,
  created_by  UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The table may already exist (created via the dashboard before this
-- migration ran). Ensure the columns and uniqueness the app relies on are
-- present either way; the named unique index is what upsert onConflict uses.
ALTER TABLE student_votehead_charges ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE student_votehead_charges ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE student_votehead_charges ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE student_votehead_charges ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS student_votehead_charges_unique_idx
  ON student_votehead_charges (school_id, student_id, votehead_id, year);

CREATE INDEX IF NOT EXISTS student_votehead_charges_student_idx ON student_votehead_charges(student_id, year);
CREATE INDEX IF NOT EXISTS student_votehead_charges_school_idx ON student_votehead_charges(school_id, year);

ALTER TABLE student_votehead_charges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS student_votehead_charges_admin_all ON student_votehead_charges;
CREATE POLICY student_votehead_charges_admin_all ON student_votehead_charges FOR ALL TO authenticated
USING (public.is_school_admin(school_id)) WITH CHECK (public.is_school_admin(school_id));

DROP POLICY IF EXISTS student_votehead_charges_finance_all ON student_votehead_charges;
CREATE POLICY student_votehead_charges_finance_all ON student_votehead_charges FOR ALL TO authenticated
USING (public.is_finance_staff(school_id)) WITH CHECK (public.is_finance_staff(school_id));

DROP POLICY IF EXISTS student_votehead_charges_finance_read ON student_votehead_charges;
CREATE POLICY student_votehead_charges_finance_read ON student_votehead_charges FOR SELECT TO authenticated
USING (public.is_finance_reader(school_id));

DROP TRIGGER IF EXISTS student_votehead_charges_audit ON student_votehead_charges;
CREATE TRIGGER student_votehead_charges_audit
  AFTER INSERT OR UPDATE OR DELETE ON student_votehead_charges
  FOR EACH ROW EXECUTE FUNCTION public.fee_audit_row();


-- =====================================================================
-- Replace get_student_fee_summary
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
  v_cat         UUID;
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

  v_cat := public.student_fee_category(p_student_id);

  -- Effective sheet: one row per votehead; student-specific > category-specific > shared.
  SELECT COALESCE(SUM(t1), 0), COALESCE(SUM(t2), 0), COALESCE(SUM(t3), 0)
  INTO v_billed_t1, v_billed_t2, v_billed_t3
  FROM (
    SELECT DISTINCT ON (votehead_id) t1, t2, t3
    FROM (
      SELECT fs.votehead_id, fs.t1, fs.t2, fs.t3, 
             (CASE WHEN fs.category_id IS NOT NULL THEN 1 ELSE 0 END) AS specificity
      FROM fee_structures fs
      JOIN voteheads vh ON vh.id = fs.votehead_id
      WHERE fs.school_id = v_school_id
        AND fs.fee_level = v_level_id
        AND fs.year = p_year
        AND fs.status = 'published'
        AND (fs.category_id IS NULL OR fs.category_id = v_cat)
        AND vh.is_active
        AND (
          vh.applies_to = 'all'
          OR (vh.applies_to = 'boarders' AND v_is_boarder)
          OR (vh.applies_to = 'day'      AND NOT v_is_boarder)
        )
      UNION ALL
      SELECT svc.votehead_id, svc.t1, svc.t2, svc.t3, 2 AS specificity
      FROM student_votehead_charges svc
      JOIN voteheads vh ON vh.id = svc.votehead_id
      WHERE svc.school_id = v_school_id
        AND svc.student_id = p_student_id
        AND svc.year = p_year
        AND vh.is_active
    ) combined
    ORDER BY votehead_id, specificity DESC
  ) eff;

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
    'fee_level',   v_level_id,
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
-- Replace generate_invoices
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
  v_cat               UUID;
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

    v_cat := public.student_fee_category(v_student.id);

    SELECT COALESCE(SUM(amount), 0) INTO v_total
    FROM (
      SELECT DISTINCT ON (votehead_id)
             (CASE p_term WHEN 1 THEN t1 WHEN 2 THEN t2 ELSE t3 END) AS amount
      FROM (
        SELECT fs.votehead_id, fs.t1, fs.t2, fs.t3,
               (CASE WHEN fs.category_id IS NOT NULL THEN 1 ELSE 0 END) AS specificity
        FROM fee_structures fs
        JOIN voteheads vh ON vh.id = fs.votehead_id
        WHERE fs.school_id = p_school_id
          AND fs.fee_level = v_student.level_id
          AND fs.year = p_year
          AND fs.status = 'published'
          AND (fs.category_id IS NULL OR fs.category_id = v_cat)
          AND vh.is_active
          AND (
            vh.applies_to = 'all'
            OR (vh.applies_to = 'boarders' AND v_student.is_boarder)
            OR (vh.applies_to = 'day'      AND NOT v_student.is_boarder)
          )
        UNION ALL
        SELECT svc.votehead_id, svc.t1, svc.t2, svc.t3, 2 AS specificity
        FROM student_votehead_charges svc
        JOIN voteheads vh ON vh.id = svc.votehead_id
        WHERE svc.school_id = p_school_id
          AND svc.student_id = v_student.id
          AND svc.year = p_year
          AND vh.is_active
      ) combined
      ORDER BY votehead_id, specificity DESC
    ) eff
    WHERE amount > 0;

    IF v_total <= 0 THEN
      v_skipped_no_items := v_skipped_no_items + 1;
      CONTINUE;
    END IF;

    v_seq := public.next_fee_doc_no(p_school_id, 'INV', p_year);
    v_invoice_no := format('INV-%s-T%s-%s', p_year, p_term, lpad(v_seq::text, 6, '0'));

    INSERT INTO fee_invoices (school_id, student_id, invoice_no, year, term,
                              fee_level, due_date, status, total, created_by)
    VALUES (p_school_id, v_student.id, v_invoice_no, p_year, p_term,
            v_student.level_id, p_due_date, 'issued', v_total, auth.uid())
    RETURNING id INTO v_invoice_id;

    FOR v_line IN
      SELECT votehead_id, description, amount FROM (
        SELECT DISTINCT ON (votehead_id)
               votehead_id, description, priority, display_order,
               (CASE p_term WHEN 1 THEN t1 WHEN 2 THEN t2 ELSE t3 END) AS amount
        FROM (
          SELECT vh.id AS votehead_id, vh.description, vh.priority, vh.display_order,
                 fs.t1, fs.t2, fs.t3,
                 (CASE WHEN fs.category_id IS NOT NULL THEN 1 ELSE 0 END) AS specificity
          FROM fee_structures fs
          JOIN voteheads vh ON vh.id = fs.votehead_id
          WHERE fs.school_id = p_school_id
            AND fs.fee_level = v_student.level_id
            AND fs.year = p_year
            AND fs.status = 'published'
            AND (fs.category_id IS NULL OR fs.category_id = v_cat)
            AND vh.is_active
            AND (
              vh.applies_to = 'all'
              OR (vh.applies_to = 'boarders' AND v_student.is_boarder)
              OR (vh.applies_to = 'day'      AND NOT v_student.is_boarder)
            )
          UNION ALL
          SELECT vh.id AS votehead_id, vh.description, vh.priority, vh.display_order,
                 svc.t1, svc.t2, svc.t3, 2 AS specificity
          FROM student_votehead_charges svc
          JOIN voteheads vh ON vh.id = svc.votehead_id
          WHERE svc.school_id = p_school_id
            AND svc.student_id = v_student.id
            AND svc.year = p_year
            AND vh.is_active
        ) combined
        ORDER BY votehead_id, specificity DESC
      ) eff
      WHERE amount > 0
      ORDER BY priority, display_order
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

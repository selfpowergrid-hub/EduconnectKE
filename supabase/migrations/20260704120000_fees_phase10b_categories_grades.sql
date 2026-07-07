-- Fees module — Phase 10b: per-GRADE pricing + fee categories.
--
-- The pricing key changes from (CBC band × votehead × year) to
-- (grade × category × votehead × year):
--
--   fee_categories            -- Day Scholar / Boarder (system) + named specials
--   fee_structures.fee_level  -- now stores GRADE codes (g1..g12, pp1, pp2);
--                                existing band rows are expanded per grade
--   fee_structures.category_id-- NULL = "All students" shared sheet
--   students.fee_category_id  -- explicit assignment (later UI); until set,
--                                a student's category derives from
--                                boarding_status -> system Day/Boarder
--
-- Combination rule (chosen): SPECIFIC OVERRIDES, ELSE SHARED.
--   A student's effective sheet = the "All students" rows for their grade,
--   with any row for the same votehead in their category REPLACING it, plus
--   category rows for voteheads not in the shared sheet (additive).
--
-- Data migration: every band sheet is copied to each of its grades under
-- "All students", then band rows are removed — bills stay identical.

-- =====================================================================
-- 1. fee_categories
-- =====================================================================

CREATE TABLE IF NOT EXISTS fee_categories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  UUID NOT NULL REFERENCES school_registrations(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'special'
             CHECK (kind IN ('day', 'boarder', 'special')),
  is_system  BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, name)
);

CREATE INDEX IF NOT EXISTS fee_categories_school_idx ON fee_categories (school_id);

DO $$
DECLARE
  t TEXT := 'fee_categories';
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

-- Seed the two system categories for every existing school.
INSERT INTO fee_categories (school_id, name, kind, is_system)
SELECT sr.id, v.name, v.kind, true
FROM school_registrations sr
CROSS JOIN (VALUES ('Day Scholar', 'day'), ('Boarder', 'boarder')) AS v(name, kind)
WHERE NOT EXISTS (
  SELECT 1 FROM fee_categories fc WHERE fc.school_id = sr.id AND fc.kind = v.kind
);

-- And for every future school.
CREATE OR REPLACE FUNCTION public.seed_fee_categories()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO fee_categories (school_id, name, kind, is_system)
  VALUES (NEW.id, 'Day Scholar', 'day', true),
         (NEW.id, 'Boarder', 'boarder', true)
  ON CONFLICT (school_id, name) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS school_registrations_seed_fee_categories ON school_registrations;
CREATE TRIGGER school_registrations_seed_fee_categories
  AFTER INSERT ON school_registrations
  FOR EACH ROW EXECUTE FUNCTION public.seed_fee_categories();

-- =====================================================================
-- 2. fee_structures: category dimension + per-grade rows
-- =====================================================================

ALTER TABLE fee_structures
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES fee_categories(id) ON DELETE CASCADE;

-- Uniqueness now includes the category (NULL = 'All students' sheet).
DROP INDEX IF EXISTS fee_structures_unique_idx;
CREATE UNIQUE INDEX IF NOT EXISTS fee_structures_unique_idx
  ON fee_structures (school_id, fee_level, votehead_id, year, COALESCE(category_id::text, 'all'));

-- Expand each band sheet into its grades ("All students"), then drop bands.
WITH bands(band, grade) AS (
  VALUES ('pp','pp1'), ('pp','pp2'),
         ('lower_pri','g1'), ('lower_pri','g2'), ('lower_pri','g3'),
         ('upper_pri','g4'), ('upper_pri','g5'), ('upper_pri','g6'),
         ('jss','g7'), ('jss','g8'), ('jss','g9'),
         ('sss','g10'), ('sss','g11'), ('sss','g12')
)
INSERT INTO fee_structures (school_id, fee_level, votehead_id, year, t1, t2, t3, status)
SELECT fs.school_id, b.grade, fs.votehead_id, fs.year, fs.t1, fs.t2, fs.t3, fs.status
FROM fee_structures fs
JOIN bands b ON b.band = fs.fee_level
ON CONFLICT DO NOTHING;

DELETE FROM fee_structures
WHERE fee_level IN ('pp', 'lower_pri', 'upper_pri', 'jss', 'sss');

-- =====================================================================
-- 3. students.fee_category_id (assignment UI arrives next phase; until a
--    student is explicitly assigned, boarding_status picks Day/Boarder)
-- =====================================================================

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS fee_category_id UUID REFERENCES fee_categories(id) ON DELETE SET NULL;

-- Effective category for billing.
CREATE OR REPLACE FUNCTION public.student_fee_category(p_student_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    s.fee_category_id,
    (SELECT fc.id FROM fee_categories fc
     WHERE fc.school_id = s.school_id
       AND fc.kind = CASE WHEN s.boarding_status = 'boarder' THEN 'boarder' ELSE 'day' END
     LIMIT 1)
  )
  FROM students s WHERE s.id = p_student_id;
$$;

REVOKE ALL ON FUNCTION public.student_fee_category(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.student_fee_category(UUID) TO authenticated, service_role;

-- =====================================================================
-- 4. get_student_fee_summary — per-grade sheet with category override
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

  -- Effective sheet: one row per votehead; category-specific wins over shared.
  SELECT COALESCE(SUM(t1), 0), COALESCE(SUM(t2), 0), COALESCE(SUM(t3), 0)
  INTO v_billed_t1, v_billed_t2, v_billed_t3
  FROM (
    SELECT DISTINCT ON (fs.votehead_id) fs.t1, fs.t2, fs.t3
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
    ORDER BY fs.votehead_id, (fs.category_id IS NOT NULL) DESC
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
-- 5. generate_invoices — per-grade sheet with category override
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
      SELECT DISTINCT ON (fs.votehead_id)
             (CASE p_term WHEN 1 THEN fs.t1 WHEN 2 THEN fs.t2 ELSE fs.t3 END) AS amount
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
      ORDER BY fs.votehead_id, (fs.category_id IS NOT NULL) DESC
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
        SELECT DISTINCT ON (fs.votehead_id)
               vh.id AS votehead_id, vh.description, vh.priority, vh.display_order,
               (CASE p_term WHEN 1 THEN fs.t1 WHEN 2 THEN fs.t2 ELSE fs.t3 END) AS amount
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
        ORDER BY fs.votehead_id, (fs.category_id IS NOT NULL) DESC
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

-- Audit the new table alongside the rest.
DROP TRIGGER IF EXISTS fee_categories_audit ON fee_categories;
CREATE TRIGGER fee_categories_audit
  AFTER INSERT OR UPDATE OR DELETE ON fee_categories
  FOR EACH ROW EXECUTE FUNCTION public.fee_audit_row();

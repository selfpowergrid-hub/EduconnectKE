-- Fees module — Phase 2: the invoicing engine.
--
-- Adds:
--   fee_doc_counters       -- per-school sequential numbering (INV, RCT, ...)
--   fee_invoices           -- one bill per student per term
--   fee_invoice_items      -- votehead lines (or custom charges) on an invoice
--   next_fee_doc_no()      -- atomic counter increment
--   generate_invoices()    -- batch/single invoice generation from published
--                             structures, boarder/day aware, duplicate-safe
--   cancel_fee_invoice()   -- soft-cancel with mandatory reason (no deletes)
--   add_invoice_item()     -- ad-hoc custom charge on an issued invoice
--
-- Design notes:
--   - Invoice amounts are FROZEN at generation time (copied from the
--     structure). Editing a structure later never rewrites issued invoices;
--     re-billing requires cancel + regenerate.
--   - Statuses 'partially_paid'/'paid' are in the CHECK now but only start
--     being set by Phase 3's payment allocation.
--   - A student can hold at most ONE non-cancelled invoice per (year, term):
--     enforced by a partial unique index (FR-3.7 duplicate prevention).
--   - All writes go through SECURITY DEFINER RPCs that re-check the caller
--     is the school's admin or finance staff; table RLS matches Phase 0.

-- =====================================================================
-- 1. fee_doc_counters — sequential document numbers per school/type/year
-- =====================================================================

CREATE TABLE IF NOT EXISTS fee_doc_counters (
  school_id  UUID NOT NULL REFERENCES school_registrations(id) ON DELETE CASCADE,
  doc_type   TEXT NOT NULL,            -- 'INV' | 'RCT' | ...
  year       INT  NOT NULL,
  last_no    INT  NOT NULL DEFAULT 0,  -- last issued number
  PRIMARY KEY (school_id, doc_type, year)
);

ALTER TABLE fee_doc_counters ENABLE ROW LEVEL SECURITY;
-- No direct policies: counters are only touched inside SECURITY DEFINER RPCs.

-- Atomically claims the next number for a (school, type, year).
CREATE OR REPLACE FUNCTION public.next_fee_doc_no(p_school_id UUID, p_doc_type TEXT, p_year INT)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_no INT;
BEGIN
  INSERT INTO fee_doc_counters (school_id, doc_type, year, last_no)
  VALUES (p_school_id, p_doc_type, p_year, 1)
  ON CONFLICT (school_id, doc_type, year)
  DO UPDATE SET last_no = fee_doc_counters.last_no + 1
  RETURNING last_no INTO v_no;
  RETURN v_no;
END;
$$;

REVOKE ALL ON FUNCTION public.next_fee_doc_no(UUID, TEXT, INT) FROM PUBLIC, anon, authenticated;

-- =====================================================================
-- 2. fee_invoices + fee_invoice_items
-- =====================================================================

CREATE TABLE IF NOT EXISTS fee_invoices (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES school_registrations(id) ON DELETE CASCADE,
  student_id    UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  invoice_no    TEXT NOT NULL,
  year          INT  NOT NULL,
  term          INT  NOT NULL CHECK (term IN (1, 2, 3)),
  fee_level     TEXT,                          -- snapshot of the student's CBC fee level
  issue_date    DATE NOT NULL DEFAULT current_date,
  due_date      DATE,
  status        TEXT NOT NULL DEFAULT 'issued'
                CHECK (status IN ('issued', 'partially_paid', 'paid', 'cancelled')),
  total         NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  cancel_reason TEXT,
  cancelled_at  TIMESTAMPTZ,
  cancelled_by  UUID,
  created_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, invoice_no)
);

-- FR-3.7: one live invoice per student per term.
CREATE UNIQUE INDEX IF NOT EXISTS fee_invoices_one_live_per_term_idx
  ON fee_invoices (school_id, student_id, year, term)
  WHERE status <> 'cancelled';

CREATE INDEX IF NOT EXISTS fee_invoices_student_idx ON fee_invoices (student_id, year);
CREATE INDEX IF NOT EXISTS fee_invoices_school_idx  ON fee_invoices (school_id, year, term);

CREATE TABLE IF NOT EXISTS fee_invoice_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    UUID NOT NULL REFERENCES school_registrations(id) ON DELETE CASCADE,
  invoice_id   UUID NOT NULL REFERENCES fee_invoices(id) ON DELETE CASCADE,
  votehead_id  UUID REFERENCES voteheads(id),   -- NULL => custom charge
  description  TEXT NOT NULL,
  amount       NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
  is_custom    BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fee_invoice_items_invoice_idx ON fee_invoice_items (invoice_id);

-- RLS: same shape as Phase 0 fee tables (admin via 20260613-style policy is
-- not present on these new tables, so add admin + finance here).
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY['fee_invoices', 'fee_invoice_items'];
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
-- 3. generate_invoices — batch/single generation
-- =====================================================================
-- Targets, narrowest wins: p_student_id > p_level_id (one grade, e.g. 'g7')
-- > p_fee_level (CBC band, e.g. 'jss') > whole school.
-- For each target student without a live invoice for (year, term):
--   line items = published structure rows for their fee level whose votehead
--   is active and applies to them (dorm => boarder); amount = that term's
--   column. Students with no billable lines are skipped, not invoiced at 0.

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
    -- Duplicate guard (FR-3.7)
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

    -- Peek: does this student have any billable line for this term?
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

    -- Number + header
    v_seq := public.next_fee_doc_no(p_school_id, 'INV', p_year);
    v_invoice_no := format('INV-%s-T%s-%s', p_year, p_term, lpad(v_seq::text, 6, '0'));

    INSERT INTO fee_invoices (school_id, student_id, invoice_no, year, term,
                              fee_level, due_date, status, total, created_by)
    VALUES (p_school_id, v_student.id, v_invoice_no, p_year, p_term,
            v_fee_level, p_due_date, 'issued', v_total, auth.uid())
    RETURNING id INTO v_invoice_id;

    -- Frozen line items
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

    v_created := v_created + 1;
    v_amount_total := v_amount_total + v_total;
  END LOOP;

  RETURN jsonb_build_object(
    'created',              v_created,
    'skipped_existing',     v_skipped_existing,
    'skipped_no_structure', v_skipped_no_items,
    'total_billed',         v_amount_total
  );
END;
$$;

REVOKE ALL ON FUNCTION public.generate_invoices(UUID, INT, INT, TEXT, TEXT, UUID, UUID, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_invoices(UUID, INT, INT, TEXT, TEXT, UUID, UUID, DATE) TO authenticated;

-- =====================================================================
-- 4. cancel_fee_invoice — soft cancel, mandatory reason
-- =====================================================================

CREATE OR REPLACE FUNCTION public.cancel_fee_invoice(p_invoice_id UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id UUID;
  v_status    TEXT;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'A cancellation reason is required';
  END IF;

  SELECT school_id, status INTO v_school_id, v_status
  FROM fee_invoices WHERE id = p_invoice_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'Invoice not found'; END IF;

  IF NOT public.is_school_admin(v_school_id)
     AND NOT public.is_finance_staff(v_school_id) THEN
    RAISE EXCEPTION 'Not authorized to cancel invoices for this school';
  END IF;

  IF v_status = 'cancelled' THEN
    RAISE EXCEPTION 'Invoice is already cancelled';
  END IF;

  UPDATE fee_invoices
  SET status = 'cancelled',
      cancel_reason = trim(p_reason),
      cancelled_at = now(),
      cancelled_by = auth.uid()
  WHERE id = p_invoice_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_fee_invoice(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_fee_invoice(UUID, TEXT) TO authenticated;

-- =====================================================================
-- 5. add_invoice_item — ad-hoc custom charge (FR-3.5)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.add_invoice_item(
  p_invoice_id  UUID,
  p_description TEXT,
  p_amount      NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id UUID;
  v_status    TEXT;
BEGIN
  IF p_description IS NULL OR length(trim(p_description)) = 0 THEN
    RAISE EXCEPTION 'A description is required';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero';
  END IF;

  SELECT school_id, status INTO v_school_id, v_status
  FROM fee_invoices WHERE id = p_invoice_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'Invoice not found'; END IF;

  IF NOT public.is_school_admin(v_school_id)
     AND NOT public.is_finance_staff(v_school_id) THEN
    RAISE EXCEPTION 'Not authorized to modify invoices for this school';
  END IF;

  IF v_status = 'cancelled' THEN
    RAISE EXCEPTION 'Cannot add charges to a cancelled invoice';
  END IF;

  INSERT INTO fee_invoice_items (school_id, invoice_id, votehead_id, description, amount, is_custom)
  VALUES (v_school_id, p_invoice_id, NULL, trim(p_description), round(p_amount::numeric, 2), true);

  UPDATE fee_invoices
  SET total = total + round(p_amount::numeric, 2)
  WHERE id = p_invoice_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.add_invoice_item(UUID, TEXT, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_invoice_item(UUID, TEXT, NUMERIC) TO authenticated;

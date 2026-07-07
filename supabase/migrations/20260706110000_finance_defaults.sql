-- Finance defaults: working year, current term, and receipt-number seeding.
--
--   fee_settings.working_year   -- year finance screens open on (NULL = calendar)
--   fee_settings.current_term   -- default term for forms (NULL = by calendar month)
--   get_next_receipt_no()       -- what the next receipt will be numbered
--   set_receipt_counter()       -- seed/advance the counter (forward only —
--                                  moving back would mint duplicate receipt numbers)
--
-- The counter itself is unchanged: fee_doc_counters increments atomically on
-- every payment and the number prints on the receipt (RCT-<year>-<seq>).

ALTER TABLE fee_settings ADD COLUMN IF NOT EXISTS working_year INT;
ALTER TABLE fee_settings ADD COLUMN IF NOT EXISTS current_term INT;

DO $$
BEGIN
  ALTER TABLE fee_settings
    ADD CONSTRAINT fee_settings_current_term_check
    CHECK (current_term IS NULL OR current_term IN (1, 2, 3));
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$$;

-- =====================================================================
-- get_next_receipt_no — fee_doc_counters has no client policies, so reads
-- go through this guarded function.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_next_receipt_no(p_school_id UUID, p_year INT)
RETURNS INT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last INT;
BEGIN
  IF NOT public.is_school_admin(p_school_id)
     AND NOT public.is_finance_reader(p_school_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  SELECT last_no INTO v_last FROM fee_doc_counters
  WHERE school_id = p_school_id AND doc_type = 'RCT' AND year = p_year;
  RETURN COALESCE(v_last, 0) + 1;
END;
$$;

REVOKE ALL ON FUNCTION public.get_next_receipt_no(UUID, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_next_receipt_no(UUID, INT) TO authenticated;

-- =====================================================================
-- set_receipt_counter — forward only, so numbers can never duplicate
-- =====================================================================

CREATE OR REPLACE FUNCTION public.set_receipt_counter(p_school_id UUID, p_year INT, p_next_no INT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last INT;
BEGIN
  IF NOT public.is_school_admin(p_school_id)
     AND NOT public.is_finance_staff(p_school_id) THEN
    RAISE EXCEPTION 'Not authorized to change receipt numbering';
  END IF;
  IF p_next_no IS NULL OR p_next_no < 1 THEN
    RAISE EXCEPTION 'The next receipt number must be 1 or higher';
  END IF;

  SELECT last_no INTO v_last FROM fee_doc_counters
  WHERE school_id = p_school_id AND doc_type = 'RCT' AND year = p_year;
  v_last := COALESCE(v_last, 0);

  IF p_next_no <= v_last THEN
    RAISE EXCEPTION 'Receipt numbering can only move FORWARD: % receipts already issued this year, so the next number must be at least %',
      v_last, v_last + 1;
  END IF;

  INSERT INTO fee_doc_counters (school_id, doc_type, year, last_no)
  VALUES (p_school_id, 'RCT', p_year, p_next_no - 1)
  ON CONFLICT (school_id, doc_type, year)
  DO UPDATE SET last_no = p_next_no - 1;

  RETURN jsonb_build_object('ok', true, 'next_no', p_next_no);
END;
$$;

REVOKE ALL ON FUNCTION public.set_receipt_counter(UUID, INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_receipt_counter(UUID, INT, INT) TO authenticated;

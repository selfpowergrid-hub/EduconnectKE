-- Fees module — Phase 6: report helpers.
--
-- Adds get_fee_ledger_totals(): per-account debit/credit sums over a date
-- range, so the Finance Dashboard can show ledger-reconciled figures and a
-- "ledger balanced" check (AC-6) without pulling every entry to the client.

CREATE OR REPLACE FUNCTION public.get_fee_ledger_totals(
  p_school_id UUID,
  p_from      DATE DEFAULT NULL,
  p_to        DATE DEFAULT NULL
)
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
    RAISE EXCEPTION 'Not authorized to read the ledger for this school';
  END IF;

  SELECT COALESCE(jsonb_agg(row ORDER BY row->>'account'), '[]'::jsonb) INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'account', account,
      'debits',  COALESCE(SUM(debit), 0),
      'credits', COALESCE(SUM(credit), 0)
    ) AS row
    FROM fee_ledger_entries
    WHERE school_id = p_school_id
      AND (p_from IS NULL OR entry_date >= p_from)
      AND (p_to   IS NULL OR entry_date <= p_to)
    GROUP BY account
  ) t;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_fee_ledger_totals(UUID, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_fee_ledger_totals(UUID, DATE, DATE) TO authenticated;

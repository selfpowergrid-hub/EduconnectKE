-- Final Accounts — Phase A helpers.
--
-- get_gl_trial_balance(): per-account debit/credit sums over an optional date
-- range, joined to the Chart of Accounts. Powers:
--   · the "GL balanced" health check on the Chart of Accounts screen
--     (Σdebits must equal Σcredits — proves the bridge/backfill posted cleanly)
--   · Phase E's Trial Balance report later (single source of truth).
--
-- Read-only; admin or any finance reader. Mirrors get_fee_ledger_totals().

CREATE OR REPLACE FUNCTION public.get_gl_trial_balance(
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

  SELECT COALESCE(jsonb_agg(row ORDER BY row->>'code'), '[]'::jsonb) INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'account_id', a.id,
      'code',       a.code,
      'name',       a.name,
      'type',       a.type,
      'subtype',    a.subtype,
      'debits',     COALESCE(SUM(l.debit), 0),
      'credits',    COALESCE(SUM(l.credit), 0)
    ) AS row
    FROM gl_accounts a
    LEFT JOIN (gl_journal_lines l JOIN gl_journals j ON j.id = l.journal_id)
      ON l.account_id = a.id
     AND (p_from IS NULL OR j.entry_date >= p_from)
     AND (p_to   IS NULL OR j.entry_date <= p_to)
    WHERE a.school_id = p_school_id
    GROUP BY a.id, a.code, a.name, a.type, a.subtype
    HAVING COALESCE(SUM(l.debit), 0) <> 0 OR COALESCE(SUM(l.credit), 0) <> 0
  ) t;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_gl_trial_balance(UUID, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_gl_trial_balance(UUID, DATE, DATE) TO authenticated;

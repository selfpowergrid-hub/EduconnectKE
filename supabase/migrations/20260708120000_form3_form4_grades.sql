-- Form 3 & Form 4 (8-4-4) grade codes: f3, f4.
--
-- CBC has reached Grade 10; the phasing-out 8-4-4 cohort sits in Form 3/4,
-- which live only in senior secondary. Students store these as level_id
-- 'f3'/'f4' (students.level_id is unconstrained TEXT — no schema change).
--
-- The only server-side gate that enumerates grade codes is
-- fee_level_for_grade(); it must map f3/f4 to the senior-secondary fee band
-- so invoicing, fee summaries and reports treat Form students like Grade 10-12.
-- Idempotent: pure CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.fee_level_for_grade(p_level_id TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_level_id IN ('pp1', 'pp2')          THEN 'pp'
    WHEN p_level_id IN ('g1', 'g2', 'g3')      THEN 'lower_pri'
    WHEN p_level_id IN ('g4', 'g5', 'g6')      THEN 'upper_pri'
    WHEN p_level_id IN ('g7', 'g8', 'g9')      THEN 'jss'
    WHEN p_level_id IN ('g10', 'g11', 'g12', 'f3', 'f4') THEN 'sss'
    ELSE NULL
  END;
$$;

-- Function bodies changed but no signatures did; still, nudge PostgREST so its
-- schema cache is fresh (matches the convention used by prior fee migrations).
NOTIFY pgrst, 'reload schema';

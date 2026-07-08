-- System-allocated school codes: SCH-001, SCH-002, …
--
-- Every school gets an immutable, system-assigned code that teachers and
-- parents type before their credentials to reach the right school. It becomes
-- the advertised login code; the pre-existing user-picked login_code keeps
-- working as a legacy alias so already-distributed codes never break.
--
-- Idempotent: guarded column/sequence/index, CREATE OR REPLACE functions,
-- drop-then-create trigger, backfill only fills NULLs.

-- 1. Column + uniqueness + allocation sequence -------------------------------
ALTER TABLE school_registrations ADD COLUMN IF NOT EXISTS school_code TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS school_registrations_school_code_idx
  ON school_registrations (school_code);

CREATE SEQUENCE IF NOT EXISTS school_code_seq START 1;

-- 2. Formatter: 1 -> 'SCH-001' … 999 -> 'SCH-999', 1000 -> 'SCH-1000' --------
CREATE OR REPLACE FUNCTION public.format_school_code(n BIGINT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$ SELECT 'SCH-' || lpad(n::text, 3, '0') $$;

-- 3. Backfill existing schools in registration order, then advance the
--    sequence past the highest number used. --------------------------------
WITH ordered AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn
  FROM school_registrations
  WHERE school_code IS NULL
)
UPDATE school_registrations s
SET school_code = public.format_school_code(o.rn)
FROM ordered o
WHERE s.id = o.id;

DO $$
DECLARE
  max_n BIGINT;
BEGIN
  SELECT COALESCE(MAX((regexp_replace(school_code, '\D', '', 'g'))::bigint), 0)
    INTO max_n
    FROM school_registrations
    WHERE school_code ~ '^SCH-\d+$';
  IF max_n > 0 THEN
    PERFORM setval('school_code_seq', max_n, true);   -- next nextval = max_n + 1
  ELSE
    PERFORM setval('school_code_seq', 1, false);      -- next nextval = 1
  END IF;
END $$;

-- 4. Auto-assign on insert when not supplied (never overwrite) ---------------
CREATE OR REPLACE FUNCTION public.assign_school_code()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.school_code IS NULL OR length(trim(NEW.school_code)) = 0 THEN
    NEW.school_code := public.format_school_code(nextval('school_code_seq'));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS school_registrations_school_code_trg ON school_registrations;
CREATE TRIGGER school_registrations_school_code_trg
  BEFORE INSERT ON school_registrations
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_school_code();

-- 5. Input normaliser: 'sch001' | 'SCH 001' | 'sch-1' -> 'SCH-001'.
--    Returns NULL unless the letters are exactly SCH and there are digits, so
--    a legacy login_code (STPIUS-2, …) never masquerades as a school code.
CREATE OR REPLACE FUNCTION public.normalize_school_code(p TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  letters TEXT;
  digits  TEXT;
BEGIN
  IF p IS NULL THEN RETURN NULL; END IF;
  letters := upper(regexp_replace(p, '[^A-Za-z]', '', 'g'));
  digits  := regexp_replace(p, '\D', '', 'g');
  IF letters <> 'SCH' OR digits = '' THEN
    RETURN NULL;
  END IF;
  RETURN 'SCH-' || lpad((digits)::bigint::text, 3, '0');
END $$;

-- 6. Resolver used by the public edge functions. Tries the system code first,
--    then the legacy login_code. SECURITY DEFINER so callers need no read
--    access to school_registrations; returns only the school id.
CREATE OR REPLACE FUNCTION public.resolve_school_by_code(p TEXT)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_norm TEXT;
  v_id   UUID;
BEGIN
  v_norm := public.normalize_school_code(p);
  IF v_norm IS NOT NULL THEN
    SELECT id INTO v_id FROM school_registrations WHERE school_code = v_norm LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;

  v_norm := public.normalize_login_code(p);
  IF v_norm IS NOT NULL THEN
    SELECT id INTO v_id FROM school_registrations WHERE login_code = v_norm LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;

  RETURN NULL;
END $$;

GRANT EXECUTE ON FUNCTION public.format_school_code(BIGINT)   TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_school_code(TEXT)  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_school_by_code(TEXT) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

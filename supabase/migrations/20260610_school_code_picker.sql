-- 20260610_school_code_picker.sql
--
-- Adds two helper functions so admins can pick (and validate) their
-- school's login_code during registration:
--
--   public.normalize_login_code(text)       -> TEXT
--   public.is_login_code_available(text)    -> BOOLEAN
--
-- The existing BEFORE INSERT trigger on school_registrations already
-- respects a non-null login_code, so providing one at insert time will
-- stick. These helpers exist so the public check-school-code Edge
-- Function can validate input cheaply without exposing the full table.

-- ---------------------------------------------------------------------
-- normalize_login_code
-- Uppercases, collapses non-alphanumeric runs into single hyphens, strips
-- leading/trailing hyphens, caps at 16 chars. Returns NULL if the result
-- is shorter than 4 chars (too short to be useful as a school code).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalize_login_code(p_code TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  cleaned TEXT;
BEGIN
  IF p_code IS NULL OR length(trim(p_code)) = 0 THEN
    RETURN NULL;
  END IF;

  cleaned := upper(p_code);
  cleaned := regexp_replace(cleaned, '[^A-Z0-9]+', '-', 'g');
  cleaned := regexp_replace(cleaned, '^-+|-+$', '', 'g');
  cleaned := substring(cleaned for 16);
  cleaned := regexp_replace(cleaned, '-+$', '', 'g');

  IF cleaned IS NULL OR length(cleaned) < 4 THEN
    RETURN NULL;
  END IF;

  RETURN cleaned;
END;
$$;

-- ---------------------------------------------------------------------
-- is_login_code_available
-- Returns TRUE iff the normalized code is non-null and not already
-- claimed by another school. SECURITY DEFINER so callers do not need
-- read access to school_registrations.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_login_code_available(p_code TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized TEXT;
BEGIN
  normalized := public.normalize_login_code(p_code);

  IF normalized IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN NOT EXISTS (
    SELECT 1 FROM school_registrations
    WHERE login_code = normalized
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.normalize_login_code(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_login_code_available(TEXT) TO anon, authenticated;

-- Hardening: is_school_admin() identified the admin ONLY by JWT email match.
-- If a refreshed/edge-case token carries a missing or differently-cased email
-- claim, every admin write suddenly fails RLS ("new row violates row-level
-- security policy") even though the user is legitimately signed in.
--
-- school_registrations.user_id stores the registering auth user, so accept
-- EITHER identification: email match (legacy rows) OR user_id = auth.uid().

CREATE OR REPLACE FUNCTION public.is_school_admin(p_school_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_email TEXT;
  caller_uid   UUID;
BEGIN
  caller_email := auth.jwt() ->> 'email';
  caller_uid   := auth.uid();
  IF caller_email IS NULL AND caller_uid IS NULL THEN RETURN FALSE; END IF;

  RETURN EXISTS (
    SELECT 1 FROM school_registrations sr
    WHERE sr.id = p_school_id
      AND (
        (caller_email IS NOT NULL AND lower(sr.email) = lower(caller_email))
        OR (caller_uid IS NOT NULL AND sr.user_id = caller_uid)
      )
  );
END;
$$;

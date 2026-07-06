-- Phase 1: schema to support teacher logins + per-subject/class assignments.
--
-- Adds:
--   school_registrations.login_code  TEXT UNIQUE  -- short code teachers type at login
--   staff.auth_user_id               UUID NULL    -- link to Supabase auth user (when set, this staff member can log in)
--   teacher_assignments              new table    -- (teacher × subject × class × stream) many-to-many
--
-- Notes:
--   - Admins are still identified by school_registrations.email = auth.email().
--   - login_code is auto-generated from school_name and editable later.

-- =====================================================================
-- 1. login_code on school_registrations
-- =====================================================================

ALTER TABLE school_registrations
  ADD COLUMN IF NOT EXISTS login_code TEXT;

-- Helper: derive a base code from a school name.
-- e.g. "Tabolwa High School" -> "TABOLWA-HIGH-SCHO"
CREATE OR REPLACE FUNCTION public.derive_school_code(p_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  cleaned TEXT;
BEGIN
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RETURN 'SCHOOL';
  END IF;

  cleaned := upper(p_name);
  -- replace any non-alphanumeric run with a single hyphen
  cleaned := regexp_replace(cleaned, '[^A-Z0-9]+', '-', 'g');
  -- trim leading/trailing hyphens
  cleaned := regexp_replace(cleaned, '^-+|-+$', '', 'g');
  -- cap at 16 characters and re-trim trailing hyphens
  cleaned := substring(cleaned for 16);
  cleaned := regexp_replace(cleaned, '-+$', '', 'g');

  IF length(cleaned) = 0 THEN
    RETURN 'SCHOOL';
  END IF;

  RETURN cleaned;
END;
$$;

-- Picks a unique code for a school, appending -2, -3, ... on collision.
CREATE OR REPLACE FUNCTION public.assign_unique_login_code(p_school_id UUID, p_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  base_code TEXT;
  candidate TEXT;
  suffix INT := 2;
BEGIN
  base_code := public.derive_school_code(p_name);
  candidate := base_code;

  WHILE EXISTS (
    SELECT 1 FROM school_registrations
    WHERE login_code = candidate
      AND id <> p_school_id
  ) LOOP
    candidate := substring(base_code for 14) || '-' || suffix::text;
    suffix := suffix + 1;
  END LOOP;

  RETURN candidate;
END;
$$;

-- Backfill existing rows
UPDATE school_registrations
SET login_code = public.assign_unique_login_code(id, school_name)
WHERE login_code IS NULL;

-- Enforce uniqueness and not-null going forward
ALTER TABLE school_registrations
  ALTER COLUMN login_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS school_registrations_login_code_idx
  ON school_registrations (login_code);

-- Auto-assign on insert if not provided
CREATE OR REPLACE FUNCTION public.school_registrations_set_login_code()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.login_code IS NULL OR length(trim(NEW.login_code)) = 0 THEN
    NEW.login_code := public.assign_unique_login_code(NEW.id, NEW.school_name);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS school_registrations_login_code_trg ON school_registrations;
CREATE TRIGGER school_registrations_login_code_trg
  BEFORE INSERT ON school_registrations
  FOR EACH ROW
  EXECUTE FUNCTION public.school_registrations_set_login_code();


-- =====================================================================
-- 2. auth_user_id on staff
-- =====================================================================

ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS auth_user_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS staff_auth_user_id_idx
  ON staff (auth_user_id)
  WHERE auth_user_id IS NOT NULL;


-- =====================================================================
-- 3. teacher_assignments
-- =====================================================================
-- One row per (teacher, subject, level_id, stream_id) combo a teacher covers.
-- stream_id NULL = "all streams in that grade".

CREATE TABLE IF NOT EXISTS teacher_assignments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         UUID NOT NULL REFERENCES school_registrations(id) ON DELETE CASCADE,
  teacher_staff_id  UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  subject_id        UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  level_id          TEXT NOT NULL,
  stream_id         UUID REFERENCES streams(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A teacher can't have the exact same assignment twice.
-- NULL stream_id is treated as distinct from a specific stream — meaning
-- "Math · Grade 10 · all streams" and "Math · Grade 10 · 10A" can both exist
-- (admin's responsibility to keep this sane).
CREATE UNIQUE INDEX IF NOT EXISTS teacher_assignments_unique_idx
  ON teacher_assignments (teacher_staff_id, subject_id, level_id, COALESCE(stream_id::text, ''));

CREATE INDEX IF NOT EXISTS teacher_assignments_lookup_idx
  ON teacher_assignments (school_id, level_id, stream_id);

CREATE INDEX IF NOT EXISTS teacher_assignments_by_teacher_idx
  ON teacher_assignments (teacher_staff_id);

-- Enable RLS now; actual policies arrive in Phase 6.
ALTER TABLE teacher_assignments ENABLE ROW LEVEL SECURITY;

-- Temporary permissive policy so the app keeps working until Phase 6 lands.
-- (Phase 6 will DROP this and replace it with proper admin/teacher policies.)
DROP POLICY IF EXISTS teacher_assignments_temp_all ON teacher_assignments;
CREATE POLICY teacher_assignments_temp_all
  ON teacher_assignments
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Subject groups (KNEC Group 1–5) + per-grade totalling/minimum-subjects
-- policies.
--
-- 1. subjects.subject_group: which KNEC group a subject belongs to. Existing
--    rows default to Group 1, which is harmless because counting rules only
--    apply when a school explicitly saves a policy with count_all = false.
--
-- 2. aggregation_policies: one row per school + grade (level_category code
--    like 'f3' / 'g10'). ABSENCE of a row means "count all subjects" — new
--    and existing schools need no seeding and keep today's behavior.
--    rules JSONB shape (order matters, applied top to bottom):
--      [ { "group": 1, "take": "all" },
--        { "group": 2, "take": 2 },
--        { "group": 3, "take": 1 },
--        { "remaining": true, "take": 1 } ]
--
-- Security follows the phase-8 pattern: RLS on, admin-only via
-- is_school_admin(), teacher read via user_in_school(), no anon grants.

ALTER TABLE subjects ADD COLUMN IF NOT EXISTS subject_group SMALLINT NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS aggregation_policies (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      UUID NOT NULL REFERENCES school_registrations(id) ON DELETE CASCADE,
  level_category TEXT NOT NULL,
  count_all      BOOLEAN NOT NULL DEFAULT TRUE,
  rules          JSONB,
  min_subjects   SMALLINT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, level_category)
);

ALTER TABLE aggregation_policies ENABLE ROW LEVEL SECURITY;

-- Admin: full control over their own school's policies.
DROP POLICY IF EXISTS aggregation_policies_admin_all ON aggregation_policies;
CREATE POLICY aggregation_policies_admin_all ON aggregation_policies
  FOR ALL TO authenticated
  USING (public.is_school_admin(school_id))
  WITH CHECK (public.is_school_admin(school_id));

-- Teachers: read-only (marksheets/reports need the policy to compute totals).
DROP POLICY IF EXISTS aggregation_policies_teacher_select ON aggregation_policies;
CREATE POLICY aggregation_policies_teacher_select ON aggregation_policies
  FOR SELECT TO authenticated
  USING (public.user_in_school(school_id));

-- Defense in depth: no anon access at all.
REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON aggregation_policies FROM anon;

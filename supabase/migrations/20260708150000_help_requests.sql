-- Ask for Help — in-app support requests from anywhere in the system.
--
-- A signed-in user (admin/teacher/finance) can file a request and read their
-- own. The message is auto-tagged with school/role/module/page by the client so
-- the LogiQ-Taaluma team can triage from the Supabase dashboard.
--
-- Idempotent: guarded table + policy.

CREATE TABLE IF NOT EXISTS help_requests (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID REFERENCES school_registrations(id) ON DELETE SET NULL,
  user_id     UUID,                 -- auth.uid() when signed in
  role        TEXT,                 -- admin | teacher | bursar | accountant | auditor | parent
  module      TEXT,                 -- exams | accounts | portal | other
  page        TEXT,                 -- the pageId the user was on
  message     TEXT NOT NULL,
  contact     TEXT,                 -- email/phone to reply on
  status      TEXT NOT NULL DEFAULT 'open',   -- open | in_progress | closed
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS help_requests_school_idx ON help_requests (school_id, created_at DESC);

ALTER TABLE help_requests ENABLE ROW LEVEL SECURITY;

-- A signed-in user may create their own request and read it back.
DROP POLICY IF EXISTS help_requests_self ON help_requests;
CREATE POLICY help_requests_self ON help_requests
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT ON help_requests TO authenticated;

NOTIFY pgrst, 'reload schema';

-- TEMPORARY diagnostic (Phase 8 hardening). Returns RLS on/off + policy list
-- for students/staff so we can see live state without psql/docker. The very
-- next migration DROPs this function. Granted to anon only for this probe.

CREATE OR REPLACE FUNCTION public.diag_rls_state()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT jsonb_build_object(
    'rls', (
      SELECT jsonb_agg(jsonb_build_object('table', relname, 'rls_enabled', relrowsecurity))
      FROM pg_class
      WHERE relname IN ('students', 'staff', 'dorms', 'streams')
        AND relnamespace = 'public'::regnamespace
    ),
    'policies', (
      SELECT jsonb_agg(jsonb_build_object(
        'table', tablename, 'policy', policyname, 'roles', roles,
        'cmd', cmd, 'qual', qual
      ))
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename IN ('students', 'staff')
    ),
    'grants', (
      SELECT jsonb_agg(jsonb_build_object(
        'table', table_name, 'grantee', grantee, 'privilege', privilege_type
      ))
      FROM information_schema.role_table_grants
      WHERE table_schema = 'public'
        AND table_name IN ('students', 'staff')
        AND grantee IN ('anon', 'authenticated', 'public')
    )
  );
$$;

REVOKE ALL ON FUNCTION public.diag_rls_state() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.diag_rls_state() TO anon, authenticated;

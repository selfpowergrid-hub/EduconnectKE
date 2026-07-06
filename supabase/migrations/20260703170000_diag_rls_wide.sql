-- TEMPORARY diagnostic (Phase 8). Lists every permissive policy that applies
-- to the public/anon role across the public schema, so we can find all the
-- leftover "Allow public ..." templates. Dropped by the fix migration.

CREATE OR REPLACE FUNCTION public.diag_rls_state()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT jsonb_agg(jsonb_build_object(
    'table', tablename, 'policy', policyname, 'roles', roles, 'cmd', cmd, 'qual', qual
  ) ORDER BY tablename, policyname)
  FROM pg_policies
  WHERE schemaname = 'public'
    AND ('public' = ANY(roles) OR 'anon' = ANY(roles));
$$;

REVOKE ALL ON FUNCTION public.diag_rls_state() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.diag_rls_state() TO anon, authenticated;

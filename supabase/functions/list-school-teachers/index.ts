// Edge Function: list-school-teachers
//
// Public lookup used by the teacher login page. Given a school code (the
// system-assigned SCH-### code, or the legacy login_code as an alias), returns
// the list of teachers (id, full_name) for that school who have an auth user,
// plus the staff's email (used to call signInWithPassword on the client).
// NO authentication required — the school code is the gate.
//
// Why an Edge Function rather than a public RLS policy on staff:
//   - Avoids exposing the entire staff table publicly.
//   - Lets us rate-limit / log abuse later.
//
// Deploy:
//   supabase functions deploy list-school-teachers --no-verify-jwt
//
// (The --no-verify-jwt flag is important: this endpoint must be reachable
//  by anonymous users on the login page.)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let payload: { login_code?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  // Accept both field names; the client may send either.
  const code = (payload.login_code ?? (payload as { school_code?: string }).school_code)?.trim();
  if (!code) return json({ error: "school_code is required" }, 400);
  if (code.length > 32) return json({ error: "school_code too long" }, 400);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Resolve SCH-### first, then fall back to the legacy login_code.
  const { data: schoolId, error: resolveErr } = await admin
    .rpc("resolve_school_by_code", { p: code });
  if (resolveErr) return json({ error: resolveErr.message }, 500);
  if (!schoolId) return json({ error: "School code not recognised" }, 404);

  const { data: school, error: schoolErr } = await admin
    .from("school_registrations")
    .select("id, school_name")
    .eq("id", schoolId)
    .single();

  if (schoolErr || !school) {
    return json({ error: "School code not recognised" }, 404);
  }

  const { data: teachers, error: teachersErr } = await admin
    .from("staff")
    .select("id, full_name, email")
    .eq("school_id", school.id)
    .eq("type", "Teaching")
    .not("auth_user_id", "is", null)
    .order("full_name");

  if (teachersErr) return json({ error: teachersErr.message }, 500);

  return json({
    school_name: school.school_name,
    teachers: (teachers || []).map(t => ({
      id: t.id,
      full_name: t.full_name,
      email: t.email,
    })),
  });
});

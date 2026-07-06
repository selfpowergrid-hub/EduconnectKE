// Edge Function: create-teacher-user
//
// Admin clicks "Create Login" in the Teacher Allocation form.
// This function verifies the caller is the school's admin, then uses the
// service-role key (server-side only) to create an auth user with the
// admin-chosen password, and links it back to the staff row.
//
// Deploy:
//   supabase functions deploy create-teacher-user
//
// Required Supabase function secrets (these are present by default):
//   SUPABASE_URL
//   SUPABASE_ANON_KEY
//   SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
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

  let payload: { staff_id?: string; email?: string; password?: string; app_role?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { staff_id, email, password } = payload;
  if (!staff_id || !email || !password) {
    return json({ error: "staff_id, email and password are required" }, 400);
  }
  if (password.length < 6) {
    return json({ error: "Password must be at least 6 characters" }, 400);
  }

  // Which module shell this login works in (staff.app_role). Defaults to
  // teacher for backwards compatibility with older clients.
  const APP_ROLES = ["teacher", "exams_officer", "accountant", "bursar", "auditor"];
  const appRole = payload.app_role && APP_ROLES.includes(payload.app_role)
    ? payload.app_role
    : "teacher";

  // 1. Identify caller from their JWT
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

  const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user: caller }, error: callerErr } = await callerClient.auth.getUser();
  if (callerErr || !caller) return json({ error: "Not authenticated" }, 401);

  // 2. Admin client (service-role)
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 3. Look up the staff row + its school, verify caller is that school's admin
  const { data: staffRow, error: staffErr } = await admin
    .from("staff")
    .select("id, school_id, auth_user_id")
    .eq("id", staff_id)
    .single();
  if (staffErr || !staffRow) return json({ error: "Staff not found" }, 404);

  const { data: school, error: schoolErr } = await admin
    .from("school_registrations")
    .select("id, email")
    .eq("id", staffRow.school_id)
    .single();
  if (schoolErr || !school) return json({ error: "School not found" }, 404);

  if (school.email?.toLowerCase() !== caller.email?.toLowerCase()) {
    return json({ error: "Only the school admin can create teacher logins" }, 403);
  }

  if (staffRow.auth_user_id) {
    return json({ error: "This staff member already has a login. Use password reset instead." }, 409);
  }

  // 4. Create the auth user (email_confirm: true skips the confirmation step)
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      role: appRole,
      school_id: staffRow.school_id,
      staff_id: staffRow.id,
    },
  });
  if (createErr) return json({ error: createErr.message }, 400);

  // 5. Link to staff
  const { error: linkErr } = await admin
    .from("staff")
    .update({ auth_user_id: created.user.id, email, app_role: appRole })
    .eq("id", staff_id);
  if (linkErr) {
    // Roll back the auth user so we don't leak a dangling account
    await admin.auth.admin.deleteUser(created.user.id);
    return json({ error: "Could not link staff: " + linkErr.message }, 500);
  }

  return json({ ok: true, auth_user_id: created.user.id });
});

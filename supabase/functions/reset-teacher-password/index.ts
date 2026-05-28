// Edge Function: reset-teacher-password
//
// Admin clicks "Reset Password" in the Teacher Allocation form.
// Verifies the caller is the school admin, then sets a new password on the
// teacher's auth user via the service-role key.
//
// Deploy:
//   supabase functions deploy reset-teacher-password

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

  let payload: { staff_id?: string; password?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { staff_id, password } = payload;
  if (!staff_id || !password) return json({ error: "staff_id and password are required" }, 400);
  if (password.length < 6) return json({ error: "Password must be at least 6 characters" }, 400);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

  const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user: caller } } = await callerClient.auth.getUser();
  if (!caller) return json({ error: "Not authenticated" }, 401);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: staffRow, error: staffErr } = await admin
    .from("staff")
    .select("id, school_id, auth_user_id")
    .eq("id", staff_id)
    .single();
  if (staffErr || !staffRow) return json({ error: "Staff not found" }, 404);
  if (!staffRow.auth_user_id) return json({ error: "This staff member has no login yet" }, 404);

  const { data: school } = await admin
    .from("school_registrations")
    .select("email")
    .eq("id", staffRow.school_id)
    .single();
  if (school?.email?.toLowerCase() !== caller.email?.toLowerCase()) {
    return json({ error: "Only the school admin can reset teacher passwords" }, 403);
  }

  const { error: updErr } = await admin.auth.admin.updateUserById(staffRow.auth_user_id, { password });
  if (updErr) return json({ error: updErr.message }, 400);

  return json({ ok: true });
});

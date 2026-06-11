// Edge Function: check-school-code
//
// Public availability check for a school login_code, used by the
// registration form so admins can pick a code with live feedback.
//
// Request:  { code: string }
// Response: { normalized: string | null, available: boolean, reason?: string }
//
// Deploy:
//   supabase functions deploy check-school-code --no-verify-jwt

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

  let payload: { code?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const raw = payload.code?.trim();
  if (!raw) return json({ normalized: null, available: false, reason: "Enter a code." });
  if (raw.length > 32) return json({ normalized: null, available: false, reason: "Code is too long (max 32 chars)." });

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: normalized, error: normErr } = await admin.rpc("normalize_login_code", { p_code: raw });
  if (normErr) return json({ error: normErr.message }, 500);
  if (!normalized) {
    return json({ normalized: null, available: false, reason: "Code must be at least 4 letters/numbers." });
  }

  const { data: available, error: availErr } = await admin.rpc("is_login_code_available", { p_code: raw });
  if (availErr) return json({ error: availErr.message }, 500);

  return json({
    normalized,
    available: !!available,
    reason: available ? undefined : "That code is already taken.",
  });
});

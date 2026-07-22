// tenant-provision — self-serve signup (PRD §16): after phone-OTP auth,
// creates tenant + main branch + owner staff user + first device, and
// stamps tenant_id/app_role claims into the auth user's app_metadata.
// Idempotent: a caller who already owns a tenant gets their existing one.
import { createClient } from "npm:@supabase/supabase-js@2";
import { json, serviceClient } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "missing bearer token" }, 401);
  const anon = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { auth: { persistSession: false } },
  );
  const { data: userData, error: userErr } = await anon.auth.getUser(token);
  if (userErr || !userData.user) return json({ error: "invalid token" }, 401);
  const authUser = userData.user;

  let body: { name?: string; businessType?: string; kraPin?: string | null; deviceId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  if (!body.name || !body.deviceId) return json({ error: "name and deviceId required" }, 400);

  const db = serviceClient();

  // idempotency: existing tenant claim wins
  const existingTenant = (authUser.app_metadata as Record<string, unknown>)?.tenant_id;
  if (typeof existingTenant === "string") {
    const { data: dev } = await db
      .from("devices")
      .select("id")
      .eq("tenant_id", existingTenant)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    return json({ tenantId: existingTenant, deviceId: dev?.id ?? body.deviceId, existing: true });
  }

  const { data: tenant, error: tErr } = await db
    .from("tenants")
    .insert({
      name: body.name,
      business_type: body.businessType ?? "duka",
      kra_pin: body.kraPin ?? null,
      phone: authUser.phone ?? "",
      plan: "msingi",
      plan_status: "trial",
      trial_ends_at: new Date(Date.now() + 14 * 86_400_000).toISOString(), // 14-day trial (§13)
    })
    .select("id")
    .single();
  if (tErr || !tenant) return json({ error: tErr?.message ?? "tenant create failed" }, 500);

  const { error: bErr } = await db.from("branches").insert({
    tenant_id: tenant.id, name: body.name, is_main: true,
  });
  if (bErr) return json({ error: bErr.message }, 500);

  const { error: uErr } = await db.from("users").insert({
    tenant_id: tenant.id,
    phone: authUser.phone ?? null,
    full_name: body.name,
    role: "owner",
    auth_user_id: authUser.id,
    // pin_hash set from the app during first-run PIN creation
  });
  if (uErr) return json({ error: uErr.message }, 500);

  const { data: device, error: dErr } = await db
    .from("devices")
    .insert({
      id: body.deviceId, tenant_id: tenant.id, name: "Simu ya kwanza", approved: true, // first device auto-approved
    })
    .select("id")
    .single();
  if (dErr || !device) return json({ error: dErr?.message ?? "device create failed" }, 500);

  const { error: metaErr } = await db.auth.admin.updateUserById(authUser.id, {
    app_metadata: { tenant_id: tenant.id, app_role: "owner" },
  });
  if (metaErr) return json({ error: metaErr.message }, 500);

  return json({ tenantId: tenant.id, deviceId: device.id });
});

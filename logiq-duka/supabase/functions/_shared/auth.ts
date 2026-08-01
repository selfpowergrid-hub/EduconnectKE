// Caller authentication for sync functions: resolve the JWT into
// (userId, tenantId, role) and refuse anything cross-tenant.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

export interface Caller {
  authUserId: string;
  tenantId: string;
  role: string;
}

export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

export async function authenticate(req: Request): Promise<Caller | Response> {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "missing bearer token" }, 401);

  const anon = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { auth: { persistSession: false } },
  );
  const { data, error } = await anon.auth.getUser(token);
  if (error || !data.user) return json({ error: "invalid token" }, 401);

  const meta = (data.user.app_metadata ?? {}) as Record<string, unknown>;
  const tenantId = typeof meta.tenant_id === "string" ? meta.tenant_id : null;
  if (!tenantId) return json({ error: "no tenant claim" }, 403);

  return {
    authUserId: data.user.id,
    tenantId,
    role: typeof meta.app_role === "string" ? meta.app_role : "attendant",
  };
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// sync-pull — cursor-based change feed (PRD §27.3, §28).
// GET ?cursor=<server_seq>&limit=<n≤500>
// Response: { events: [...envelope + serverSeq], nextCursor, hasMore }
// Clients apply these through the SAME shared reducers, skipping events
// originating from their own device id.
import { authenticate, json, serviceClient } from "../_shared/auth.ts";

const MAX_LIMIT = 500;

Deno.serve(async (req) => {
  if (req.method !== "GET") return json({ error: "method not allowed" }, 405);
  const caller = await authenticate(req);
  if (caller instanceof Response) return caller;

  const url = new URL(req.url);
  const cursor = Number(url.searchParams.get("cursor") ?? "0");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "500") || 500, MAX_LIMIT);
  if (!Number.isSafeInteger(cursor) || cursor < 0) return json({ error: "bad cursor" }, 400);

  const db = serviceClient();
  const { data, error } = await db
    .from("events")
    .select("event_id, device_id, user_id, type, aggregate, aggregate_id, payload, client_ts, client_seq, server_seq")
    .eq("tenant_id", caller.tenantId)
    .gt("server_seq", cursor)
    .order("server_seq", { ascending: true })
    .limit(limit + 1);
  if (error) return json({ error: error.message }, 500);

  const page = (data ?? []).slice(0, limit);
  const hasMore = (data ?? []).length > limit;
  const events = page.map((r) => ({
    eventId: r.event_id,
    tenantId: caller.tenantId,
    deviceId: r.device_id,
    userId: r.user_id,
    type: r.type,
    aggregate: r.aggregate,
    aggregateId: r.aggregate_id,
    payload: r.payload,
    clientTs: r.client_ts,
    clientSeq: r.client_seq,
    serverSeq: r.server_seq,
  }));
  const last = page[page.length - 1];

  return json({
    events,
    nextCursor: last ? last.server_seq : cursor,
    hasMore,
  });
});

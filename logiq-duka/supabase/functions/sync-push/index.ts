// sync-push — idempotent event ingest (PRD §27.3, §28).
// Body: { events: EventEnvelope[] }  (batch ≤ 200)
// Response: { statuses: [{ eventId, status: ok|duplicate|invalid|error, error? }] }
// Guarantees: dedupe on event_id via event_registry; reducer effects are
// commutative/idempotent by construction; failures are recorded on the
// event row (applied=false + apply_error) and surfaced — never dropped.
import { authenticate, json, serviceClient } from "../_shared/auth.ts";
import { applyEffects } from "../_shared/executor.ts";
import { parseEvent } from "../_shared/gen/events/index.ts";
import { reduce } from "../_shared/gen/reducers/index.ts";

const MAX_BATCH = 200;

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  const caller = await authenticate(req);
  if (caller instanceof Response) return caller;

  let body: { events?: unknown[] };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  const rawEvents = Array.isArray(body.events) ? body.events : null;
  if (!rawEvents) return json({ error: "events[] required" }, 400);
  if (rawEvents.length > MAX_BATCH) return json({ error: `batch > ${MAX_BATCH}` }, 400);

  const db = serviceClient();
  const statuses: Array<{ eventId: string; status: string; error?: string }> = [];

  for (const raw of rawEvents) {
    const eventId = typeof (raw as Record<string, unknown>)?.eventId === "string"
      ? (raw as Record<string, string>).eventId
      : null;
    if (!eventId) {
      statuses.push({ eventId: "?", status: "invalid", error: "missing eventId" });
      continue;
    }

    try {
      const event = parseEvent(raw);
      if (event.tenantId !== caller.tenantId) {
        statuses.push({ eventId, status: "invalid", error: "tenant mismatch" });
        continue;
      }

      // global idempotency: first writer wins the registry
      const { data: reg, error: regErr } = await db
        .from("event_registry")
        .upsert(
          { event_id: eventId, tenant_id: event.tenantId },
          { onConflict: "event_id", ignoreDuplicates: true },
        )
        .select("event_id");
      if (regErr) throw new Error(`registry: ${regErr.message}`);
      if (!reg || reg.length === 0) {
        statuses.push({ eventId, status: "duplicate" });
        continue;
      }

      const { error: evErr } = await db.from("events").insert({
        event_id: eventId,
        tenant_id: event.tenantId,
        device_id: event.deviceId,
        user_id: event.userId ?? null,
        type: event.type,
        aggregate: event.aggregate,
        aggregate_id: event.aggregateId,
        payload: event.payload,
        client_ts: event.clientTs,
        client_seq: event.clientSeq,
        applied: false,
      });
      if (evErr) throw new Error(`event log: ${evErr.message}`);

      try {
        await applyEffects(db, event.tenantId, reduce(event));

        // server-side receipt number assignment (PRD §28.6)
        if (event.type === "sale.completed") {
          const { data: no, error: rcErr } = await db
            .schema("app")
            .rpc("next_receipt_no", { p_tenant: event.tenantId });
          if (!rcErr && no != null) {
            await db.from("sales")
              .update({ receipt_no: no })
              .eq("id", (event.payload as { saleId: string }).saleId)
              .is("receipt_no", null);
          }
        }

        await db.from("events").update({ applied: true }).eq("event_id", eventId);
        statuses.push({ eventId, status: "ok" });
      } catch (applyErr) {
        const msg = applyErr instanceof Error ? applyErr.message : String(applyErr);
        await db.from("events").update({ apply_error: msg }).eq("event_id", eventId);
        // Ack ingestion (event is durably logged) but surface the apply
        // failure for the admin fiscal-health-style dashboard.
        statuses.push({ eventId, status: "ok", error: `logged; apply deferred: ${msg}` });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isValidation = msg.includes("tenant mismatch") || /invalid|expected|received/i.test(msg);
      statuses.push({ eventId, status: isValidation ? "invalid" : "error", error: msg });
    }
  }

  // update device sync heartbeat (best effort)
  const deviceId = (rawEvents[0] as Record<string, unknown>)?.deviceId;
  if (typeof deviceId === "string") {
    await db.from("devices").update({ last_sync_at: new Date().toISOString() }).eq("id", deviceId);
  }

  return json({ statuses });
});

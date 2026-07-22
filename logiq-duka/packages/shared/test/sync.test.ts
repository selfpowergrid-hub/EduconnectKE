import { describe, expect, it } from "vitest";
import type { EventEnvelope } from "../src/events/index.js";
import {
  backoffDelayMs, MAX_PUSH_BATCH, SyncEngine,
  type PullResult, type PushResult, type SyncStorage, type SyncTransport,
} from "../src/sync/index.js";
import { DEVICE_A, fixedId, makeEvent, resetSeqs } from "./helpers.js";

function testEvents(n: number): EventEnvelope[] {
  resetSeqs();
  return Array.from({ length: n }, (_, i) =>
    makeEvent("stock.adjusted", {
      movementId: fixedId(2000 + i), productId: fixedId(1), qtyDelta: 1, reasonCode: "correction",
    }, { deviceId: DEVICE_A }) as EventEnvelope,
  );
}

class FakeStorage implements SyncStorage {
  pending: EventEnvelope[] = [];
  acked: string[] = [];
  rejected = new Map<string, string>();
  applied: EventEnvelope[] = [];
  cursor = 0;

  async pendingEvents(limit: number) { return this.pending.slice(0, limit); }
  async markAcked(ids: string[]) {
    this.acked.push(...ids);
    this.pending = this.pending.filter((e) => !ids.includes(e.eventId));
  }
  async markRejected(id: string, error: string) {
    this.rejected.set(id, error);
    this.pending = this.pending.filter((e) => e.eventId !== id);
  }
  async applyRemote(events: Array<EventEnvelope & { serverSeq: number }>) { this.applied.push(...events); }
  async getCursor() { return this.cursor; }
  async setCursor(c: number) { this.cursor = c; }
  async pendingCount() { return this.pending.length; }
}

const emptyPull: PullResult = { events: [], nextCursor: 0, hasMore: false };

describe("SyncEngine", () => {
  it("pushes in batches of ≤200 and only deletes after ack", async () => {
    const storage = new FakeStorage();
    storage.pending = testEvents(450);
    const batches: number[] = [];
    const transport: SyncTransport = {
      async push(events) {
        batches.push(events.length);
        return { statuses: events.map((e) => ({ eventId: e.eventId, status: "ok" as const })) };
      },
      async pull() { return { ...emptyPull, nextCursor: 7 }; },
    };

    const report = await new SyncEngine(storage, transport).runOnce();

    expect(batches).toEqual([200, 200, 50]);
    expect(batches.every((b) => b <= MAX_PUSH_BATCH)).toBe(true);
    expect(report.pushed).toBe(450);
    expect(storage.pending.length).toBe(0);
    expect(storage.cursor).toBe(7);
  });

  it("duplicates count as acked (idempotent server)", async () => {
    const storage = new FakeStorage();
    storage.pending = testEvents(3);
    const transport: SyncTransport = {
      async push(events): Promise<PushResult> {
        return { statuses: events.map((e, i) => ({ eventId: e.eventId, status: i === 0 ? "duplicate" as const : "ok" as const })) };
      },
      async pull() { return emptyPull; },
    };
    const report = await new SyncEngine(storage, transport).runOnce();
    expect(report.pushed).toBe(3);
    expect(storage.pending.length).toBe(0);
  });

  it("invalid events are parked and surfaced, not silently dropped, not blocking", async () => {
    const storage = new FakeStorage();
    storage.pending = testEvents(3);
    const badId = storage.pending[1]!.eventId;
    const transport: SyncTransport = {
      async push(events): Promise<PushResult> {
        return {
          statuses: events.map((e) => ({
            eventId: e.eventId,
            status: e.eventId === badId ? ("invalid" as const) : ("ok" as const),
            error: e.eventId === badId ? "schema mismatch" : undefined,
          })),
        };
      },
      async pull() { return emptyPull; },
    };
    const report = await new SyncEngine(storage, transport).runOnce();
    expect(report.pushed).toBe(2);
    expect(report.rejected).toBe(1);
    expect(storage.rejected.get(badId)).toBe("schema mismatch");
    expect(storage.pending.length).toBe(0);
  });

  it("transient errors leave events pending and trigger backoff", async () => {
    const storage = new FakeStorage();
    storage.pending = testEvents(5);
    const transport: SyncTransport = {
      async push(): Promise<PushResult> { throw new Error("network down"); },
      async pull() { return emptyPull; },
    };
    const engine = new SyncEngine(storage, transport);
    const report = await engine.runOnce();

    expect(report.errors).toContain("network down");
    expect(report.pendingAfter).toBe(5);       // nothing lost
    expect(storage.pending.length).toBe(5);
    expect(engine.nextDelayMs()).toBeGreaterThan(0);

    await engine.runOnce();
    const d1 = backoffDelayMs(0, { baseMs: 2000, maxMs: 300_000, jitter: false });
    const d2 = backoffDelayMs(1, { baseMs: 2000, maxMs: 300_000, jitter: false });
    expect(d2).toBe(d1 * 2); // exponential
  });

  it("pull pages until hasMore=false and applies remote events", async () => {
    const storage = new FakeStorage();
    const remote = testEvents(7).map((e, i) => ({ ...e, serverSeq: i + 1 }));
    let calls = 0;
    const transport: SyncTransport = {
      async push() { return { statuses: [] }; },
      async pull(cursor, limit): Promise<PullResult> {
        calls++;
        const page = remote.filter((e) => e.serverSeq > cursor).slice(0, Math.min(limit, 3));
        const nextCursor = page.length > 0 ? page[page.length - 1]!.serverSeq : cursor;
        return { events: page, nextCursor, hasMore: nextCursor < 7 };
      },
    };
    const report = await new SyncEngine(storage, transport, { pullLimit: 3 }).runOnce();
    expect(report.pulled).toBe(7);
    expect(storage.cursor).toBe(7);
    expect(calls).toBe(3);
  });

  it("backoff is capped", () => {
    const policy = { baseMs: 2000, maxMs: 300_000, jitter: false };
    expect(backoffDelayMs(50, policy)).toBe(300_000);
  });
});

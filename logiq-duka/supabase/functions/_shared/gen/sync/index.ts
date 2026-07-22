// GENERATED from packages/shared/src — DO NOT EDIT. Run `pnpm sync:functions`.
/**
 * Sync engine core (PRD §11.2, §28) — platform-agnostic.
 * The mobile app supplies SQLite-backed SyncStorage and a fetch-backed
 * SyncTransport; tests supply in-memory fakes. Rules encoded here:
 *  - push in batches of ≤ 200
 *  - events are NEVER deleted until acked (ok or duplicate)
 *  - exponential backoff with jitter on failure
 *  - pull applies remote events through the SAME reducers via storage
 *  - honest sync health: pending count is always observable
 */
import type { EventEnvelope } from "../events/index.ts";

export const MAX_PUSH_BATCH = 200;

export type PushEventStatus = "ok" | "duplicate" | "invalid" | "error";

export interface PushResult {
  statuses: Array<{ eventId: string; status: PushEventStatus; error?: string }>;
}

export interface PullResult {
  events: Array<EventEnvelope & { serverSeq: number }>;
  nextCursor: number;
  hasMore: boolean;
}

export interface SyncTransport {
  push(events: EventEnvelope[]): Promise<PushResult>;
  pull(cursor: number, limit: number): Promise<PullResult>;
}

export interface SyncStorage {
  /** Oldest un-acked local events, in clientSeq order. */
  pendingEvents(limit: number): Promise<EventEnvelope[]>;
  /** Permanently mark events as acknowledged by the server. */
  markAcked(eventIds: string[]): Promise<void>;
  /** Park an event the server rejected as invalid (surfaced to UI; never silently dropped). */
  markRejected(eventId: string, error: string): Promise<void>;
  /** Apply remote events through the shared reducers, skipping own-device echoes. */
  applyRemote(events: Array<EventEnvelope & { serverSeq: number }>): Promise<void>;
  getCursor(): Promise<number>;
  setCursor(cursor: number): Promise<void>;
  pendingCount(): Promise<number>;
}

export interface SyncReport {
  pushed: number;
  rejected: number;
  pulled: number;
  pendingAfter: number;
  errors: string[];
}

export interface BackoffPolicy {
  baseMs: number;
  maxMs: number;
  jitter: boolean;
}

export const DEFAULT_BACKOFF: BackoffPolicy = { baseMs: 2_000, maxMs: 5 * 60_000, jitter: true };

export function backoffDelayMs(attempt: number, policy: BackoffPolicy = DEFAULT_BACKOFF, rand: () => number = Math.random): number {
  const exp = Math.min(policy.maxMs, policy.baseMs * 2 ** Math.min(attempt, 20));
  return policy.jitter ? Math.floor(exp / 2 + rand() * (exp / 2)) : exp;
}

export class SyncEngine {
  private consecutiveFailures = 0;

  constructor(
    private storage: SyncStorage,
    private transport: SyncTransport,
    private opts: { pullLimit?: number; backoff?: BackoffPolicy } = {},
  ) {}

  /** One full push+pull cycle. Never throws; failures land in the report. */
  async runOnce(): Promise<SyncReport> {
    const report: SyncReport = { pushed: 0, rejected: 0, pulled: 0, pendingAfter: 0, errors: [] };

    try {
      await this.pushAll(report);
      await this.pullAll(report);
      this.consecutiveFailures = 0;
    } catch (err) {
      this.consecutiveFailures += 1;
      report.errors.push(err instanceof Error ? err.message : String(err));
    }

    report.pendingAfter = await this.storage.pendingCount();
    return report;
  }

  /** Delay before the next attempt, honouring backoff after failures. */
  nextDelayMs(): number {
    if (this.consecutiveFailures === 0) return 0;
    return backoffDelayMs(this.consecutiveFailures - 1, this.opts.backoff);
  }

  private async pushAll(report: SyncReport): Promise<void> {
    for (;;) {
      const batch = await this.storage.pendingEvents(MAX_PUSH_BATCH);
      if (batch.length === 0) return;

      const result = await this.transport.push(batch);
      const acked: string[] = [];
      for (const s of result.statuses) {
        if (s.status === "ok" || s.status === "duplicate") {
          acked.push(s.eventId);
        } else if (s.status === "invalid") {
          // Server will never accept it — park + surface, don't block the queue.
          await this.storage.markRejected(s.eventId, s.error ?? "invalid");
          report.rejected += 1;
        } else {
          // transient error: leave pending, stop this cycle, retry with backoff
          if (acked.length > 0) await this.storage.markAcked(acked);
          report.pushed += acked.length;
          throw new Error(s.error ?? `push failed for ${s.eventId}`);
        }
      }
      await this.storage.markAcked(acked);
      report.pushed += acked.length;
      if (batch.length < MAX_PUSH_BATCH) return;
    }
  }

  private async pullAll(report: SyncReport): Promise<void> {
    const limit = this.opts.pullLimit ?? 500;
    for (;;) {
      const cursor = await this.storage.getCursor();
      const res = await this.transport.pull(cursor, limit);
      if (res.events.length > 0) {
        await this.storage.applyRemote(res.events);
        report.pulled += res.events.length;
      }
      await this.storage.setCursor(res.nextCursor);
      if (!res.hasMore) return;
    }
  }
}

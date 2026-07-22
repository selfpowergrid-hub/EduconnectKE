/**
 * Sync wiring: shared SyncEngine + SQLite storage + fetch transport
 * against the sync-push / sync-pull Edge Functions. Background loop
 * with the shared backoff policy; sync health observable via zustand.
 */
import {
  SyncEngine,
  type EventEnvelope, type PullResult, type PushResult, type SyncReport, type SyncTransport,
} from "@logiq/shared";
import Constants from "expo-constants";
import { create } from "zustand";
import { accessToken } from "../auth/supabase";
import { createSqliteSyncStorage } from "../db/sqliteStore";

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string>;
const FUNCTIONS_BASE = `${extra.supabaseUrl ?? "http://localhost:54321"}/functions/v1`;

function createTransport(): SyncTransport {
  return {
    async push(events: EventEnvelope[]): Promise<PushResult> {
      const token = await accessToken();
      const res = await fetch(`${FUNCTIONS_BASE}/sync-push`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ events }),
      });
      if (!res.ok) throw new Error(`sync-push ${res.status}`);
      return (await res.json()) as PushResult;
    },
    async pull(cursor: number, limit: number): Promise<PullResult> {
      const token = await accessToken();
      const res = await fetch(`${FUNCTIONS_BASE}/sync-pull?cursor=${cursor}&limit=${limit}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`sync-pull ${res.status}`);
      return (await res.json()) as PullResult;
    },
  };
}

interface SyncHealth {
  pending: number;        // "Mauzo 14 yanasubiri mtandao"
  lastSyncAt: string | null;
  lastError: string | null;
  syncing: boolean;
}

export const useSyncHealth = create<SyncHealth>(() => ({
  pending: 0,
  lastSyncAt: null,
  lastError: null,
  syncing: false,
}));

let loopHandle: ReturnType<typeof setTimeout> | null = null;

export function startSyncLoop(deviceId: string, intervalMs = 15_000): () => void {
  const storage = createSqliteSyncStorage(deviceId);
  const engine = new SyncEngine(storage, createTransport());

  const tick = async () => {
    useSyncHealth.setState({ syncing: true });
    const report: SyncReport = await engine.runOnce();
    useSyncHealth.setState({
      syncing: false,
      pending: report.pendingAfter,
      lastSyncAt: report.errors.length === 0 ? new Date().toISOString() : useSyncHealth.getState().lastSyncAt,
      lastError: report.errors[0] ?? null,
    });
    loopHandle = setTimeout(tick, Math.max(intervalMs, engine.nextDelayMs()));
  };

  void tick();
  return () => {
    if (loopHandle) clearTimeout(loopHandle);
    loopHandle = null;
  };
}

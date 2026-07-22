/**
 * SQLite effect executor + SyncStorage implementation.
 * Semantics MUST match packages/shared/src/store/memory.ts (the reference
 * store) and the server executor: idempotent inserts, LWW upserts,
 * stock_levels folded only from stock_movements.
 */
import {
  parseEvent, reduce,
  type Effect, type EventEnvelope, type SyncStorage,
} from "@logiq/shared";
import type { SQLiteDatabase } from "expo-sqlite";
import { openDb } from "./database";

/** Record a local mutation: domain rows + outbox event, one transaction (PRD §28.1). */
export async function recordEvent(envelope: EventEnvelope): Promise<void> {
  const db = await openDb();
  const effects = reduce(envelope);
  await db.withExclusiveTransactionAsync(async (tx) => {
    await applyEffectsTx(tx, effects);
    await tx.runAsync(
      "insert into outbox (event_id, client_seq, envelope, created_at) values (?, ?, ?, ?)",
      [envelope.eventId, envelope.clientSeq, JSON.stringify(envelope), new Date().toISOString()],
    );
  });
}

type Tx = Pick<SQLiteDatabase, "runAsync" | "getFirstAsync" | "getAllAsync">;

// The local mirror intentionally omits server-only columns (tenant_id,
// created_by, device_id, …): effect rows are filtered to the columns the
// SQLite table actually has.
const columnCache = new Map<string, Set<string>>();

async function tableColumns(tx: Tx, table: string): Promise<Set<string>> {
  let cols = columnCache.get(table);
  if (!cols) {
    const rows = await tx.getAllAsync<{ name: string }>(`pragma table_info(${ident(table)})`);
    cols = new Set(rows.map((r) => r.name));
    columnCache.set(table, cols);
  }
  return cols;
}

async function filterRow(tx: Tx, table: string, row: Record<string, unknown>): Promise<Record<string, unknown>> {
  const cols = await tableColumns(tx, table);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) if (cols.has(k)) out[k] = v;
  return out;
}

async function applyEffectsTx(tx: Tx, effects: Effect[]): Promise<void> {
  for (const ef of effects) {
    if (ef.kind === "insert") {
      const { cols, marks, vals } = rowSql(await filterRow(tx, ef.table, ef.row));
      const res = await tx.runAsync(
        `insert or ignore into ${ident(ef.table)} (${cols}) values (${marks})`,
        vals,
      );
      if (ef.table === "stock_movements" && res.changes > 0) {
        await foldMovement(tx, ef.row);
      }
      continue;
    }
    if (ef.kind === "upsert") {
      if (ef.table === "product_kg_price") {
        await tx.runAsync("update products set kg_price_cents = ? where id = ?", [
          ef.row.kg_price_cents as number, String(ef.row.id),
        ]);
        continue;
      }
      if (ef.table === "tenant_settings_patches") continue; // server-authoritative
      const id = String(ef.row[ef.key[0] ?? "id"]);
      if (!(await lwwWins(tx, ef.table, id, ef.lww))) continue;
      const { cols, marks, vals, sets } = rowSql(await filterRow(tx, ef.table, ef.row));
      await tx.runAsync(
        `insert into ${ident(ef.table)} (${cols}) values (${marks})
         on conflict (id) do update set ${sets}`,
        vals,
      );
      continue;
    }
    // update
    const filteredSet = await filterRow(tx, ef.table, ef.set);
    const setCols = Object.keys(filteredSet);
    if (setCols.length === 0) continue;
    const whereCols = Object.keys(ef.where);
    await tx.runAsync(
      `update ${ident(ef.table)} set ${setCols.map((c) => `${ident(c)} = ?`).join(", ")}
       where ${whereCols.map((c) => `${ident(c)} = ?`).join(" and ")}`,
      [...setCols.map((c) => sqlValue(filteredSet[c])), ...whereCols.map((c) => sqlValue(ef.where[c]))],
    );
  }
}

async function foldMovement(tx: Tx, row: Record<string, unknown>): Promise<void> {
  const delta = Number(row.qty_delta);
  const cost = row.unit_cost_cents == null ? 0 : Number(row.unit_cost_cents);
  await tx.runAsync(
    `insert into stock_levels (product_id, qty, valuation_cents) values (?, ?, ?)
     on conflict (product_id) do update set
       qty = stock_levels.qty + excluded.qty,
       valuation_cents = stock_levels.valuation_cents + excluded.valuation_cents`,
    [String(row.product_id), delta, Math.round(cost * delta)],
  );
}

async function lwwWins(tx: Tx, table: string, rowId: string, lww: { ts: string; tiebreak: string }): Promise<boolean> {
  const prev = await tx.getFirstAsync<{ lww_ts: string; lww_tiebreak: string }>(
    "select lww_ts, lww_tiebreak from lww_meta where table_name = ? and row_id = ?",
    [table, rowId],
  );
  if (prev && !(lww.ts > prev.lww_ts || (lww.ts === prev.lww_ts && lww.tiebreak > prev.lww_tiebreak))) {
    return false;
  }
  await tx.runAsync(
    `insert into lww_meta (table_name, row_id, lww_ts, lww_tiebreak) values (?, ?, ?, ?)
     on conflict (table_name, row_id) do update set lww_ts = excluded.lww_ts, lww_tiebreak = excluded.lww_tiebreak`,
    [table, rowId, lww.ts, lww.tiebreak],
  );
  return true;
}

// ---- SyncStorage -------------------------------------------------

export function createSqliteSyncStorage(ownDeviceId: string): SyncStorage {
  return {
    async pendingEvents(limit) {
      const db = await openDb();
      const rows = await db.getAllAsync<{ envelope: string }>(
        "select envelope from outbox where rejected_error is null order by client_seq asc limit ?",
        [limit],
      );
      return rows.map((r) => JSON.parse(r.envelope) as EventEnvelope);
    },
    async markAcked(eventIds) {
      if (eventIds.length === 0) return;
      const db = await openDb();
      const marks = eventIds.map(() => "?").join(",");
      await db.runAsync(`delete from outbox where event_id in (${marks})`, eventIds);
    },
    async markRejected(eventId, error) {
      const db = await openDb();
      await db.runAsync("update outbox set rejected_error = ? where event_id = ?", [error, eventId]);
    },
    async applyRemote(events) {
      const db = await openDb();
      await db.withExclusiveTransactionAsync(async (tx) => {
        for (const raw of events) {
          if (raw.deviceId === ownDeviceId) continue; // own echo: already applied locally
          const event = parseEvent(raw);
          await applyEffectsTx(tx, reduce(event));
        }
      });
    },
    async getCursor() {
      const db = await openDb();
      const row = await db.getFirstAsync<{ value: string }>("select value from meta where key = 'sync_cursor'");
      return row ? Number(row.value) : 0;
    },
    async setCursor(cursor) {
      const db = await openDb();
      await db.runAsync(
        "insert into meta (key, value) values ('sync_cursor', ?) on conflict (key) do update set value = excluded.value",
        [String(cursor)],
      );
    },
    async pendingCount() {
      const db = await openDb();
      const row = await db.getFirstAsync<{ n: number }>(
        "select count(*) as n from outbox where rejected_error is null",
      );
      return row?.n ?? 0;
    },
  };
}

// ---- small SQL helpers -------------------------------------------

function ident(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`bad identifier: ${name}`);
  return name;
}

function sqlValue(v: unknown): string | number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "number" || typeof v === "string") return v;
  return JSON.stringify(v);
}

function rowSql(row: Record<string, unknown>) {
  const keys = Object.keys(row);
  return {
    cols: keys.map(ident).join(", "),
    marks: keys.map(() => "?").join(", "),
    vals: keys.map((k) => sqlValue(row[k])),
    sets: keys.filter((k) => k !== "id").map((k) => `${ident(k)} = excluded.${ident(k)}`).join(", "),
  };
}

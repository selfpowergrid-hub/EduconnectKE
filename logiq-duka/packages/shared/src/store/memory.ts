/**
 * In-memory effect store — the reference implementation every platform
 * store (SQLite DAO, Postgres ingester) must behave like. Used by the
 * property-based convergence tests (PRD §28 definition of done).
 *
 * Semantics:
 *  - insert: idempotent by primary key `id` (replays are no-ops)
 *  - upsert: last-writer-wins by (ts, tiebreak); losers are dropped
 *  - update: merge into existing row if present (row may arrive later
 *    out of order; pending updates are buffered and re-applied)
 *  - stock_movements inserts additionally fold into stockLevels —
 *    the ONLY path that changes stock, mirroring the Postgres trigger.
 */
import type { Effect, Row } from "../reducers/effects.js";

type LwwMeta = { ts: string; tiebreak: string };

export class MemoryStore {
  tables = new Map<string, Map<string, Row>>();
  private lww = new Map<string, LwwMeta>(); // `${table}:${id}`
  private pendingUpdates: Array<{ table: string; where: Row; set: Row }> = [];
  stockLevels = new Map<string, number>(); // productId(::branchId) → qty
  stockValuation = new Map<string, number>();

  apply(effects: Effect[]): void {
    for (const ef of effects) this.applyOne(ef);
    this.flushPendingUpdates();
  }

  private applyOne(ef: Effect): void {
    const table = this.table(ef.table);
    if (ef.kind === "insert") {
      const id = String(ef.row.id);
      if (table.has(id)) return; // idempotent replay
      table.set(id, { ...ef.row });
      if (ef.table === "stock_movements") this.foldMovement(ef.row);
      return;
    }
    if (ef.kind === "upsert") {
      const id = String(ef.row[ef.key[0] ?? "id"]);
      const metaKey = `${ef.table}:${id}`;
      const prev = this.lww.get(metaKey);
      if (prev && !wins(ef.lww, prev)) return; // older writer loses
      const existing = table.get(id) ?? {};
      table.set(id, { ...existing, ...ef.row });
      this.lww.set(metaKey, ef.lww);
      return;
    }
    // update
    if (!this.tryUpdate(ef.table, ef.where, ef.set)) {
      this.pendingUpdates.push({ table: ef.table, where: ef.where, set: ef.set });
    }
  }

  private tryUpdate(tableName: string, where: Row, set: Row): boolean {
    const table = this.table(tableName);
    const id = where.id !== undefined ? String(where.id) : null;
    if (id !== null) {
      const row = table.get(id);
      if (!row) return false;
      table.set(id, { ...row, ...set });
      return true;
    }
    let matched = false;
    for (const [k, row] of table) {
      if (Object.entries(where).every(([c, v]) => row[c] === v)) {
        table.set(k, { ...row, ...set });
        matched = true;
      }
    }
    return matched;
  }

  private flushPendingUpdates(): void {
    if (this.pendingUpdates.length === 0) return;
    const still: typeof this.pendingUpdates = [];
    for (const u of this.pendingUpdates) {
      if (!this.tryUpdate(u.table, u.where, u.set)) still.push(u);
    }
    this.pendingUpdates = still;
  }

  private foldMovement(row: Row): void {
    const key = String(row.product_id) + (row.branch_id ? `::${String(row.branch_id)}` : "");
    const delta = Number(row.qty_delta);
    this.stockLevels.set(key, round3((this.stockLevels.get(key) ?? 0) + delta));
    const cost = row.unit_cost_cents == null ? 0 : Number(row.unit_cost_cents);
    this.stockValuation.set(key, (this.stockValuation.get(key) ?? 0) + Math.round(cost * delta));
  }

  /** Deni balance = Σ charges − Σ payments ± adjustments. */
  customerBalanceCents(customerId: string): number {
    let bal = 0;
    for (const row of this.table("customer_transactions").values()) {
      if (String(row.customer_id) !== customerId) continue;
      const amt = Number(row.amount_cents);
      if (row.type === "charge") bal += amt;
      else if (row.type === "payment") bal -= amt;
      else bal += amt; // adjustment: signed by caller convention
    }
    return bal;
  }

  /** Canonical serialisation for convergence comparison. */
  snapshot(): string {
    const tables: Record<string, Row[]> = {};
    for (const [name, rows] of [...this.tables.entries()].sort()) {
      tables[name] = [...rows.entries()]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([, r]) => sortKeys(r));
    }
    const stock = [...this.stockLevels.entries()].sort();
    const valuation = [...this.stockValuation.entries()].sort();
    return JSON.stringify({ tables, stock, valuation, pending: this.pendingUpdates.length });
  }

  private table(name: string): Map<string, Row> {
    let t = this.tables.get(name);
    if (!t) {
      t = new Map();
      this.tables.set(name, t);
    }
    return t;
  }
}

function wins(a: LwwMeta, b: LwwMeta): boolean {
  if (a.ts !== b.ts) return a.ts > b.ts;
  return a.tiebreak > b.tiebreak;
}

function sortKeys(r: Row): Row {
  const out: Row = {};
  for (const k of Object.keys(r).sort()) out[k] = r[k];
  return out;
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

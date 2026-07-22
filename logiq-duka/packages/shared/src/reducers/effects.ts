/**
 * Reducers are pure: event → Effect[]. Effects are declarative row
 * operations executed by a platform store (SQLite DAO on mobile,
 * Postgres via Edge Function on server, in-memory store in tests).
 * Stock levels are NEVER an effect target — every store derives them
 * by folding `stock_movements` inserts (PRD §11.2).
 */

export type Row = Record<string, unknown>;

export type Effect =
  | { kind: "insert"; table: string; row: Row }
  | {
      kind: "upsert";
      table: string;
      row: Row;
      /** column(s) identifying the row, usually ["id"] */
      key: string[];
      /** last-writer-wins ordering: (ts, tiebreak) — older writes lose */
      lww: { ts: string; tiebreak: string };
    }
  | { kind: "update"; table: string; where: Row; set: Row };

export function insert(table: string, row: Row): Effect {
  return { kind: "insert", table, row };
}

export function upsert(table: string, row: Row, lww: { ts: string; tiebreak: string }, key: string[] = ["id"]): Effect {
  return { kind: "upsert", table, row, key, lww };
}

export function update(table: string, where: Row, set: Row): Effect {
  return { kind: "update", table, where, set };
}

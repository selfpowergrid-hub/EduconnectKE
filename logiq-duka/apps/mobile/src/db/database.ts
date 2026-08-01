import * as SQLite from "expo-sqlite";
import { DDL, SCHEMA_VERSION } from "./schema";

let db: SQLite.SQLiteDatabase | null = null;

export async function openDb(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  db = await SQLite.openDatabaseAsync("logiq-duka.db");
  await db.execAsync("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  await migrate(db);
  return db;
}

async function migrate(d: SQLite.SQLiteDatabase): Promise<void> {
  await d.withExclusiveTransactionAsync(async (tx) => {
    for (const stmt of DDL) await tx.execAsync(stmt);
    await tx.runAsync(
      "insert into meta (key, value) values ('schema_version', ?) on conflict (key) do update set value = excluded.value",
      [String(SCHEMA_VERSION)],
    );
  });
}

export async function getMeta(key: string): Promise<string | null> {
  const d = await openDb();
  const row = await d.getFirstAsync<{ value: string }>("select value from meta where key = ?", [key]);
  return row?.value ?? null;
}

export async function setMeta(key: string, value: string): Promise<void> {
  const d = await openDb();
  await d.runAsync(
    "insert into meta (key, value) values (?, ?) on conflict (key) do update set value = excluded.value",
    [key, value],
  );
}

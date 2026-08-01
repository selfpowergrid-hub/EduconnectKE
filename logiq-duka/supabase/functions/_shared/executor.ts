// Applies reducer Effects to Postgres with the same semantics as the
// client stores: idempotent inserts, LWW upserts (via lww_meta), and
// buffered-tolerant updates. Stock levels are maintained by the DB
// trigger on stock_movements — never written here.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Effect } from "./gen/reducers/effects.ts";

export async function applyEffects(
  db: SupabaseClient,
  tenantId: string,
  effects: Effect[],
): Promise<void> {
  for (const ef of effects) {
    if (ef.kind === "insert") {
      const { error } = await db
        .from(ef.table)
        .upsert(ef.row, { onConflict: "id", ignoreDuplicates: true });
      if (error) throw new Error(`insert ${ef.table}: ${error.message}`);
      continue;
    }

    if (ef.kind === "upsert") {
      // Virtual tables from reducers map to targeted server-side ops.
      if (ef.table === "product_kg_price") {
        const { error } = await db.schema("app").rpc("set_product_kg_price", {
          p_product: ef.row.id,
          p_cents: ef.row.kg_price_cents,
        });
        if (error) throw new Error(`kg_price: ${error.message}`);
        continue;
      }
      if (ef.table === "tenant_settings_patches") {
        const { error } = await db.schema("app").rpc("merge_tenant_settings", {
          p_tenant: tenantId,
          p_patch: ef.row.patch,
        });
        if (error) throw new Error(`settings: ${error.message}`);
        continue;
      }

      const rowId = String(ef.row[ef.key[0] ?? "id"]);
      if (!(await lwwWins(db, ef.table, rowId, tenantId, ef.lww))) continue;
      const { error } = await db.from(ef.table).upsert(ef.row, { onConflict: "id" });
      if (error) throw new Error(`upsert ${ef.table}: ${error.message}`);
      continue;
    }

    // update: tolerate the target row not having arrived yet (out-of-order
    // delivery). The row's own insert event will carry current state.
    const { error } = await db.from(ef.table).update(ef.set).match(ef.where);
    if (error) throw new Error(`update ${ef.table}: ${error.message}`);
  }
}

async function lwwWins(
  db: SupabaseClient,
  table: string,
  rowId: string,
  tenantId: string,
  lww: { ts: string; tiebreak: string },
): Promise<boolean> {
  const { data, error } = await db
    .from("lww_meta")
    .select("lww_ts, lww_tiebreak")
    .eq("table_name", table)
    .eq("row_id", rowId)
    .maybeSingle();
  if (error) throw new Error(`lww read: ${error.message}`);
  if (data) {
    const prevTs = new Date(data.lww_ts).toISOString();
    const newTs = new Date(lww.ts).toISOString();
    const wins = newTs > prevTs || (newTs === prevTs && lww.tiebreak > data.lww_tiebreak);
    if (!wins) return false;
  }
  const { error: upErr } = await db.from("lww_meta").upsert({
    table_name: table,
    row_id: rowId,
    tenant_id: tenantId,
    lww_ts: lww.ts,
    lww_tiebreak: lww.tiebreak,
  }, { onConflict: "table_name,row_id" });
  if (upErr) throw new Error(`lww write: ${upErr.message}`);
  return true;
}

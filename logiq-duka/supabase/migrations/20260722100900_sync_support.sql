-- ============================================================
-- LogiQ Duka · 900 Sync support: LWW metadata + settings merge
-- Server-side bookkeeping for the shared reducers' upsert-LWW
-- semantics (service-role only; clients never touch these).
-- ============================================================

create table public.lww_meta (
  table_name text not null,
  row_id uuid not null,
  tenant_id uuid not null,
  lww_ts timestamptz not null,
  lww_tiebreak text not null,
  primary key (table_name, row_id)
);
alter table public.lww_meta enable row level security;
-- no policies: service role only

-- jsonb merge for settings.changed events
create or replace function app.merge_tenant_settings(p_tenant uuid, p_patch jsonb) returns void
language sql security definer set search_path = public, app
as $$
  update public.tenants
     set settings = settings || p_patch,
         updated_at = now()
   where id = p_tenant;
$$;

-- price_board.set mirror onto the product row
create or replace function app.set_product_kg_price(p_product uuid, p_cents bigint) returns void
language sql security definer set search_path = public, app
as $$
  update public.products
     set kg_price_cents = p_cents,
         updated_at = now()
   where id = p_product;
$$;

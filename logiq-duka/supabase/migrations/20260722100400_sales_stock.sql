-- ============================================================
-- LogiQ Duka · 400 Sales & Stock: sales, sale_lines, payments,
-- stock_movements (single source of truth), stock_levels
-- (materialised), receipt counters, butchery & agrovet tables
-- ============================================================

-- ---- per-tenant receipt numbering --------------------------
-- Device prints a per-device provisional no offline (D3-000481);
-- tenant-global receipt_no is assigned server-side on ingest.
create table public.receipt_counters (
  tenant_id uuid primary key references public.tenants (id),
  next_no bigint not null default 1
);

create or replace function app.next_receipt_no(p_tenant uuid) returns bigint
language plpgsql
as $$
declare v bigint;
begin
  insert into public.receipt_counters (tenant_id) values (p_tenant)
    on conflict (tenant_id) do nothing;
  update public.receipt_counters
     set next_no = next_no + 1
   where tenant_id = p_tenant
   returning next_no - 1 into v;
  return v;
end;
$$;

-- ---- sales -------------------------------------------------
create table public.sales (
  id uuid primary key,                       -- client-generated UUIDv7
  tenant_id uuid not null references public.tenants (id),
  branch_id uuid references public.branches (id),
  receipt_no bigint,                         -- tenant-global, server-assigned
  device_receipt_ref text,                   -- e.g. D3-000481, offline provisional
  status app.sale_status not null default 'completed',
  sold_by uuid,                              -- public.users.id (attendant attribution)
  customer_id uuid references public.customers (id),
  subtotal_cents bigint not null default 0,
  discount_cents bigint not null default 0,
  vat_cents bigint not null default 0,
  total_cents bigint not null default 0,
  parked_label text,
  sold_at timestamptz not null default now(),-- client business timestamp
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  device_id uuid,
  deleted_at timestamptz
);
create index on public.sales (tenant_id, sold_at desc);
create index on public.sales (tenant_id, status);
create unique index sales_receipt_no on public.sales (tenant_id, receipt_no)
  where receipt_no is not null;
create trigger touch before update on public.sales
  for each row execute function app.touch_updated_at();

alter table public.customer_transactions
  add constraint cust_txn_sale_fk foreign key (sale_id) references public.sales (id);

create table public.sale_lines (
  id uuid primary key,
  tenant_id uuid not null references public.tenants (id),
  sale_id uuid not null references public.sales (id),
  product_id uuid not null references public.products (id),
  batch_id uuid references public.batches (id),
  qty numeric(14,3) not null,
  unit app.unit_t not null default 'pc',
  weight_kg numeric(14,3),                   -- weight-mode entry
  unit_price_cents bigint not null,
  line_total_cents bigint not null,
  vat_class app.vat_class not null default 'exempt',
  vat_cents bigint not null default 0,
  is_deni_priced boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.sale_lines (sale_id);
create index on public.sale_lines (tenant_id, product_id);

create table public.payments (
  id uuid primary key,
  tenant_id uuid not null references public.tenants (id),
  sale_id uuid references public.sales (id),
  customer_id uuid references public.customers (id), -- deni repayments
  tender app.tender_t not null,
  amount_cents bigint not null,
  mpesa_ref text,
  mpesa_phone text,
  matched boolean not null default true,     -- false while in unmatched inbox
  matched_by uuid,
  created_at timestamptz not null default now(),
  created_by uuid,
  device_id uuid
);
create index on public.payments (tenant_id, created_at desc);
create index on public.payments (sale_id);
create index on public.payments (tenant_id, matched) where matched = false;

-- ---- stock movements: SINGLE SOURCE OF TRUTH ---------------
-- Stock quantity is never set directly; it is only ever derived
-- as sum of movements (PRD §11.2, §26).
create table public.stock_movements (
  id uuid primary key,
  tenant_id uuid not null references public.tenants (id),
  branch_id uuid references public.branches (id),
  product_id uuid not null references public.products (id),
  batch_id uuid references public.batches (id),
  type app.movement_t not null,
  qty_delta numeric(14,3) not null,          -- signed, base units
  unit_cost_cents bigint,
  reason_code text,                          -- breakage|expiry|theft|gift|correction|...
  ref_table text,
  ref_id uuid,
  created_at timestamptz not null default now(),
  created_by uuid,
  device_id uuid
);
create index on public.stock_movements (tenant_id, product_id, created_at);
create index on public.stock_movements (tenant_id, type);

-- ---- materialised stock levels -----------------------------
-- Maintained ONLY by trigger below; clients read, never write.
create table public.stock_levels (
  tenant_id uuid not null references public.tenants (id),
  branch_id uuid,                            -- null = main/default branch
  product_id uuid not null references public.products (id),
  qty numeric(14,3) not null default 0,
  valuation_cents bigint not null default 0, -- at weighted average cost
  updated_at timestamptz not null default now(),
  primary key (tenant_id, product_id, branch_id)
);

-- NULL-safe PK: use a sentinel for branchless tenants.
-- Postgres PKs disallow null; coalesce branch to the zero-uuid.
alter table public.stock_levels
  alter column branch_id set default '00000000-0000-0000-0000-000000000000',
  alter column branch_id set not null;

create or replace function app.apply_stock_movement() returns trigger
language plpgsql
as $$
declare
  v_branch uuid := coalesce(new.branch_id, '00000000-0000-0000-0000-000000000000');
begin
  insert into public.stock_levels as sl (tenant_id, branch_id, product_id, qty, valuation_cents, updated_at)
  values (
    new.tenant_id, v_branch, new.product_id,
    new.qty_delta,
    coalesce(new.unit_cost_cents, 0)::bigint * new.qty_delta,
    now()
  )
  on conflict (tenant_id, product_id, branch_id) do update
    set qty = sl.qty + excluded.qty,
        valuation_cents = sl.valuation_cents + excluded.valuation_cents,
        updated_at = now();
  return new;
end;
$$;

create trigger stock_movement_applied
  after insert on public.stock_movements
  for each row execute function app.apply_stock_movement();

-- Movements are immutable: forbid update/delete.
create or replace function app.forbid_change() returns trigger
language plpgsql
as $$
begin
  raise exception '% rows are immutable', tg_table_name;
end;
$$;

create trigger stock_movements_immutable
  before update or delete on public.stock_movements
  for each row execute function app.forbid_change();

-- ---- butchery: carcass intake & yield (PRD §8.2) -----------
create table public.carcass_intakes (
  id uuid primary key,
  tenant_id uuid not null references public.tenants (id),
  branch_id uuid references public.branches (id),
  supplier_id uuid references public.suppliers (id),
  animal text not null,                      -- beef|goat|mutton|pork|...
  hanging_weight_kg numeric(14,3) not null,
  cost_per_kg_cents bigint not null,
  intake_date date not null default current_date,
  created_at timestamptz not null default now(),
  created_by uuid,
  device_id uuid
);
create index on public.carcass_intakes (tenant_id, intake_date);

-- kg sold (weight-mode sale lines) vs kg received, per day
create or replace view public.carcass_yield as
select
  ci.tenant_id,
  ci.intake_date,
  sum(ci.hanging_weight_kg) as kg_in,
  coalesce((
    select sum(sl.weight_kg)
    from public.sale_lines sl
    join public.sales s on s.id = sl.sale_id and s.status = 'completed'
    where sl.tenant_id = ci.tenant_id
      and sl.weight_kg is not null
      and s.sold_at::date = ci.intake_date
  ), 0) as kg_sold
from public.carcass_intakes ci
group by ci.tenant_id, ci.intake_date;

-- ---- agrovet: regulated products sale register (PRD §8.3) --
create table public.regulated_sales (
  id uuid primary key,
  tenant_id uuid not null references public.tenants (id),
  sale_line_id uuid not null references public.sale_lines (id),
  product_id uuid not null references public.products (id),
  buyer_name text not null,
  buyer_phone text,
  buyer_id_no text,
  created_at timestamptz not null default now()
);
create index on public.regulated_sales (tenant_id, created_at);

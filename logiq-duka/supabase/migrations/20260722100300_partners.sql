-- ============================================================
-- LogiQ Duka · 300 Partners: customers (deni), suppliers,
-- purchase orders, GRNs
-- ============================================================

-- ---- deni customers (PRD §7.3) -----------------------------
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  name text not null,
  phone text,
  id_number text,
  photo_path text,
  credit_limit_cents bigint,
  notes text,
  opt_out_reminders boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  device_id uuid,
  deleted_at timestamptz
);
create index on public.customers (tenant_id);
create trigger touch before update on public.customers
  for each row execute function app.touch_updated_at();

create table public.customer_transactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  customer_id uuid not null references public.customers (id),
  type app.cust_txn_t not null,
  amount_cents bigint not null,          -- positive; sign implied by type
  sale_id uuid,                          -- fk added in 400_sales_stock
  payment_method app.tender_t,
  mpesa_ref text,
  balance_after_cents bigint,            -- denormalised running balance
  due_date date,                         -- agrovet: harvest-linked
  note text,
  created_at timestamptz not null default now(),
  created_by uuid,
  device_id uuid
);
create index on public.customer_transactions (tenant_id, customer_id, created_at);

-- ---- suppliers / PO / GRN (PRD §8.4, Biashara+) ------------
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  name text not null,
  phone text,
  kra_pin text,
  balance_cents bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on public.suppliers (tenant_id);
create trigger touch before update on public.suppliers
  for each row execute function app.touch_updated_at();

alter table public.batches
  add constraint batches_supplier_fk
  foreign key (supplier_id) references public.suppliers (id);

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  supplier_id uuid not null references public.suppliers (id),
  status app.po_status not null default 'draft',
  expected_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  deleted_at timestamptz
);
create index on public.purchase_orders (tenant_id, status);
create trigger touch before update on public.purchase_orders
  for each row execute function app.touch_updated_at();

create table public.po_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  po_id uuid not null references public.purchase_orders (id),
  product_id uuid not null references public.products (id),
  qty numeric(14,3) not null,
  unit_cost_cents bigint not null,
  created_at timestamptz not null default now()
);
create index on public.po_lines (po_id);

create table public.grns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  po_id uuid references public.purchase_orders (id),
  supplier_id uuid not null references public.suppliers (id),
  ref text,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  created_by uuid,
  device_id uuid
);
create index on public.grns (tenant_id, supplier_id);

create table public.grn_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  grn_id uuid not null references public.grns (id),
  product_id uuid not null references public.products (id),
  qty numeric(14,3) not null,
  unit_cost_cents bigint not null,
  batch_no text,
  expiry_date date,
  created_at timestamptz not null default now()
);
create index on public.grn_lines (grn_id);

alter table public.batches
  add constraint batches_grn_line_fk
  foreign key (grn_line_id) references public.grn_lines (id);

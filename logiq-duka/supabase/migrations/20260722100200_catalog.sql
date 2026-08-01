-- ============================================================
-- LogiQ Duka · 200 Catalog: products, barcodes, batches,
-- price_board_entries
-- ============================================================

create table public.products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  name text not null,
  name_sw text,
  category_id uuid references public.categories (id),
  unit app.unit_t not null default 'pc',
  base_unit app.unit_t not null default 'pc',
  sell_price_cents bigint not null default 0,
  buy_price_cents_avg bigint not null default 0,   -- weighted average cost
  wholesale_price_cents bigint,
  min_price_cents bigint,                          -- attendant price-override floor
  vat_class app.vat_class not null default 'exempt',
  reorder_level numeric(14,3),
  reorder_qty numeric(14,3),
  track_batches boolean not null default false,
  is_weight_item boolean not null default false,
  kg_price_cents bigint,                           -- weight-mode price (butchery)
  parent_product_id uuid references public.products (id),  -- repack parent
  conversion_factor numeric(14,6),                 -- base units of parent per 1 of this
  image_path text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  device_id uuid,
  deleted_at timestamptz
);
create index on public.products (tenant_id, active);
create index on public.products (tenant_id, category_id);
create trigger touch before update on public.products
  for each row execute function app.touch_updated_at();

create table public.barcodes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  product_id uuid not null references public.products (id),
  code text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, code)
);
create index on public.barcodes (product_id);

create table public.batches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  product_id uuid not null references public.products (id),
  batch_no text not null,
  expiry_date date,
  qty_in numeric(14,3) not null default 0,
  supplier_id uuid,                -- fk added in 300_partners
  grn_line_id uuid,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on public.batches (tenant_id, product_id);
create index on public.batches (tenant_id, expiry_date);

-- Butchery KES/kg price board with history (PRD §8.2)
create table public.price_board_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  product_id uuid not null references public.products (id),
  kg_price_cents bigint not null,
  effective_from timestamptz not null default now(),
  set_by uuid,
  device_id uuid,
  created_at timestamptz not null default now()
);
create index on public.price_board_entries (tenant_id, product_id, effective_from desc);

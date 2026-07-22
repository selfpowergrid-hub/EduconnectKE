-- ============================================================
-- LogiQ Duka · 500 Money & Fiscal: expenses, cash_movements,
-- shifts, day_closes, fiscal_documents
-- ============================================================

create table public.expenses (
  id uuid primary key,
  tenant_id uuid not null references public.tenants (id),
  branch_id uuid references public.branches (id),
  category app.expense_category not null default 'misc',
  amount_cents bigint not null,
  note text,
  photo_path text,
  incurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  created_by uuid,
  device_id uuid,
  deleted_at timestamptz
);
create index on public.expenses (tenant_id, incurred_at desc);

create table public.shifts (
  id uuid primary key,
  tenant_id uuid not null references public.tenants (id),
  branch_id uuid references public.branches (id),
  opened_by uuid,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  expected_cash_cents bigint,
  counted_cash_cents bigint,
  variance_cents bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  device_id uuid
);
create index on public.shifts (tenant_id, opened_at desc);
create trigger touch before update on public.shifts
  for each row execute function app.touch_updated_at();

create table public.cash_movements (
  id uuid primary key,
  tenant_id uuid not null references public.tenants (id),
  branch_id uuid references public.branches (id),
  shift_id uuid references public.shifts (id),
  type app.cash_movement_t not null,
  amount_cents bigint not null,
  reason text,
  created_at timestamptz not null default now(),
  created_by uuid,
  device_id uuid
);
create index on public.cash_movements (tenant_id, created_at desc);

-- Funga Siku (PRD §7.4)
create table public.day_closes (
  id uuid primary key,
  tenant_id uuid not null references public.tenants (id),
  branch_id uuid references public.branches (id),
  business_date date not null,
  totals jsonb not null default '{}'::jsonb,  -- gross, by-tender, deni issued/collected, expenses, gp estimate
  variance_cents bigint,
  closed_by uuid,
  whatsapp_sent boolean not null default false,
  created_at timestamptz not null default now(),
  device_id uuid,
  unique (tenant_id, branch_id, business_date)
);

-- eTIMS fiscalisation queue (PRD §9, §29.2)
create table public.fiscal_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  sale_id uuid not null references public.sales (id),
  direction app.fiscal_direction not null default 'invoice',
  status app.fiscal_status not null default 'queued',
  original_fiscal_id uuid references public.fiscal_documents (id), -- credit notes
  kra_invoice_no text,
  kra_qr_payload text,
  signed_at timestamptz,
  payload jsonb,
  error text,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.fiscal_documents (tenant_id, status);
create index on public.fiscal_documents (sale_id);
create trigger touch before update on public.fiscal_documents
  for each row execute function app.touch_updated_at();

-- ============================================================
-- LogiQ Duka · 100 Tenancy: plan_limits, tenants, branches,
-- devices, users, categories, audit_log
-- ============================================================

-- ---- plan limits (reference data, PRD §13.1) ---------------
create table public.plan_limits (
  plan app.plan_tier primary key,
  max_devices_per_branch int not null,
  max_users int not null,
  max_products int,               -- null = unlimited
  max_branches int not null,
  extra_branch_cents bigint,      -- kampuni add-on
  extra_device_cents bigint,      -- biashara add-on
  monthly_price_cents bigint not null
);

insert into public.plan_limits values
  ('msingi',   1,  2,   300, 1, null,  null,  25000),
  ('biashara', 2,  4,  2000, 1, null,  10000, 50000),
  ('kampuni',  3, 10,  null, 3, 30000, null, 100000);

-- ---- tenants -----------------------------------------------
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  business_type app.business_type not null default 'duka',
  kra_pin text,
  vat_registered boolean not null default false,
  till_number text,
  paybill text,
  phone text not null,
  plan app.plan_tier not null default 'msingi',
  plan_status app.plan_status not null default 'trial',
  trial_ends_at timestamptz,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create trigger touch before update on public.tenants
  for each row execute function app.touch_updated_at();

-- ---- branches ----------------------------------------------
create table public.branches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  name text not null,
  is_main boolean not null default false,
  etims_bhf_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on public.branches (tenant_id);
create trigger touch before update on public.branches
  for each row execute function app.touch_updated_at();

-- ---- devices -----------------------------------------------
create table public.devices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  branch_id uuid references public.branches (id),
  name text not null,
  platform text not null default 'android',
  approved boolean not null default false,
  revoked_at timestamptz,
  last_sync_at timestamptz,
  push_token text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.devices (tenant_id);
create trigger touch before update on public.devices
  for each row execute function app.touch_updated_at();

-- ---- users (staff; PIN login on shared device) -------------
-- Distinct from auth.users: one Supabase auth account (owner's phone)
-- may front several staff PIN users on the shared till.
create table public.users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  phone text,
  full_name text not null,
  role app.user_role_t not null default 'attendant',
  pin_hash text,                  -- pbkdf2$<iters>$<salt_b64>$<hash_b64>
  active boolean not null default true,
  auth_user_id uuid,              -- auth.users.id when this staff member has own login
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on public.users (tenant_id);
create trigger touch before update on public.users
  for each row execute function app.touch_updated_at();

-- ---- categories (referenced by products.category_id) -------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  name text not null,
  name_sw text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, name)
);
create index on public.categories (tenant_id);

-- ---- audit log (immutable) ---------------------------------
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  user_id uuid,
  device_id uuid,
  action text not null,           -- price_change | void | adjustment | user_change | export | ...
  entity text not null,
  entity_id uuid,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
create index on public.audit_log (tenant_id, created_at);

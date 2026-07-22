-- ============================================================
-- LogiQ Duka · 700 Billing & messaging: subscriptions,
-- tenant_integrations, message_log, sms_wallets
-- ============================================================

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  plan app.plan_tier not null,
  period_start date not null,
  period_end date not null,
  amount_cents bigint not null,
  status text not null default 'pending',    -- pending|paid|failed|waived
  mpesa_ref text,
  stk_request_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.subscriptions (tenant_id, period_start desc);
create trigger touch before update on public.subscriptions
  for each row execute function app.touch_updated_at();

-- Per-tenant Daraja C2B creds — encrypted app-side before insert
-- (Supabase Vault / Edge Function encrypts; never plaintext).
create table public.tenant_integrations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  kind app.integration_kind not null,
  shortcode text,
  encrypted_credentials text,
  status text not null default 'pending',    -- pending|active|error
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, kind)
);
create trigger touch before update on public.tenant_integrations
  for each row execute function app.touch_updated_at();

create table public.message_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  channel app.message_channel not null,
  template text not null,
  to_phone text not null,
  cost_cents bigint not null default 0,
  status text not null default 'queued',     -- queued|sent|delivered|failed|opted_out
  ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.message_log (tenant_id, created_at desc);
create trigger touch before update on public.message_log
  for each row execute function app.touch_updated_at();

create table public.sms_wallets (
  tenant_id uuid primary key references public.tenants (id),
  balance_cents bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table public.sms_wallet_topups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  amount_cents bigint not null,
  mpesa_ref text,
  created_at timestamptz not null default now()
);
create index on public.sms_wallet_topups (tenant_id, created_at desc);

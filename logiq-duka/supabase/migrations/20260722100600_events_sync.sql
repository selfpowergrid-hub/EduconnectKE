-- ============================================================
-- LogiQ Duka · 600 Event log & sync (PRD §11.2, §28)
-- events: append-only, partitioned by month on server_ts.
-- event_registry: unpartitioned global idempotency guard
-- (partitioned unique constraints must include the partition
-- key, which would break event_id dedupe — see DECISIONS.md).
-- ============================================================

create table public.event_registry (
  event_id uuid primary key,
  tenant_id uuid not null,
  server_ts timestamptz not null default now()
);

create sequence app.events_server_seq;

create table public.events (
  id uuid not null default gen_random_uuid(),
  event_id uuid not null,                    -- client-generated UUIDv7
  tenant_id uuid not null,
  device_id uuid not null,
  user_id uuid,                              -- staff (public.users.id)
  type text not null,                        -- e.g. sale.completed
  aggregate text not null,                   -- e.g. sale
  aggregate_id uuid not null,
  payload jsonb not null,
  client_ts timestamptz not null,
  client_seq bigint not null,                -- per-device logical clock
  server_ts timestamptz not null default now(),
  server_seq bigint not null default nextval('app.events_server_seq'),
  applied boolean not null default false,
  apply_error text,
  primary key (id, server_ts)
) partition by range (server_ts);

create index events_tenant_seq on public.events (tenant_id, server_seq);
create index events_tenant_aggregate on public.events (tenant_id, aggregate, aggregate_id);
create index events_unapplied on public.events (tenant_id, server_seq) where applied = false;

-- ---- monthly partition management --------------------------
create or replace function app.ensure_events_partition(p_month date) returns void
language plpgsql
as $$
declare
  v_start date := date_trunc('month', p_month)::date;
  v_end   date := (date_trunc('month', p_month) + interval '1 month')::date;
  v_name  text := 'events_' || to_char(v_start, 'YYYY_MM');
begin
  if not exists (select 1 from pg_class where relname = v_name) then
    execute format(
      'create table public.%I partition of public.events for values from (%L) to (%L)',
      v_name, v_start, v_end
    );
  end if;
end;
$$;

-- Create partitions for the current and next 6 months.
-- OPERATIONAL NOTE: schedule monthly via pg_cron once available:
--   select cron.schedule('events-partitions', '0 0 25 * *',
--     $$select app.ensure_events_partition((now() + interval '2 month')::date)$$);
do $$
declare i int;
begin
  for i in 0..6 loop
    perform app.ensure_events_partition((now() + (i || ' month')::interval)::date);
  end loop;
end;
$$;

-- Events are immutable except the applied/apply_error bookkeeping.
create or replace function app.events_guard() returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'events rows are immutable';
  end if;
  if new.event_id  is distinct from old.event_id
     or new.type      is distinct from old.type
     or new.payload   is distinct from old.payload
     or new.tenant_id is distinct from old.tenant_id then
    raise exception 'events rows are immutable (only applied/apply_error may change)';
  end if;
  return new;
end;
$$;

create trigger events_immutable
  before update or delete on public.events
  for each row execute function app.events_guard();

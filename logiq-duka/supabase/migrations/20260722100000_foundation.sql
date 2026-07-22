-- ============================================================
-- LogiQ Duka · 000 Foundation: extensions, app schema, helpers
-- PRD §26 conventions. Apply first.
-- ============================================================

create extension if not exists pgcrypto;

create schema if not exists app;

-- ---- JWT claim helpers -------------------------------------
-- tenant_id / app_role are custom claims. They may be issued either as
-- top-level claims (custom access token hook) or inside app_metadata.
create or replace function app.jwt_claim(claim text) returns text
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> claim,
    nullif(current_setting('request.jwt.claims', true), '')::jsonb
      -> 'app_metadata' ->> claim
  );
$$;

create or replace function app.tenant_id() returns uuid
language sql stable
as $$
  select nullif(app.jwt_claim('tenant_id'), '')::uuid;
$$;

create or replace function app.user_role() returns text
language sql stable
as $$
  select coalesce(app.jwt_claim('app_role'), 'attendant');
$$;

create or replace function app.is_owner() returns boolean
language sql stable
as $$ select app.user_role() = 'owner'; $$;

create or replace function app.is_manager_up() returns boolean
language sql stable
as $$ select app.user_role() in ('owner', 'manager'); $$;

create or replace function app.is_staff() returns boolean
language sql stable
as $$ select app.user_role() in ('owner', 'manager', 'attendant'); $$;

-- ---- updated_at maintenance --------------------------------
create or replace function app.touch_updated_at() returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---- enums -------------------------------------------------
create type app.business_type as enum
  ('duka', 'butchery', 'agrovet', 'supa', 'wines', 'hardware', 'cereals');
create type app.plan_tier as enum ('msingi', 'biashara', 'kampuni');
create type app.plan_status as enum ('trial', 'active', 'grace', 'lapsed');
create type app.user_role_t as enum ('owner', 'manager', 'attendant', 'accountant');
create type app.vat_class as enum ('vat16', 'zero', 'exempt');
create type app.unit_t as enum
  ('pc', 'kg', 'g', 'l', 'ml', 'bale', 'packet', 'sack', 'tray', 'crate', 'bunch', 'm', 'ft');
create type app.sale_status as enum ('completed', 'voided', 'refunded', 'parked');
create type app.tender_t as enum ('cash', 'mpesa_stk', 'mpesa_manual', 'bank', 'card_ext', 'deni');
create type app.movement_t as enum
  ('sale', 'purchase', 'return', 'adjust', 'repack_in', 'repack_out',
   'transfer_in', 'transfer_out', 'expiry', 'stock_take');
create type app.cust_txn_t as enum ('charge', 'payment', 'adjustment');
create type app.po_status as enum ('draft', 'sent', 'partial', 'received', 'closed');
create type app.fiscal_direction as enum ('invoice', 'credit_note');
create type app.fiscal_status as enum ('queued', 'submitted', 'signed', 'failed', 'not_required');
create type app.cash_movement_t as enum
  ('opening_float', 'cash_in', 'cash_out', 'drop', 'closing_count');
create type app.expense_category as enum
  ('stock_purchase', 'rent', 'transport', 'wages', 'airtime', 'utilities', 'licence', 'misc');
create type app.message_channel as enum ('whatsapp', 'sms');
create type app.integration_kind as enum ('daraja_c2b');

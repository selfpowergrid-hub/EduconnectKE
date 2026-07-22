-- ============================================================
-- LogiQ Duka · 800 Row Level Security
-- LAW (PRD §11.3): RLS on every table, no exceptions.
-- Tenant isolation via JWT tenant_id claim; role checks via
-- app_role claim. Service role (Edge Functions) bypasses RLS.
-- ============================================================

-- app schema must be callable from RLS policies
grant usage on schema app to anon, authenticated, service_role;
grant usage, select on sequence app.events_server_seq to service_role;

-- Triggers run with invoker rights; the stock materialiser and
-- receipt counter must work regardless of caller's policies.
alter function app.apply_stock_movement() security definer set search_path = public, app;
alter function app.next_receipt_no(uuid) security definer set search_path = public, app;

-- ---- enable RLS on EVERY table -----------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'plan_limits','tenants','branches','devices','users','categories','audit_log',
    'products','barcodes','batches','price_board_entries',
    'customers','customer_transactions','suppliers','purchase_orders','po_lines',
    'grns','grn_lines',
    'receipt_counters','sales','sale_lines','payments','stock_movements','stock_levels',
    'carcass_intakes','regulated_sales',
    'expenses','shifts','cash_movements','day_closes','fiscal_documents',
    'event_registry','events',
    'subscriptions','tenant_integrations','message_log','sms_wallets','sms_wallet_topups'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end;
$$;

-- ---- standard tenant-isolation SELECT policies -------------
do $$
declare t text;
begin
  foreach t in array array[
    'branches','devices','users','categories',
    'products','barcodes','batches','price_board_entries',
    'customers','customer_transactions','suppliers','purchase_orders','po_lines',
    'grns','grn_lines',
    'sales','sale_lines','payments','stock_movements','stock_levels',
    'carcass_intakes','regulated_sales',
    'expenses','shifts','cash_movements','day_closes','fiscal_documents'
  ] loop
    execute format(
      'create policy tenant_select on public.%I for select to authenticated using (tenant_id = app.tenant_id())',
      t
    );
  end loop;
end;
$$;

-- ---- reference data ----------------------------------------
create policy read_all on public.plan_limits
  for select to authenticated using (true);
-- no write policies: plan_limits is service-role/migration managed

-- ---- tenants -----------------------------------------------
create policy tenant_self_select on public.tenants
  for select to authenticated using (id = app.tenant_id());
create policy tenant_owner_update on public.tenants
  for update to authenticated
  using (id = app.tenant_id() and app.is_owner())
  with check (id = app.tenant_id() and app.is_owner());
-- inserts (signup) happen via service role only

-- ---- devices: self-register; owner approves/revokes --------
create policy device_register on public.devices
  for insert to authenticated with check (tenant_id = app.tenant_id());
create policy device_owner_update on public.devices
  for update to authenticated
  using (tenant_id = app.tenant_id() and app.is_owner())
  with check (tenant_id = app.tenant_id() and app.is_owner());

-- ---- users: owner manages staff ----------------------------
create policy users_owner_write on public.users
  for insert to authenticated with check (tenant_id = app.tenant_id() and app.is_owner());
create policy users_owner_update on public.users
  for update to authenticated
  using (tenant_id = app.tenant_id() and app.is_owner())
  with check (tenant_id = app.tenant_id() and app.is_owner());

-- ---- audit log: staff append, owner reads, immutable -------
create policy audit_owner_select on public.audit_log
  for select to authenticated using (tenant_id = app.tenant_id() and app.is_owner());
create policy audit_append on public.audit_log
  for insert to authenticated with check (tenant_id = app.tenant_id() and app.is_staff());

-- ---- catalog: manager+ writes ------------------------------
do $$
declare t text;
begin
  foreach t in array array['categories','products','barcodes','batches','price_board_entries'] loop
    execute format(
      'create policy mgr_insert on public.%I for insert to authenticated with check (tenant_id = app.tenant_id() and app.is_manager_up())', t);
    execute format(
      'create policy mgr_update on public.%I for update to authenticated using (tenant_id = app.tenant_id() and app.is_manager_up()) with check (tenant_id = app.tenant_id() and app.is_manager_up())', t);
  end loop;
end;
$$;

-- ---- customers & deni --------------------------------------
create policy customers_staff_insert on public.customers
  for insert to authenticated with check (tenant_id = app.tenant_id() and app.is_staff());
create policy customers_mgr_update on public.customers
  for update to authenticated
  using (tenant_id = app.tenant_id() and app.is_manager_up())
  with check (tenant_id = app.tenant_id() and app.is_manager_up());
create policy cust_txn_staff_insert on public.customer_transactions
  for insert to authenticated with check (tenant_id = app.tenant_id() and app.is_staff());
-- customer_transactions: append-only, no update/delete policies

-- ---- suppliers / PO / GRN: manager+ ------------------------
do $$
declare t text;
begin
  foreach t in array array['suppliers','purchase_orders','po_lines','grns','grn_lines'] loop
    execute format(
      'create policy mgr_insert on public.%I for insert to authenticated with check (tenant_id = app.tenant_id() and app.is_manager_up())', t);
    execute format(
      'create policy mgr_update on public.%I for update to authenticated using (tenant_id = app.tenant_id() and app.is_manager_up()) with check (tenant_id = app.tenant_id() and app.is_manager_up())', t);
  end loop;
end;
$$;

-- ---- selling: staff append ---------------------------------
create policy sales_staff_insert on public.sales
  for insert to authenticated with check (tenant_id = app.tenant_id() and app.is_staff());
create policy sales_staff_update on public.sales   -- park/unpark; void PIN-gated in app + audit
  for update to authenticated
  using (tenant_id = app.tenant_id() and app.is_staff())
  with check (tenant_id = app.tenant_id() and app.is_staff());
create policy sale_lines_staff_insert on public.sale_lines
  for insert to authenticated with check (tenant_id = app.tenant_id() and app.is_staff());
create policy payments_staff_insert on public.payments
  for insert to authenticated with check (tenant_id = app.tenant_id() and app.is_staff());
create policy payments_mgr_update on public.payments  -- M-Pesa inbox matching
  for update to authenticated
  using (tenant_id = app.tenant_id() and app.is_manager_up())
  with check (tenant_id = app.tenant_id() and app.is_manager_up());

-- ---- stock: movements append-only; levels read-only --------
create policy movements_staff_insert on public.stock_movements
  for insert to authenticated with check (tenant_id = app.tenant_id() and app.is_staff());
-- stock_levels: SELECT only (created above). No write policies:
-- maintained exclusively by the security-definer trigger.

-- ---- verticals ---------------------------------------------
create policy carcass_staff_insert on public.carcass_intakes
  for insert to authenticated with check (tenant_id = app.tenant_id() and app.is_staff());
create policy regulated_staff_insert on public.regulated_sales
  for insert to authenticated with check (tenant_id = app.tenant_id() and app.is_staff());

-- ---- money -------------------------------------------------
create policy expenses_staff_insert on public.expenses
  for insert to authenticated with check (tenant_id = app.tenant_id() and app.is_staff());
create policy expenses_mgr_update on public.expenses
  for update to authenticated
  using (tenant_id = app.tenant_id() and app.is_manager_up())
  with check (tenant_id = app.tenant_id() and app.is_manager_up());
create policy shifts_staff_insert on public.shifts
  for insert to authenticated with check (tenant_id = app.tenant_id() and app.is_staff());
create policy shifts_staff_update on public.shifts
  for update to authenticated
  using (tenant_id = app.tenant_id() and app.is_staff())
  with check (tenant_id = app.tenant_id() and app.is_staff());
create policy cash_staff_insert on public.cash_movements
  for insert to authenticated with check (tenant_id = app.tenant_id() and app.is_staff());
create policy day_close_staff_insert on public.day_closes
  for insert to authenticated with check (tenant_id = app.tenant_id() and app.is_staff());

-- ---- fiscal_documents: client read, service-only write -----
-- (tenant_select created above; deliberately no write policies)

-- ---- billing & messaging: owner reads, service writes ------
create policy subs_owner_select on public.subscriptions
  for select to authenticated using (tenant_id = app.tenant_id() and app.is_owner());
create policy integrations_owner_all on public.tenant_integrations
  for all to authenticated
  using (tenant_id = app.tenant_id() and app.is_owner())
  with check (tenant_id = app.tenant_id() and app.is_owner());
create policy msg_owner_select on public.message_log
  for select to authenticated using (tenant_id = app.tenant_id() and app.is_owner());
create policy sms_wallet_owner_select on public.sms_wallets
  for select to authenticated using (tenant_id = app.tenant_id() and app.is_owner());
create policy sms_topup_owner_select on public.sms_wallet_topups
  for select to authenticated using (tenant_id = app.tenant_id() and app.is_owner());

-- ---- events / event_registry / receipt_counters ------------
-- RLS enabled with NO policies: all access via service role
-- (sync-push / sync-pull Edge Functions). Clients never touch
-- these tables directly.

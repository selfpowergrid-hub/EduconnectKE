-- Cross-tenant denial: tenant A must never see or touch tenant B rows.
begin;
select plan(8);

-- ---- seed two tenants as service (superuser) ---------------
insert into public.tenants (id, name, phone) values
  ('11111111-1111-1111-1111-111111111111', 'Duka ya Chebet', '+254700000001'),
  ('22222222-2222-2222-2222-222222222222', 'Butchery Kipchoge', '+254700000002');

insert into public.products (id, tenant_id, name, sell_price_cents) values
  ('aaaaaaaa-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'Sukari 1kg', 15000),
  ('bbbbbbbb-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'Beef kg', 55000);

insert into public.customers (id, tenant_id, name) values
  ('cccccccc-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'Mama Akinyi');

-- ---- act as tenant A owner ---------------------------------
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated","tenant_id":"11111111-1111-1111-1111-111111111111","app_role":"owner"}',
  true);
set local role authenticated;

select is((select count(*)::int from public.products), 1, 'A sees only own products');
select is((select name from public.products limit 1), 'Sukari 1kg', 'A sees the right product');
select is((select count(*)::int from public.customers), 0, 'A sees no B customers');
select is((select count(*)::int from public.tenants), 1, 'A sees only own tenant row');

-- write into tenant B must be blocked (RLS with-check violation)
select throws_ok(
  $$insert into public.products (id, tenant_id, name, sell_price_cents)
    values (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'Smuggled', 1)$$,
  '42501', null, 'A cannot insert products into B'
);

-- update across tenants silently matches zero rows
update public.products set name = 'Hacked' where id = 'bbbbbbbb-2222-2222-2222-222222222222';
reset role;
select is(
  (select name from public.products where id = 'bbbbbbbb-2222-2222-2222-222222222222'),
  'Beef kg', 'cross-tenant update had no effect'
);

-- ---- role checks: attendant cannot manage catalog ----------
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated","tenant_id":"11111111-1111-1111-1111-111111111111","app_role":"attendant"}',
  true);
set local role authenticated;

select throws_ok(
  $$insert into public.products (id, tenant_id, name, sell_price_cents)
    values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'New item', 100)$$,
  '42501', null, 'attendant cannot create products'
);

-- but attendant can record a sale
select lives_ok(
  $$insert into public.sales (id, tenant_id, status, total_cents)
    values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'completed', 15000)$$,
  'attendant can record a sale'
);

select * from finish();
rollback;

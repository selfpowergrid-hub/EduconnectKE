-- Stock is derived from movements only; levels fold deterministically;
-- movements are immutable (PRD §11.2 "stock is never set").
begin;
select plan(6);

insert into public.tenants (id, name, phone) values
  ('11111111-1111-1111-1111-111111111111', 'Duka ya Chebet', '+254700000001');
insert into public.products (id, tenant_id, name, sell_price_cents) values
  ('aaaaaaaa-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'Unga 2kg', 18000);

-- purchase 50, sell 3, adjust -2 (breakage)
insert into public.stock_movements (id, tenant_id, product_id, type, qty_delta, unit_cost_cents) values
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-1111-1111-1111-111111111111', 'purchase', 50, 14000),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-1111-1111-1111-111111111111', 'sale', -3, 14000),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-1111-1111-1111-111111111111', 'adjust', -2, 14000);

select is(
  (select qty from public.stock_levels
    where tenant_id = '11111111-1111-1111-1111-111111111111'
      and product_id = 'aaaaaaaa-1111-1111-1111-111111111111'),
  45::numeric(14,3), 'levels fold: 50 - 3 - 2 = 45'
);

select is(
  (select valuation_cents from public.stock_levels
    where product_id = 'aaaaaaaa-1111-1111-1111-111111111111'),
  (45 * 14000)::bigint, 'valuation folds at cost'
);

select is(
  (select qty from public.stock_levels where product_id = 'aaaaaaaa-1111-1111-1111-111111111111'),
  (select sum(qty_delta) from public.stock_movements where product_id = 'aaaaaaaa-1111-1111-1111-111111111111')::numeric(14,3),
  'stock_levels ≡ Σ movements'
);

-- movements immutable
select throws_ok(
  $$update public.stock_movements set qty_delta = 999 where type = 'purchase'$$,
  'P0001', null, 'movements cannot be updated'
);
select throws_ok(
  $$delete from public.stock_movements where type = 'sale'$$,
  'P0001', null, 'movements cannot be deleted'
);

-- receipt counter is monotonic per tenant
select is(
  (select array[
     app.next_receipt_no('11111111-1111-1111-1111-111111111111'),
     app.next_receipt_no('11111111-1111-1111-1111-111111111111'),
     app.next_receipt_no('11111111-1111-1111-1111-111111111111')]),
  array[1,2,3]::bigint[],
  'receipt numbers 1,2,3'
);

select * from finish();
rollback;

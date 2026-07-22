-- Every public table must have RLS enabled — no exceptions (PRD §11.3).
begin;
select plan(2);

select is(
  (select count(*)::int
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')      -- tables + partitioned tables
      and not c.relrowsecurity
      and not c.relispartition),        -- child partitions inherit via parent
  0,
  'no public table without row security'
);

select cmp_ok(
  (select count(*)::int
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','p') and not c.relispartition),
  '>=', 35,
  'full schema is present (>= 35 tables)'
);

select * from finish();
rollback;

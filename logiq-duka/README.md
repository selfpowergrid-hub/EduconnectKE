# LogiQ Duka

**The all-in-one Kenyan shop, butchery, agrovet & supermarket management system.**
Offline-first POS · inventory · deni (customer credit) · M-Pesa · eTIMS — from KES 250/month.

> PRD.md is the single source of truth. CLAUDE.md carries the engineering laws. DECISIONS.md logs deviations.

## Monorepo layout

```
apps/
  mobile/     Expo React Native POS (Android-first)
  web/        Next.js dashboard (owner console, admin) — marketing + PWA POS later
packages/
  shared/     TS types, zod event schemas, reducers, sync engine core, money/qty utils
  catalog-templates/  JSON seed catalogs per business type (Phase 2)
  receipts/   Receipt rendering: ESC/POS + HTML + WhatsApp text (Phase 2)
supabase/
  migrations/ SQL schema + RLS (applied manually — see below)
  tests/      pgTAP RLS tests
  functions/  Edge Functions (sync-push, sync-pull, …)
services/
  etims/      VSCU/OSCU fiscalisation worker (Phase 5)
```

## Getting started

```bash
pnpm install
pnpm test           # unit + property tests (packages/shared)
pnpm typecheck
pnpm sync:functions # regenerate supabase/functions/_shared/gen from packages/shared
```

## Database

Migrations in `supabase/migrations/` are **applied manually** in filename order
(psql or the Supabase SQL editor). They are written for a Supabase project
(assume `auth` schema and `authenticated` role exist).

pgTAP tests: `supabase test db` with a local stack, or run `supabase/tests/*.sql`
against a scratch database with the `pgtap` extension.

## Build order (PRD §30)

schema → reducers/shared → sync → sell → money → billing → eTIMS.
Current status: **M0 (foundation) + M1 (sync engine, auth scaffolding) in progress.**

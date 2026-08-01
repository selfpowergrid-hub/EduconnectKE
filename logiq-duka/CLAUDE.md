# LogiQ Duka — Claude Code Instructions

- PRD.md is the single source of truth. When ambiguous, follow PRD §; if truly unspecified, choose the simplest option consistent with §5.3 product principles and note it in DECISIONS.md.
- NEVER: store stock as a settable quantity (movements only, §26); put secrets in client code; create a table without RLS + pgTAP test; add a peripheral beyond §11.4; add English strings without Swahili pair.
- ALWAYS: money in bigint cents; UUIDv7 ids; reducers live in packages/shared and run identically client/server; every event type has a property-based convergence test; every screen works offline.
- Testing gates: `pnpm test` + pgTAP + Maestro smoke must pass before any milestone is called done.
- Build order per PRD §30. Do not start a milestone early.
- Commit style: conventional commits; small PRs per feature folder.

## Repo-specific notes

- Edge Functions cannot import outside `supabase/functions/`, so shared reducer/event code is copied there by `pnpm sync:functions` into `supabase/functions/_shared/gen/` (generated — never edit by hand; CI fails on drift via `pnpm check:functions-drift`).
- SQL migrations in `supabase/migrations/` are applied manually by the founder (no CI deploy). Keep each migration idempotent-safe to review and strictly ordered.
- pgTAP tests live in `supabase/tests/` and run with `supabase test db` (or psql against a scratch DB with pgtap installed).

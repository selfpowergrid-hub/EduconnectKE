# services/etims — VSCU/OSCU fiscalisation worker

**Status: skeleton (built in milestone M5, PRD §30).**

Queue consumer over `fiscal_documents` (status = `queued`):

1. Build payload per KRA VSCU v2.0 spec (items with itemCd/classification,
   tax breakdown by VAT class, buyer PIN optional).
2. Submit to eTIMS (sandbox first — env `ETIMS_*`, see PRD §25).
3. Persist KRA invoice no + signature + QR payload → status `signed`.
4. Retries: 5× backoff → `failed` + alert (fiscal-health dashboard).
5. Credit notes reference the original KRA invoice number and are only
   ever issued from LogiQ Duka (KRA same-solution rule, PRD §9.1).

Item & branch registration endpoints are called on product/branch create
for VAT tenants. Conformance checklist will live in `CONFORMANCE.md`,
mirrored from the sandbox spec.

Deployable as a Supabase Edge Function on cron (1 min) or a small
long-running Node service (Fly/Railway) if submission latency demands it.

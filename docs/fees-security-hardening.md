# Fees Module — Phase 8 Hardening Report

## Automated anonymous-access probe (PASSING)

Script: `scratchpad/rls-anon-probe.mjs` (anon key, no session). Every fees
table, RPC, and write returns DENIED. Re-runnable any time as a regression gate.

| Surface | Result |
|---|---|
| SELECT on all 13 fee tables (voteheads … fee_audit_logs, fee_doc_counters) | DENIED (RLS returns 0 / 42501) |
| INSERT fee_payments | DENIED (42501) |
| RPCs: generate_invoices, record_fee_payment, apply_fee_adjustment, award_fee_bursary, void_fee_payment, get_student_fee_summary, get_fee_ledger_totals | DENIED (42501) |

## CRITICAL finding fixed — leftover public RLS policies (pre-existing)

The probe surfaced that ten **core** tables (not fee tables) carried
development-era `"Allow public …"` policies scoped to the `public` role with
`USING (true)`. These exposed student PII and staff records to the anonymous
internet, and via `ALL` policies let anonymous users **read and write exam
marks and exams**.

Affected: `students`, `staff`, `dorms`, `streams`, `exams`, `marks`,
`grading_systems`, `subjects`, `school_information`, `school_registrations`.

Fixed in `20260704090000_security_drop_public_policies.sql`:
- Added authenticated admin policies (`*_admin_all` via `is_school_admin`;
  `marks` scoped through the student) **before** dropping the public ones.
- Dropped all 16 leftover public policies.
- Revoked `anon` table-level DML (defense in depth on top of RLS).
- Post-fix probe: all ten tables + anon marks-write now DENIED (42501).

Root cause: these were applied by hand in the SQL editor during early
development, never captured in migrations. Not caused by the fees module (all
fees policies require auth) — surfaced by Phase 8 hardening.

## Role access matrix (after hardening)

| Table group | Admin | Teacher | Bursar/Accountant | Auditor | Anon |
|---|---|---|---|---|---|
| Fee tables (voteheads, structures, invoices, payments, allocations, receipts, adjustments, bursaries, sponsors) | full | none | full | read | none |
| fee_ledger_entries | read | none | read | read | none |
| fee_audit_logs | read | none | none | read | none |
| students | full | own classes (read) | read | read | none |
| staff | full | own + colleagues (read) | none | none | none |
| marks / exams | full | own subjects | none | none | none |

## Manual test checklist (needs real logins — not runnable from CLI)

Smoke-test in the running app after this security change (it touches the
existing exam/registration flows):

- [ ] Admin: Students page loads; add + edit + delete a student.
- [ ] Admin: Staff page add/edit; Exams create; enter marks; Reports/Marksheets.
- [ ] Admin: Settings → Streams/Dorms, Subjects, Grading, Fee Structure all save.
- [ ] New user: register a school end-to-end (insert path).
- [ ] Existing admin: sign out/in; change plan; change school login code.
- [ ] Teacher login: sees only assigned classes' students + marks; no fees.
- [ ] Bursar login: Accounting module only; record payment + receipt; no marks.
- [ ] Auditor login: Accounting read-only; Audit Log visible; writes fail.
- [ ] Parent portal: lookup by code+adm+phone; statement + receipts; own kids only.

## PRD acceptance criteria — where each is satisfied

- AC-1 batch invoicing (boarder/day, no dupes): `generate_invoices` + partial unique index.
- AC-2 priority allocation: `allocate_student_payments` (oldest invoice, votehead priority).
- AC-3 overpayment credit auto-applies: allocator re-run inside `generate_invoices`.
- AC-4 void reverses ledger, voids receipt, no hard delete: `void_fee_payment` + triggers.
- AC-5 parent sees only own children: service-role edge fn, no anon table access.
- AC-6 collected reconciles to ledger: Finance Dashboard "ledger balanced" check.
- AC-7 bursary as distinct labelled statement line: `get_student_fee_summary.concession_items`.

## Deferred (non-blocking)

- Authenticated per-role probes (bursar/auditor/teacher) require seeded test
  logins; covered by the manual checklist above.
- Batch-invoice 1,000-student performance timing (NFR-3) — spot-check when a
  large school's data exists.

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

### Final Accounts module (Phases A–E, 2026-07-06/07)

| Table group | Admin | Teacher | Bursar | Accountant | Auditor | Anon |
|---|---|---|---|---|---|---|
| gl_accounts, bank_accounts, suppliers (+bills/items), supplier_payments (+allocations), purchase_orders (+items), expense_vouchers | full | none | full | full | read | none |
| gl_journals, gl_journal_lines | read | none | read | read | read | none |
| fiscal_locks | read (set via admin RPC) | none | read | read | read | none |
| payroll_rates (global reference) | read | read* | read | read | read | none |
| **staff_payroll_profiles, payroll_runs, payslips, payslip_lines, statutory_payments** | full | **none** | full | **none** | **none** | none |

\* payroll_rates carries no school data (national statutory bands only).

Payroll is deliberately the tightest group: only `is_payroll_staff()` (admin +
bursar) — accountants keep AP/fees but cannot read colleagues' salaries; the
auditor sees payroll's *ledger effect* (gl_journal_lines) but not individual pay.
GL writes have **no INSERT/UPDATE/DELETE policies at all** — postings happen
only inside SECURITY DEFINER triggers/RPCs; gl_journals/lines are append-only
(UPDATE blocked by trigger) and every money mutation posts through them, which
is also where the single fiscal-lock guard lives.

## Automated probes (Final Accounts) — PASSING 2026-07-07

**Anonymous probe — 42 checks, all pass:** SELECT returns 0 rows / denied on all
15 new tables (gl_accounts, gl_journals, gl_journal_lines, bank_accounts,
suppliers, supplier_invoices, supplier_invoice_items, supplier_payments,
supplier_payment_allocations, purchase_orders, purchase_order_items,
expense_vouchers, staff_payroll_profiles, payroll_runs, payslips, payslip_lines,
payroll_rates, statutory_payments, fiscal_locks); INSERT denied; all 17 new
RPCs reject anon with 42501.

**Authenticated probe (real admin login) — 20 checks, all pass:**
- Positive access: admin reads all finance/GL/payroll tables (28 GL accounts,
  3 bank accounts, seeded rates row).
- **GL balanced: Dr 39,000.00 = Cr 39,000.00** — the fee-ledger→GL bridge and
  backfill reconcile exactly (26 journals at probe time).
- get_cashbook / get_ap_summary / get_ap_aging / get_statutory_summary all work.
- **Cross-tenant guards:** every read and write RPC rejects a foreign
  school_id ("Not authorized …"); table reads filtered to a foreign school
  return 0 rows.
- post_gl_journal rejects an unbalanced journal (Dr 100 vs Cr 55).

Still manual (needs bursar/accountant/auditor/teacher logins): the per-role
checklist below, plus one new line —

- [ ] Accountant login: Suppliers/Banking/Final Accounts visible; **Payroll nav
      absent and `staff_payroll_profiles` returns 0 rows**.

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

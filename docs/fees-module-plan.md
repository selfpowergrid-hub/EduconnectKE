# EduConnect KE — Fees & Finance Module: Implementation Plan

Based on the Fees & Finance PRD (v1.0, 3 July 2026), adapted to the actual stack
(React + Vite + Supabase, not Next.js) and to structures already in the codebase.

## Foundations already in place

- **Module shells** (`src/lib/modules.js`): Examinations vs Accounting interfaces with
  separate sidebars, accents and a `ROLE_MODULE` map. Menus never mix.
- **Fees v1 backend** (`20260613_fees_backend_and_parent_lookup.sql`): `voteheads`,
  `fee_structures` (CBC fee level × votehead × year, t1/t2/t3), `fee_payments`,
  `get_student_fee_summary()`, parent-portal edge function.
- **Reused entities (never modified, only referenced):** `school_registrations`,
  `students` (adm_no, level_id, stream_id, parent_phone), `streams`, `dorms`,
  `staff` + auth, RLS helpers `is_school_admin()` / `user_in_school()`.

## Key decisions

- Money is `NUMERIC(14,2)`; all money arithmetic in Postgres RPCs, never client JS.
- Keep the platform's `year INT` + `term 1–3` convention — no new calendar tables.
- **Boarder = student with a dorm bed**: `students.dorm_id` (nullable, additive) is the
  boarding flag. Voteheads gain `applies_to ('all'|'boarders'|'day')`.
- All new tables prefixed `fee_`; every one carries `school_id` + RLS.
- Separation is enforced at three layers: module shells (UI), RLS (DB), RPC guards.

## Role & access model

| Role (`staff.app_role`) | Module | Access |
|---|---|---|
| admin (school_registrations.email) | both, with switcher | everything |
| teacher / exams_officer | Examinations only | no fee table policies at all |
| bursar / accountant | Accounting only | full finance access; students SELECT-only; no marks (no teacher_assignments) |
| auditor | Accounting only | SELECT-only on finance tables |
| parent | portal (no session) | own children via service-role edge fn only |

## Phases

- **Phase 0 — Role wall** ✅ (built): `staff.app_role`, `is_finance_staff()` /
  `is_finance_reader()`, finance policies on students (read) + fees tables,
  AuthContext loads app_role, App routes staff to their module, account-type
  picker in Staff Logins (TeacherAllocations), edge fn accepts `app_role`.
  Migration: `20260703000000_finance_roles_phase0.sql`.
- **Phase 1 — Structure upgrade** ✅ (built): `students.dorm_id` (boarder = has dorm) +
  dorm select in admission form + optional Dorm column in bulk import; votehead
  `applies_to` (all/boarders/day), `priority`, `is_active` (archive instead of delete
  once used); fee structure draft→published toggle per level/year; balances in the
  Fees page and `get_student_fee_summary()` respect scoping and publish state.
  Migration: `20260703100000_fees_phase1_structure.sql`.
- **Phase 2 — Invoicing engine** ✅ (built): `fee_invoices` + `fee_invoice_items` +
  `fee_doc_counters` with atomic `next_fee_doc_no()`; `generate_invoices()` RPC (batch
  or single target, idempotent per (student, year, term) via partial unique index,
  boarder/day aware, published-only, amounts frozen at issue); `cancel_fee_invoice()`
  (soft-cancel, mandatory reason); `add_invoice_item()` (ad-hoc custom charges);
  Invoices tab in Fees page: generate wizard with run summary, list, detail modal.
  Numbers: `INV-2026-T1-000042`. Carry-forward deferred to Phase 3 (needs allocation).
  Migration: `20260703110000_fees_phase2_invoicing.sql`.
- **Phase 3 — Payments, allocation, receipts** ✅ (built): `fee_payments` extended
  (payer_name, narration, active/voided + void reason); `fee_payment_allocations`
  (payment → invoice item, so receipts show the votehead split); `fee_receipts`
  (`RCT-2026-000318`). Core: `allocate_student_payments()` — one allocator applies any
  unallocated active payment money to outstanding items (oldest invoice, then votehead
  priority); called by `record_fee_payment()` (insert + allocate + receipt, one txn)
  AND by `generate_invoices()` (so overpayment/historical credit auto-applies to new
  invoices, AC-3). `void_fee_payment()` soft-voids and voids the receipt (AC-4).
  Historical payments need no backfill: they sit as credit until invoices exist.
  UI: payment modal issues receipt with settlement breakdown + amount in words +
  print; payments list shows receipt numbers, reprint and void. Manual/ratio
  allocation modes deferred (priority-mode default covers AC-2).
  Migration: `20260703120000_fees_phase3_payments.sql`.
- **Phase 4 — Concessions** ✅ (built): `fee_sponsors`, `fee_adjustments` (invoice-scoped
  discount/waiver/credit note, % or fixed, capped at outstanding), `fee_bursary_awards`
  (student+year/term scoped, remainder auto-applies like credit). The allocations table
  now takes three sources (payment | adjustment | bursary, exactly one) so concessions
  settle invoice items like cash and statuses stay truthful; bursaries deliberately
  allocate before payments. RPCs: `apply_fee_adjustment`, `award_fee_bursary`,
  `void_fee_adjustment`, `void_fee_bursary`. Summary fn returns labelled concession
  lines ("Bursary — <sponsor>", AC-7) and balance = billed − paid − concessions.
  UI: Discounts & Bursaries tab (sponsors, award modal, void), discount form in the
  invoice modal, 🎁 marker on balances. Deferred: per-role discount ceilings /
  approval workflow (needs fee_settings, can ride with Phase 6 settings page).
  Migration: `20260703130000_fees_phase4_concessions.sql`.
- **Phase 5 — Ledger & audit** ✅ (built): append-only `fee_ledger_entries` (balanced
  pairs per txn_group; UPDATE blocked by trigger; accounts AR / FEE_INCOME / CASH /
  CONCESSION / BURSARY) + `fee_audit_logs` (actor, action, before/after snapshots).
  Posted by TRIGGERS on the fee tables — not by RPC edits — so no write path
  (including future M-Pesa) can bypass the ledger. Idempotent backfill posted all
  pre-existing invoices/payments/concessions. Generic audit trigger on all 10 fee
  tables. UI: Audit Log page in Accounting → Oversight (admin + auditor only, RLS
  matches), with per-field change diffs. Migration:
  `20260703140000_fees_phase5_ledger_audit.sql`.
- **Phase 6 — Dashboard & reports** ✅ (built): the Accounting shell now has its own
  Finance Dashboard (expected/collected/concessions/outstanding tiles, collection
  rate, top arrears by grade, recent payments feed, per-account ledger strip with a
  live "ledger balanced" check via `get_fee_ledger_totals()` RPC). New Reports page
  with the four P0 reports — Collection Summary (per term + per grade), Arrears
  (grade + threshold filters), Daily Collections (date range, per-method cash-up
  totals, receiving officer), Votehead Collections — all CSV-exportable and printable.
  Migration: `20260703150000_fees_phase6_report_helpers.sql`.
- **Phase 7 — Parent portal** ✅ (built): no edge-function change needed — it already
  passes `get_student_fee_summary()` through, which Phases 3–4 enriched. ParentFees
  now shows: boarder/day-aware billed cards, a Bursaries & Discounts card + labelled
  concession lines (AC-7), receipt numbers in payment history, and a "Download Full
  Statement (PDF)" button producing a school-branded printable statement
  (billed by term → concessions → payments with receipts → closing balance, FR-8.3).
  Still read-only and service-role gated (AC-5).
- **Phase 8 — Hardening** ✅ (in progress → security done): automated anonymous-access
  probe (`scratchpad/rls-anon-probe.mjs`) confirms all fee tables/RPCs deny anon.
  Surfaced + fixed a CRITICAL pre-existing hole: ten core tables (students, staff,
  marks, exams, …) had leftover `"Allow public"` `USING(true)` policies exposing PII
  and letting anon read/write marks — remediated in
  `20260704090000_security_drop_public_policies.sql` (admin policies added before
  public dropped; anon DML revoked; re-probe passes). Full report + role matrix +
  manual login checklist + AC mapping in `docs/fees-security-hardening.md`.
  Remaining: authenticated per-role smoke test (needs real logins), batch perf timing.

PRD Phase 2 (M-Pesa Daraja etc.) later becomes another writer into `fee_payments` —
nothing here blocks it.

## Accounting module target menu

Finance Dashboard · Fee Structure · Invoicing · Record Payments · Student Accounts ·
Discounts & Bursaries · Arrears & Balances · Daily Collections · Votehead Collections ·
Finance Settings (admin) · Audit Log (admin/auditor)

## Phase 9 — Term-aware balances + allocation modes (built)

- `fee_settings` (per-school `allocation_mode`: priority | percentage) + Finance
  Settings page (Accounting → Oversight).
- `fee_payments.allocation_mode` per payment; `record_fee_payment` takes an override;
  `allocate_student_payments` now supports **percentage (pro-rata)** as well as priority
  (floored pro-rata pre-pass + priority mop-up for rounding). Priority = votehead order.
- Fees Management **Term filter** (Full year / T1–3): per-term Billed / Paid / Balance,
  OVERPAID flag. Rows open a **per-student drill-down**: votehead × term matrix
  (Owed / Paid / Balance), "REAL · invoiced" vs "ESTIMATED" badge per term.
- Data source = both: real allocations where a term's invoices exist, else a virtual
  distribution of the student's cash by the school's mode (client-side `breakdownFor`).
- Record Payment modal gains a "Spread across voteheads by" override.
  Migration: `20260704100000_fees_phase9_allocation_modes.sql`.

## Phase 10 — Special billing (boarding, overrides, exemptions)

Decisions: explicit Boarder/Day field (dorm optional); bursar/admin set overrides
directly, audited (no approval workflow).

- **10a — Boarding status** ✅ (built): `students.boarding_status` ('day'|'boarder',
  backfilled from dorm). Admission form Boarder/Day toggle (dorm now optional detail,
  only for boarders); Students list badge + Boarding filter; bulk import "Boarding"
  column. `get_student_fee_summary` + `generate_invoices` + client `billedFor`/
  `breakdownFor` now key boarder scope off boarding_status, not dorm presence.
  Migration: `20260704110000_fees_phase10a_boarding_status.sql`.
- **10b — Per-grade pricing + fee categories** ✅ (built; direction revised by user):
  pricing key is now (GRADE × CATEGORY × votehead × year). `fee_categories`
  (system Day Scholar/Boarder seeded per school + named specials via "+ New
  structure"); `fee_structures.fee_level` now stores grade codes (band sheets
  expanded per grade, bills unchanged); `fee_structures.category_id` (NULL = "All
  students" shared sheet). Combination rule: category row OVERRIDES the shared row
  for the same votehead, else adds on. `students.fee_category_id` +
  `student_fee_category()` (explicit assignment, else boarding_status → Day/Boarder).
  `get_student_fee_summary` / `generate_invoices` / client billing all use the
  effective merged sheet (DISTINCT ON specific-first). Level Pricing UI: Year →
  Level → Grade selects, category pills with counts, override badges, "X PAYS
  (incl. inherited)" effective totals footer, per-grade publish toggle.
  Migration: `20260704120000_fees_phase10b_categories_grades.sql`.
- **10c — Student category assignment** ✅ (built): category picker on the student
  (admission form + student fee drill-down), category badge/filter in Fee Balances,
  bulk assignment. `students.fee_category_id` surfaced in Settings + Fees.
  Migration: `20260704140000_default_category_all_students.sql` (defaults every
  existing student to the shared "All students" sheet).

## Phase 11 — Student-specific charges ✅ (built)

Per-student, per-votehead overrides for one-off situations the category/grade sheets
can't express (a single student's extra transport leg, a private-tuition top-up).
- `student_votehead_charges` (student × votehead × year, t1/t2/t3, notes; school-scoped
  RLS + audit trigger). `get_student_fee_summary()` and `generate_invoices()` re-issued
  to fold these amounts into the effective bill on top of the merged category sheet.
  Migration: `20260706000000_student_specific_charges.sql`.

## Finance defaults ✅ (built)

Small quality-of-life layer on `fee_settings`:
- `working_year` + `current_term` — what finance screens/forms open on (NULL = by
  calendar); surfaced in Finance Settings → Defaults.
- `get_next_receipt_no()` / `set_receipt_counter()` — show and seed the next receipt
  number (forward-only, so numbering can continue from a paper book without minting
  duplicates). Migration: `20260706110000_finance_defaults.sql`.

## Pocket Money ✅ (built) — custodial, deliberately outside the fee ledger

Student personal-money accounts (parent deposits, student withdrawals, running
balance). **Nothing here touches the fee tables, the double-entry ledger, or finance
reports** — it shares only the admin/finance RLS model and the audit trail. New
`PocketMoney` page under Accounting → Fees; nav id `pocket-money` in `modules.js` +
all plans. Migration: `20260706100000_pocket_money.sql`.

## Open questions

1. Class teachers seeing a bare "cleared/not cleared" flag (no amounts): shipped OFF;
   could become an admin toggle.
2. Segregation of duties (bursar posts, admin approves fee structures): Phase 0 ships
   admin-full-access; approval workflow can layer on in Phase 4+.

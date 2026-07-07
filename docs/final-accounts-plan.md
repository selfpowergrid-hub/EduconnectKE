# Final Accounts Module — Implementation Plan

**Goal:** extend the Accounting module from *fees only* to a complete school
finance system: suppliers & purchases (accounts payable), expense management,
staff payroll (Kenyan statutory), banking/cashbook, and the final accounts a
school must produce — Trial Balance, Income & Expenditure Statement, and
Balance Sheet — with a proper year-end close.

**Principles (same as the fees module):**
- Additive only — nothing in exams or the existing fees engine changes behavior.
- Same module shell: everything lives under the Accounting module; exam users never see it.
- Money mutations only via guarded SECURITY DEFINER RPCs; ledger postings via
  triggers (un-bypassable); generic audit trigger on every new table.
- RLS: `_admin_all` / `_finance_all` / `_finance_read` per table; anon denied; re-probe after each phase.
- Idempotent migrations, 14-digit timestamps, `db push` per phase.

---

## Phase A — General Ledger core (Chart of Accounts) ✅ (built & deployed)

The single foundation everything else posts into.

**Shipped:** `gl_accounts` (seeded Kenyan chart, per-school seed trigger, `sys_key`
identity + `gl_accounts_protect` trigger), append-only `gl_journals` / `gl_journal_lines`
(RLS read-only; writes only via SECURITY DEFINER), `post_gl_journal()` guarded manual-entry
RPC (balance-enforced), and the fee-ledger→GL bridge trigger + idempotent history backfill.
`get_gl_trial_balance()` helper powers the live "GL balanced" health check and is reused as
Phase E's Trial Balance. UI: **Chart of Accounts tab in Finance Settings** (list by type,
rename, add heads, activate/deactivate; system rows protected). Anon + RPC RLS re-probe
passes (all deny). Migrations: `20260706120000_gl_phase_a_general_ledger.sql`,
`20260706130000_gl_phase_a_helpers.sql`.



**Tables**
- `gl_accounts` — per school: `code` (e.g. 1000), `name`, `type`
  (`asset|liability|equity|income|expense`), `subtype` (e.g. `bank`, `receivable`,
  `statutory`), `is_system` (seeded rows that reports depend on — rename OK, delete blocked),
  `is_active`.
- `gl_journals` — header: `journal_no` (JRN-YYYY-NNNNNN via existing `next_fee_doc_no`
  pattern), `entry_date`, `source_type/source_id`, `memo`, `posted_by`, `status`
  (`posted|reversed`). Append-only like `fee_ledger_entries` — corrections are reversals.
- `gl_journal_lines` — `account_id`, `debit`, `credit` (one leg per row),
  optional `student_id`/`supplier_id`/`staff_id` dimension columns.
- Balance enforcement: constraint trigger on journal post — Σdebits = Σcredits or reject.

**Seeded Kenyan-school chart** (per school, trigger for new schools — same pattern
as `fee_categories`):

| Code | Account | Type |
|---|---|---|
| 1000 | Cash in Hand (Petty Cash) | asset |
| 1010 | Bank — Main Account | asset |
| 1020 | M-PESA Paybill | asset |
| 1100 | Fees Receivable | asset |
| 2000 | Suppliers Payable | liability |
| 2100 | Salaries Payable | liability |
| 2110 | PAYE Payable | liability |
| 2120 | NSSF Payable | liability |
| 2130 | SHIF Payable | liability |
| 2140 | Housing Levy Payable | liability |
| 2200 | Prepaid Fees (unearned) | liability |
| 3000 | Accumulated Fund | equity |
| 4000 | Fee Income | income |
| 4100 | Other Income | income |
| 5000 | Salaries & Wages | expense |
| 5010 | Employer Statutory Contributions | expense |
| 5100–58xx | Expense heads: Food/Boarding, Transport, Utilities, Repairs, Learning Materials, Admin, … | expense |
| 6000 | Bursaries & Concessions | expense |

**Fees bridge:** the existing `fee_ledger_entries` account codes map into GL
accounts (AR→1100, FEE_INCOME→4000, CASH→cash account, CONCESSION/BURSARY→6000).
A trigger mirrors every new fee ledger row into a GL journal; a one-time
idempotent backfill migrates history. The fees engine itself is untouched.

**UI:** "Chart of Accounts" tab inside Finance Settings (view, rename, add
expense heads, deactivate).

---

## Phase B — Banking & Cash Accounts ✅ (built & deployed)

Payments in Phase C/D need a *source* account, so banking comes first.

**Shipped:** `bank_accounts` (kind bank|mpesa|petty_cash, linked `gl_account_id`,
one default per kind, delete-protected once used; seeded per school → 1010/1020/1000
with a seed trigger for new schools). `fee_payments.bank_account_id` — BEFORE-INSERT
trigger defaults it from the method (`bank_kind_for_method`: %pesa%→mpesa, cash→petty,
else bank) + backfill of history; the fee→GL bridge upgraded so CASH legs post to the
payment's chosen account (method map stays as fallback). `record_bank_transfer()` RPC
posts balanced Dr/Cr journals (`source_type='bank_transfer'`); `get_cashbook()` returns
opening balance + chronological entries with running balance. UI: **Banking & Cash page**
(nav id `banking`, all plans) — live account cards (GL balances), transfer form, cashbook
with CSV + letterhead print. Anon probe passes (table + both RPCs deny).
Migration: `20260707000000_final_accounts_phase_b_banking.sql`.



- `bank_accounts` — name, kind (`bank|mpesa|petty_cash`), bank/branch/account no,
  linked `gl_account_id`. Seed one of each kind mapped to 1000/1010/1020.
- `record_bank_transfer` RPC — move money between accounts (e.g. bank petty-cash
  top-up, M-PESA sweep to bank); posts Dr/Cr between the two GL accounts.
- Fee payments: `fee_payments.bank_account_id` (nullable, defaulted from payment
  method) so collections land in the right cash account; existing rows default to
  a method→account map.
- **Cashbook report** — per account, chronological in/out with running balance,
  letterhead print + CSV. This is the receipts-and-payments book every bursar keeps.

---

## Phase C — Suppliers & Purchases (Accounts Payable)

**C1 — suppliers, bills, payments ✅ (built & deployed):** `suppliers` (KRA PIN,
category, payout details, terms_days, delete-protected once billed); `supplier_invoices`
+ `supplier_invoice_items` (BILL-YYYY-NNNNNN, lines coded to expense/asset GL accounts
with validation, draft total synced from items, lifecycle guard: items/identity freeze at
post, void needs a reason and no allocations); `supplier_payments` (PV-YYYY-NNNNNN,
never deleted/edited — void with reason) + `supplier_payment_allocations` (guarded: same
supplier, ≤ outstanding, ≤ voucher; bill status recomputes posted↔part_paid↔paid).
GL postings in TRIGGERS (un-bypassable): bill posted → Dr lines / Cr 2000; bill void →
reversal; payment → Dr 2000 / Cr bank account's GL; payment void → reversal + allocations
removed. RPCs: `create_supplier_bill` / `post_supplier_bill` / `void_supplier_bill` /
`record_supplier_payment` (manual split or oldest-bill-first; remainder = supplier credit) /
`void_supplier_payment` / `get_ap_summary`. UI: **Suppliers & Expenses page** (nav id
`suppliers`) — Suppliers / Bills / Payments tabs, bill editor with GL-coded lines,
voucher print with Prepared/Approved/Received signature lines. Anon probe passes
(5 tables + 4 RPCs deny). Migration: `20260707100000_final_accounts_phase_c1_suppliers_ap.sql`.

**C2 — LPOs, petty-cash vouchers, AP reports ✅ (built & deployed):**
`purchase_orders` + items (LPO-YYYY-NNNNNN; open → billed | cancelled; never deleted,
cancel needs a reason; NO GL effect — items optionally pre-coded to GL to prefill the
bill). `supplier_invoices.purchase_order_id`: posting a linked bill marks the LPO billed,
voiding re-opens it; `create_supplier_bill` re-issued with the LPO param. `expense_vouchers`
(PCV-YYYY-NNNNNN one-step spend: Dr expense/asset, Cr paying account; void = reversal;
never edited/deleted). RPCs: `create_purchase_order`, `cancel_purchase_order`,
`record_expense_voucher`, `void_expense_voucher`, `get_supplier_statement` (opening +
running balance), `get_ap_aging` (current/1-30/31-60/61-90/90+ by due date). Expense
summary = `get_gl_trial_balance` filtered to expense accounts (no new RPC). UI: Suppliers
page gains **LPOs** (issue, letterhead print, "Bill arrived" → prefilled bill, cancel),
**Petty Cash** (record/void/print PCV), and **Reports** (statement, aging with totals,
expense summary — all CSV + print) tabs. Anon probe: 25 checks pass.
Migration: `20260707110000_final_accounts_phase_c2_lpo_petty_reports.sql`.

Original C-scope notes:

- `suppliers` — name, KRA PIN, category, phone/email, bank or M-PESA payout
  details, payment terms, is_active.
- `supplier_invoices` (bills) + `supplier_invoice_items` — each line coded to an
  expense (or asset) GL account; invoice no (theirs) + our sequential `BILL-YYYY-NNNNNN`;
  status `draft|posted|part_paid|paid|void`. Posting → Dr expense heads, Cr Suppliers Payable.
- `supplier_payments` + allocations to bills — same allocator pattern as fees
  (oldest bill first, manual override). Payment → Dr Suppliers Payable, Cr chosen
  bank account. Sequential `PV-YYYY-NNNNNN` (payment voucher) printed with letterhead
  and signature lines (Prepared / Approved / Received).
- **LPOs (Local Purchase Orders)** — lightweight: `purchase_orders` with items,
  sequential `LPO-YYYY-NNNNNN`, letterhead print, status `open|billed|cancelled`,
  optional link when the bill arrives. No GL effect until billed. (Kenyan schools
  live on LPOs — cheap to add here, painful to retrofit.)
- **Direct expense / petty-cash voucher** — one-step expense with no supplier bill
  (Dr expense, Cr petty cash), for the day-to-day small spend.
- **Reports:** supplier statement, AP aging (30/60/90), expense summary by account.

**UI:** new "Suppliers & Expenses" page — tabs: Suppliers / Bills / Payments / LPOs / Petty Cash.

---

## Phase D — Payroll (Kenyan statutory)

Reuses the existing `staff` table — payroll data is an additive profile.

**D1 — profiles, rates, run/approve engine ✅ (built & deployed):**
`is_payroll_staff()` (admin + bursar only); `staff_payroll_profiles` (basic + house/
transport/other allowances, KRA/NSSF/SHIF numbers, payout details; RLS is payroll-only —
deliberately NO finance_all/finance_read, so accountants/auditors can't see salaries);
`payroll_rates` (global, effective-dated, read-only reference data seeded with FY2025/26:
PAYE bands + relief 2,400, NSSF 6%+6% UEL 72,000, SHIF 2.75% min 300, Housing Levy
1.5%+1.5%, statutory deductions pre-tax per TLAA 2024 — future changes are new rows, not
code); `payroll_runs` (one per school-month, draft→approved→paid forward-only, draft-only
delete) + `payslips` (frozen figures + name snapshot) + `payslip_lines` (itemized).
All statutory maths in `generate_payroll_run()` (recomputes while draft, picks the rates
row in force at month-end); `approve_payroll_run()` freezes and a TRIGGER posts the GL:
Dr 5000 gross + Dr 5010 employer NSSF/levy, Cr 2110/2120/2130/2140 statutory, Cr 2100 net.
UI: **Payroll page** (nav id `payroll`, roles admin+bursar) — Employees (profile editor)
and Run Payroll (generate/recompute, review with totals + employer-cost strip, approve,
discard draft). Anon probe: 32 checks pass. Migration:
`20260707120000_final_accounts_phase_d1_payroll_core.sql`.

**D2 — mark-paid, statutory remittances, outputs ✅ (built & deployed):**
`payslips.paye_before_relief` + `personal_relief` (exact P9 figures; engine re-issued to
store them). `pay_payroll_run()` → approved→paid, Dr 2100 / Cr chosen bank account
(trigger-posted; guard requires the paying account). `statutory_payments` (paye | nssf |
shif | housing_levy remittances; never edited/deleted, void = reversal; Dr the payable,
Cr bank) + `pay_statutory` / `void_statutory_payment`. `get_statutory_summary(year,
month)` — due from approved runs vs remitted vs balance owed to government.
`get_p9(staff, year)` — monthly basic/benefits/gross/pension/taxable/tax-charged/relief/
PAYE from approved runs. UI: Run tab gains **Mark salaries paid** (account picker),
**per-employee payslip print** (confidential, earnings/deductions/employer sections) and
**muster-roll print** (signature columns); new **Statutory** tab (due/paid/balance per
obligation, one-click remittance prefilled with the balance, history + void) and **P9
Cards** tab (view + print). Anon probe: 37 checks pass. Migration:
`20260707130000_final_accounts_phase_d2_payroll_pay_statutory.sql`.

- `staff_payroll_profiles` — basic salary, cash allowances (house, transport, …),
  KRA PIN, NSSF no, SHIF no, bank/M-PESA payout details, pay grade, active flag.
- `payroll_rates` — **statutory rates as data, not code** (they change yearly):
  PAYE bands (10 % to 24,000 → 35 % over 800,000/mo), personal relief (2,400/mo),
  NSSF 6 % + 6 % with tier limits, SHIF 2.75 % (min 300), Housing Levy 1.5 % + 1.5 %.
  Seeded with current rates, effective-dated so history recomputes correctly.
- `payroll_runs` (month, status `draft → approved → paid`) + `payslips` +
  `payslip_lines` (earnings/deductions itemized). Draft is editable; approval
  freezes figures and posts to GL:
  - Dr 5000 Salaries (gross) + Dr 5010 Employer contributions
  - Cr 2110–2140 statutory liabilities, Cr 2100 Net Salaries Payable
  - "Mark paid" → Dr 2100, Cr bank account.
- `pay_statutory` RPC — record the KRA/NSSF/SHA remittance (Dr liability, Cr bank)
  so the Balance Sheet shows what is still owed to government.
- **Outputs:** payslip print (letterhead, confidential), payroll register/muster
  roll per run, statutory remittance summary per month, **P9 annual tax card**
  per employee, year-to-date totals.
- **Access:** payroll pages restricted to **admin + bursar** (accountants keep
  AP/fees but not colleagues' salaries) — one new `is_payroll_staff()` helper.

**UI:** new "Payroll" page — tabs: Employees / Run Payroll / Payslips / Statutory / Reports.

---

## Phase E — Final Accounts & Period Close ✅ (built & deployed)

**Shipped:** `fiscal_locks` + ONE BEFORE-INSERT guard on `gl_journals` — since every money
path (fees bridge, AP, payroll, statutory, transfers, manual) posts through gl_journals,
one trigger locks them all. `close_fiscal_year()` (admin only): zeroes every income/expense
account into 3000 Accumulated Fund at 31 Dec, sets the lock; prior closed years net to
zero so re-summing history stays correct. `reopen_fiscal_year()` (admin, newest-first
only): rolls the lock back then posts the swapped-leg reversal. `set_fiscal_lock()` —
mid-year term locks; never below the last standing close. `get_gl_account_detail()` —
generalized cashbook for any account. The statements needed NO new read RPCs — TB, I&E
and the Balance Sheet all derive from `get_gl_trial_balance()`. UI: **Final Accounts page**
(nav id `final-accounts`, Oversight, roles admin/accountant/bursar/auditor) with six tabs:
Trial Balance (balanced check, click-through), Income & Expenditure (sections + surplus,
drill-down), Balance Sheet (assets = liabilities + fund check, incl. unclosed surplus),
Account Detail (opening/running/closing), Journal Entry (post_gl_journal, live balance
indicator), Year-End (lock control, close/reopen) — all reports CSV + letterhead print.
Finance Dashboard gains the income/expenses/surplus ledger strip. Anon probe: 42 checks
pass. Migration: `20260707140000_final_accounts_phase_e_reports_close.sql`.

All reports read `gl_journal_lines` (single source of truth), letterhead print + CSV:

1. **Trial Balance** — every account, Dr/Cr totals, proves the books balance.
2. **Income & Expenditure Statement** — income vs expenses for a date range,
   surplus/deficit; drill-down from any line to its journal entries.
3. **Balance Sheet (Statement of Financial Position)** — assets, liabilities,
   accumulated fund as at a date; includes current-period surplus.
4. **General Ledger detail** — per-account chronological listing with running balance.
5. Existing fee reports remain; Finance Dashboard gains an expenses/surplus strip.

**Period close:**
- `fiscal_locks` — lock date per school; triggers reject any posting dated on/before
  the lock (fees, AP, payroll, journals — everything).
- `close_fiscal_year` RPC — posts the closing journal (income & expense accounts →
  3000 Accumulated Fund) and sets the lock. Reversible only by admin before the
  next close.
- Manual journal entry screen (admin/bursar) for adjustments — the accountant's
  escape hatch, fully audited like everything else.

---

## Phase F — Security & polish ✅ (done)

- **Anon probe — 42 checks pass**: all 15+ new tables return 0 rows / denied;
  all 17 new RPCs reject anon (42501).
- **Authenticated probe (real admin login) — 20 checks pass**: positive reads on
  every table group; **GL balanced Dr 39,000 = Cr 39,000** (the fee→GL bridge +
  backfill reconcile exactly); cashbook/AP/statutory RPCs work; **every RPC rejects
  a foreign school_id** (cross-tenant guard); unbalanced manual journals rejected.
- Role matrix updated in `docs/fees-security-hardening.md` (Final Accounts section:
  payroll is admin+bursar only; GL append-only with no direct write policies; the
  fiscal-lock guard sits on gl_journals where every money path posts).
- Nav shipped incrementally with each phase: `banking`, `suppliers`, `payroll`
  (roles admin+bursar), `final-accounts` — all in `modules.js` + every plan in
  `planConfig.js`. Audit-log viewer picks up the new tables automatically
  (generic `fee_audit_row` trigger on all of them).
- Remaining manual-only items (need bursar/accountant/auditor logins): the
  per-role smoke checklist in the hardening doc, esp. *accountant cannot see
  Payroll* (RLS enforces it; the UI check is a formality).

---

## Out of scope for now (future candidates)
- Inventory/stores management (food stock, uniforms) — big enough to be its own module.
- Budgeting & budget-vs-actual — natural Phase G once final accounts exist.
- Bank statement import/auto-reconciliation.
- Fixed asset register with depreciation schedules (a 15xx account serves until then).

## Build order & estimate
A → B → C → D → E → F. Roughly 8–10 migrations, 4 new pages, ~2 heavy phases
(C and D). Each phase ships working and deployed before the next starts, same
as fees.

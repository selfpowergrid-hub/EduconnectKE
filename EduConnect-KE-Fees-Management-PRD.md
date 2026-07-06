# Product Requirements Document — EduConnect KE: Fees & Finance Management Module

**Product:** EduConnect KE (School Management SaaS)
**Module:** Fees & Finance Management (Phase 1)
**Author:** Total Man Technologies
**Version:** 1.0
**Status:** Draft for build
**Last updated:** 3 July 2026

---

## 1. Purpose

This document specifies the Fees & Finance Management module to be built into the existing EduConnect KE platform. The module manages the full internal fee lifecycle for a Kenyan school — from defining fee structures (voteheads) through invoicing students, recording payments, receipting, tracking balances and arrears, to producing statements and financial reports.

**Phase 1 is deliberately self-contained.** It does not integrate with M-Pesa, banks, or any external payment gateway. Payments are recorded manually by the bursar/accountant (e.g. a parent pays via bank deposit slip, cash, cheque, or an M-Pesa reference the bursar keys in by hand). This keeps the build focused, shippable, and audit-ready before any integration work begins. External payment integrations (Daraja C2B/STK, bank feeds, SMS/WhatsApp notifications) are explicitly deferred to Phase 2.

---

## 2. Background & rationale

Kenyan schools currently reconcile fees across bank records, M-Pesa statements, and handwritten ledgers, a process that is slow, error-prone, and a recurring source of parent–school disputes. Existing products (Zeraki Finance, Cloud School System, ShulePro, EBingwa) solve payment collection but tend to be shallow on real accounting and audit trails. EduConnect KE's advantage is a proper double-entry ledger underneath a simple bursar UI, with everything traceable for board and Ministry of Education audits.

Building the records-and-reporting core first means that when integrations land in Phase 2, they simply become new *sources* of the same `payment` records the module already understands.

---

## 3. Goals & success metrics

| Goal | Success metric |
|------|----------------|
| Eliminate manual fee ledgers | 100% of fee transactions recorded in-system per term |
| Accurate, real-time balances | Student balance recomputes instantly on any invoice/payment/adjustment |
| Audit-readiness | Every financial record has an immutable audit trail entry |
| Fast receipting | Bursar records a payment and issues a receipt in < 30 seconds |
| Transparent statements | Any student statement generated on demand as a printable/exportable PDF |
| Kenyan fit | Voteheads, termly/annual structures, and balance-clearing logic match local practice |

---

## 4. Scope

### 4.1 In scope (Phase 1)
- Votehead (fee category) management
- Fee structure definitions (per class/stream/term/year, boarding vs day)
- Student invoicing / billing (individual and batch)
- Manual payment recording (cash, cheque, bank slip, manually-keyed M-Pesa ref)
- Automatic and manual payment allocation to voteheads (priority or ratio)
- Receipting (digital, printable)
- Discounts, waivers, bursaries, scholarships, and sponsor tracking
- Credit notes and adjustments
- Balances & arrears tracking
- Student fee statements
- Financial reports & dashboards
- Double-entry ledger (internal)
- Audit trail / activity logs
- Role-based access control

### 4.2 Explicitly out of scope (deferred to Phase 2+)
- M-Pesa Daraja integration (C2B, STK Push, reconciliation)
- Bank integrations / statement feeds
- Card payments
- Outbound SMS / WhatsApp / email notifications
- Parent-initiated online payments
- Payroll
- Procurement / supplier management
- Full general-expense accounting (only fee-side ledger in Phase 1; a lightweight expense register may be included as optional — see §7.9)
- Installment financing / fee loans

### 4.3 Dependencies (existing EduConnect KE modules)
This module **reuses**, and must not duplicate, these existing entities:
- `schools` (tenant root)
- `students` (admission number, name, class, stream, boarding status)
- `guardians` / parents (linked to students)
- `academic_years` and `terms`
- `classes`, `streams`, `grade_levels`
- User accounts & authentication (roles)

If any of the above do not yet exist in EduConnect, they are prerequisites for this module.

---

## 5. User roles & permissions

| Role | Capabilities in this module |
|------|-----------------------------|
| **Super Admin** (Total Man / platform) | All schools; configuration; support access; audit review |
| **School Admin / Principal** | Full read on finances; approve fee structures, bursaries, waivers; view all reports; cannot be the sole editor of postings (segregation of duties) |
| **Bursar / Accountant** | Create voteheads & fee structures, generate invoices, record payments, issue receipts, apply discounts within limits, run reports |
| **Class Teacher** (optional, read-only) | View fee balances for own class/stream only (for follow-up), no editing |
| **Parent / Guardian** (read-only portal) | View own children's invoices, payments, balances, and statements; download receipts. No payment action in Phase 1. |
| **Auditor** (read-only) | Read all financial records and audit logs; export; no edit rights |

Permissions are enforced at the API and database layer (Postgres Row-Level Security), not just the UI.

---

## 6. Personas

- **Bursar Jane** — runs the finance office at a mixed day/boarding secondary school, ~800 students. Needs to invoice a whole class in one action, record 40+ payments a day fast, and never lose track of who owes what. Moderate tech skill.
- **Principal Otieno** — wants a live dashboard of expected vs collected fees this term, arrears by class, and clean statements when the board or auditor asks. Low tolerance for figures that don't reconcile.
- **Parent Wanjiru** — wants to see, on her phone, exactly what she owes for each child, broken down by votehead, and download a receipt after paying. Pays offline (bank/M-Pesa) and the bursar records it.

---

## 7. Functional requirements

Requirements are labelled **FR-x.y**. Each carries a priority: **P0** (must have for launch), **P1** (should have), **P2** (nice to have).

### 7.1 Votehead management

Voteheads are named, accountable fee categories (Tuition, Boarding, Lunch, Transport, Activity, Exam, Development Fund, Lab, etc.).

- **FR-1.1 (P0)** Create, edit, archive voteheads scoped to the school.
- **FR-1.2 (P0)** Each votehead has: name, code, description, type (`mandatory` | `optional`), applies-to (`all` | `boarders` | `day` | `custom-group`), active flag.
- **FR-1.3 (P0)** Voteheads cannot be hard-deleted once used in any fee structure or invoice; only archived (soft-delete) to preserve history.
- **FR-1.4 (P1)** Ship a default Kenyan votehead set on school setup (Tuition, Boarding, Lunch, Transport, Activity, Exam, Development, Uniform, Books) that the school can edit.
- **FR-1.5 (P1)** Optional GL account mapping per votehead (for the internal ledger and future accounting export).

### 7.2 Fee structures

A fee structure defines *how much* is charged, for *which students*, in *which period*.

- **FR-2.1 (P0)** Create a fee structure scoped to: academic year, term, and a target (whole school, a class, a stream, a grade level, or boarding/day status).
- **FR-2.2 (P0)** A fee structure is composed of line items, each = one votehead + amount.
- **FR-2.3 (P0)** Support **termly** and **annual** structures. An annual structure can auto-split into per-term charges (equal split or custom per-term amounts).
- **FR-2.4 (P0)** Support differentiated amounts by class/stream and by boarder vs day scholar (e.g. boarders pay Boarding + Lunch; day scholars pay Lunch only).
- **FR-2.5 (P1)** Clone a previous term/year structure as the starting point for a new one.
- **FR-2.6 (P1)** Version fee structures: editing a published structure creates a new version; already-issued invoices are not retroactively changed unless explicitly re-billed.
- **FR-2.7 (P0)** Draft → Published states. Only Published structures can generate invoices. Publishing requires School Admin approval (configurable).

### 7.3 Invoicing / billing

- **FR-3.1 (P0)** Generate an invoice for a single student from the applicable published fee structure.
- **FR-3.2 (P0)** **Batch-generate** invoices for an entire class, stream, grade, or whole school for a given term in one action, respecting each student's boarding/day status and any custom group membership.
- **FR-3.3 (P0)** An invoice contains: student, term/year, issue date, due date, line items (votehead + amount), subtotal, adjustments, total payable, amount paid, balance, status.
- **FR-3.4 (P0)** Invoice statuses: `draft`, `issued`, `partially_paid`, `paid`, `overdue`, `cancelled`, `credited`.
- **FR-3.5 (P0)** Add ad-hoc custom line items to an individual invoice (e.g. "Lost library book — 500", "Broken window — 300") outside the standard structure.
- **FR-3.6 (P1)** Carry-forward: when generating a new term's invoice, the prior term's unpaid balance is carried as an opening balance line (configurable on/off).
- **FR-3.7 (P0)** Prevent duplicate invoicing: a student cannot be double-invoiced for the same fee structure + term unless the earlier invoice was cancelled.
- **FR-3.8 (P1)** Bulk cancel / re-issue with mandatory reason and audit entry.
- **FR-3.9 (P0)** Every invoice has a unique, human-readable number (e.g. `INV-2026-T1-000842`) that is sequential per school.

### 7.4 Payment recording (manual, no external integration)

- **FR-4.1 (P0)** Bursar records a payment against a student with: date, amount, method (`cash` | `cheque` | `bank_deposit` | `mpesa_manual` | `bank_transfer` | `other`), reference/slip number, payer name, narration, receiving user.
- **FR-4.2 (P0)** `mpesa_manual` and `bank_deposit` capture a free-text reference (the M-Pesa code or bank slip number) purely as a record — **no API call, no validation against Safaricom/bank**. This is a keyed record only.
- **FR-4.3 (P0)** A payment is linked to a student, not directly to one invoice, so it can settle across multiple invoices/voteheads.
- **FR-4.4 (P0)** **Allocation logic** — when a payment is received, allocate it across outstanding voteheads/invoices by one of:
  - **Priority order** — clear voteheads in a configured priority sequence (e.g. Tuition first, then Boarding, then others), oldest invoice first.
  - **Ratio (pro-rata)** — distribute proportionally across outstanding voteheads.
  - **Manual** — bursar explicitly assigns amounts per votehead/invoice.
  The default method is configurable per school (default: priority, oldest-first).
- **FR-4.5 (P0)** Handle **overpayment**: excess becomes a credit balance on the student account, usable against future invoices.
- **FR-4.6 (P0)** Handle **partial payment**: invoice moves to `partially_paid`; balance recalculated.
- **FR-4.7 (P1)** Reverse/void a payment with mandatory reason; reversal is a new ledger entry (never a hard delete), and any receipt is marked void.
- **FR-4.8 (P0)** Prevent negative payments; enforce amount > 0.
- **FR-4.9 (P1)** Suspense/unallocated holding: a payment can be recorded and held unallocated if the bursar is unsure which student it belongs to, then allocated later. (This is the manual precursor to Phase-2 auto-reconciliation.)

### 7.5 Receipting

- **FR-5.1 (P0)** Every recorded payment generates a digital receipt with: unique receipt number, school header/logo, student name & admission no., date, amount in figures and words, method, reference, votehead breakdown of how the payment was allocated, resulting balance, and issuing officer.
- **FR-5.2 (P0)** Receipts are printable and exportable to PDF.
- **FR-5.3 (P0)** Receipt numbers are sequential per school and immutable.
- **FR-5.4 (P1)** Voided payment ⇒ receipt is watermarked/void and excluded from totals.
- **FR-5.5 (P2)** Reprint log: track each time a receipt is reprinted (who/when).

### 7.6 Discounts, waivers, bursaries & sponsors

- **FR-6.1 (P0)** Apply a discount or waiver to a student's invoice: type (`percentage` | `fixed`), scope (specific votehead or whole invoice), reason, approving user.
- **FR-6.2 (P0)** Bursaries/scholarships: define a **sponsor** (e.g. CDF, County Bursary, NGO, individual, school scholarship) with contact details.
- **FR-6.3 (P0)** Award a bursary to a student for a term/year: amount or percentage, sponsor, voteheads covered, award reference.
- **FR-6.4 (P0)** A bursary award reduces the student's payable balance and appears distinctly on statements (so parents see "Bursary — County of Uasin Gishu: 10,000").
- **FR-6.5 (P1)** Sponsor report: total awarded per sponsor per term, list of beneficiaries.
- **FR-6.6 (P1)** Approval workflow & per-role discount ceilings (e.g. bursar may waive up to KES 2,000; above that needs Principal approval).
- **FR-6.7 (P1)** Credit notes: issue a credit note against an invoice (e.g. student left mid-term) with reason and audit trail.

### 7.7 Balances & arrears

- **FR-7.1 (P0)** Real-time student balance = Σ(invoiced) − Σ(payments allocated) − Σ(discounts/bursaries/credits). Recomputed on every relevant write.
- **FR-7.2 (P0)** Balance viewable per student, per votehead, per term, and cumulatively (all-time).
- **FR-7.3 (P0)** Arrears list: filter students with outstanding balances by class, stream, term, amount threshold, boarding status.
- **FR-7.4 (P1)** Aging buckets for arrears (current term, 1 term overdue, 2+ terms overdue).
- **FR-7.5 (P1)** Flag/clearance status: mark a student as "cleared" for exams/reporting when balance ≤ configurable threshold.

### 7.8 Student fee statement

- **FR-8.1 (P0)** Generate a per-student statement showing chronological entries: opening balance, invoices (with votehead breakdown), payments (with receipt ref), discounts, bursaries, credits, and running balance.
- **FR-8.2 (P0)** Filter statement by term or date range; show closing balance.
- **FR-8.3 (P0)** Export/print statement as PDF with school branding.
- **FR-8.4 (P1)** Parent portal view of the same statement (read-only) for their own children.

### 7.9 Expense register (optional, lightweight — P2)

*Included only to make reports meaningful; not full accounting.*
- **FR-9.1 (P2)** Record simple expense entries (date, category, amount, payee, narration) so cashflow reports reflect money out as well as in.
- **FR-9.2 (P2)** Expense categories are user-defined.
- This is optional and can be dropped from Phase 1 without affecting the fee lifecycle.

### 7.10 Reports & dashboards

All reports are exportable to **PDF and Excel/CSV** and are strictly read-only computations over the ledger.

- **FR-10.1 (P0) Fee Collection Summary** — expected vs collected vs outstanding for a term, per school and per class.
- **FR-10.2 (P0) Arrears / Outstanding Balances Report** — by class, stream, student, term, with totals.
- **FR-10.3 (P0) Daily Collections Report** — all payments recorded on a date/date-range, by method, with receiving officer (for cash-up/reconciliation).
- **FR-10.4 (P0) Votehead Collection Report** — collected vs expected per votehead (how much tuition vs boarding etc. has come in).
- **FR-10.5 (P1) Revenue Analysis** — expected, realized, and unrealized revenue per term.
- **FR-10.6 (P1) Discounts & Bursaries Report** — total concessions given, by type and sponsor.
- **FR-10.7 (P1) Student Statement Batch** — generate statements for a whole class at once (e.g. to send home at term end).
- **FR-10.8 (P0) Dashboard** — live tiles: total expected this term, total collected, collection rate %, outstanding, top arrears classes, recent payments feed.
- **FR-10.9 (P1) Cashflow Summary** — money in (fees) vs money out (expenses, if §7.9 enabled) over a period.
- **FR-10.10 (P2)** Saved/scheduled report definitions.

### 7.11 Audit trail & data integrity

- **FR-11.1 (P0)** Every create/update/void on financial records writes an immutable audit log entry: actor, timestamp, action, entity, before/after snapshot.
- **FR-11.2 (P0)** Financial records use soft-delete/void semantics — no hard deletes of invoices, payments, receipts, or ledger entries.
- **FR-11.3 (P0)** The internal ledger is **append-only** double-entry (see §9). Corrections are made by reversing entries, not edits.
- **FR-11.4 (P1)** Audit log is viewable/filterable by Admin and Auditor roles and exportable.

---

## 8. Data model (PostgreSQL / Supabase)

Multi-tenant by `school_id` on every table, enforced with Row-Level Security. Money stored as integer **cents (KES × 100)** to avoid floating-point errors, or `numeric(14,2)` — pick one convention and enforce it (recommendation: `numeric(14,2)` for readability, with all arithmetic done in SQL/decimal, never JS floats).

### 8.1 Entity relationship overview

```
schools ──┬── voteheads
          ├── fee_structures ──── fee_structure_items ──── voteheads
          ├── students (existing) ──┬── invoices ──── invoice_line_items ──── voteheads
          │                         ├── payments ──── payment_allocations ──── invoice_line_items
          │                         ├── receipts
          │                         ├── adjustments (discounts/waivers/credits)
          │                         └── bursary_awards ──── sponsors
          ├── ledger_entries (append-only, double-entry)
          └── audit_logs
```

### 8.2 Core tables (illustrative schema)

```sql
-- Fee categories
create table voteheads (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references schools(id),
  name          text not null,
  code          text not null,
  description   text,
  type          text not null check (type in ('mandatory','optional')),
  applies_to    text not null default 'all'
                check (applies_to in ('all','boarders','day','custom')),
  gl_account    text,                       -- optional, for internal ledger
  priority      int  not null default 100,  -- for priority allocation
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (school_id, code)
);

-- Fee structure header
create table fee_structures (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references schools(id),
  name           text not null,
  academic_year  int  not null,
  term           int  not null check (term between 1 and 3),
  cadence        text not null check (cadence in ('termly','annual')),
  target_type    text not null check (target_type in
                    ('school','grade','class','stream','boarding_status','custom')),
  target_ref     text,                       -- id or code of the target
  boarding_scope text check (boarding_scope in ('all','boarders','day')),
  status         text not null default 'draft'
                 check (status in ('draft','published','archived')),
  version        int  not null default 1,
  created_by     uuid not null,
  approved_by    uuid,
  created_at     timestamptz not null default now()
);

create table fee_structure_items (
  id                uuid primary key default gen_random_uuid(),
  fee_structure_id  uuid not null references fee_structures(id),
  votehead_id       uuid not null references voteheads(id),
  amount            numeric(14,2) not null check (amount >= 0)
);

-- Invoices
create table invoices (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references schools(id),
  student_id     uuid not null references students(id),
  invoice_no     text not null,
  academic_year  int  not null,
  term           int  not null,
  fee_structure_id uuid references fee_structures(id),
  issue_date     date not null default current_date,
  due_date       date,
  status         text not null default 'issued'
                 check (status in
                   ('draft','issued','partially_paid','paid','overdue','cancelled','credited')),
  opening_balance numeric(14,2) not null default 0,  -- carried forward
  created_by     uuid not null,
  created_at     timestamptz not null default now(),
  unique (school_id, invoice_no)
);

create table invoice_line_items (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   uuid not null references invoices(id),
  votehead_id  uuid references voteheads(id),
  description  text not null,              -- votehead name or custom label
  amount       numeric(14,2) not null check (amount >= 0),
  is_custom    boolean not null default false
);

-- Payments (manual only in Phase 1)
create table payments (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references schools(id),
  student_id    uuid references students(id),   -- nullable => suspense/unallocated
  amount        numeric(14,2) not null check (amount > 0),
  method        text not null check (method in
                  ('cash','cheque','bank_deposit','bank_transfer','mpesa_manual','other')),
  reference     text,                            -- slip/M-Pesa code, manual entry
  payer_name    text,
  narration     text,
  paid_on       date not null default current_date,
  status        text not null default 'active'
                check (status in ('active','voided','unallocated')),
  recorded_by   uuid not null,
  created_at    timestamptz not null default now()
);

create table payment_allocations (
  id                    uuid primary key default gen_random_uuid(),
  payment_id            uuid not null references payments(id),
  invoice_line_item_id  uuid references invoice_line_items(id),
  invoice_id            uuid references invoices(id),
  votehead_id           uuid references voteheads(id),
  amount                numeric(14,2) not null check (amount > 0)
);

-- Receipts
create table receipts (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid not null references schools(id),
  payment_id   uuid not null references payments(id),
  receipt_no   text not null,
  issued_by    uuid not null,
  issued_at    timestamptz not null default now(),
  is_void      boolean not null default false,
  unique (school_id, receipt_no)
);

-- Discounts, waivers, credit notes
create table adjustments (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid not null references schools(id),
  student_id   uuid not null references students(id),
  invoice_id   uuid references invoices(id),
  votehead_id  uuid references voteheads(id),   -- null => whole invoice
  kind         text not null check (kind in ('discount','waiver','credit_note')),
  calc         text not null check (calc in ('percentage','fixed')),
  value        numeric(14,2) not null,
  amount       numeric(14,2) not null,          -- resolved KES amount
  reason       text not null,
  approved_by  uuid,
  created_by   uuid not null,
  created_at   timestamptz not null default now()
);

-- Sponsors & bursaries
create table sponsors (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references schools(id),
  name       text not null,
  type       text check (type in ('cdf','county','ngo','individual','school','other')),
  contact    text
);

create table bursary_awards (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references schools(id),
  student_id    uuid not null references students(id),
  sponsor_id    uuid not null references sponsors(id),
  academic_year int not null,
  term          int,
  calc          text not null check (calc in ('percentage','fixed')),
  value         numeric(14,2) not null,
  amount        numeric(14,2) not null,
  voteheads     uuid[],                          -- covered voteheads, null => all
  reference     text,
  awarded_by    uuid not null,
  created_at    timestamptz not null default now()
);

-- Append-only double-entry ledger (internal source of truth for reports)
create table ledger_entries (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid not null references schools(id),
  student_id   uuid references students(id),
  txn_group    uuid not null,                    -- groups the debit+credit legs
  entry_date   date not null default current_date,
  account      text not null,                    -- e.g. 'AR', 'FEE_INCOME', 'BURSARY', 'CASH'
  debit        numeric(14,2) not null default 0,
  credit       numeric(14,2) not null default 0,
  votehead_id  uuid references voteheads(id),
  source_type  text,                             -- 'invoice'|'payment'|'adjustment'|'bursary'|'reversal'
  source_id    uuid,
  narration    text,
  created_by   uuid not null,
  created_at   timestamptz not null default now()
);

-- Audit trail
create table audit_logs (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools(id),
  actor_id    uuid not null,
  action      text not null,                      -- 'create'|'update'|'void'|'cancel'
  entity      text not null,
  entity_id   uuid,
  before      jsonb,
  after       jsonb,
  created_at  timestamptz not null default now()
);
```

### 8.3 Key integrity rules
- Σ(`payment_allocations.amount`) for a payment must equal `payments.amount` unless the payment is (partly) unallocated/suspense.
- Each financial event writes **balanced** ledger entries (Σdebit = Σcredit per `txn_group`).
- Student balance is derived from the ledger (or a materialized view), never stored as an editable field.
- All money mutations happen inside Postgres transactions / RPC functions so partial writes cannot corrupt balances.

### 8.4 RLS (multi-tenancy)
Every table has a policy of the form: a user may access rows where `school_id` matches their session's school claim, further narrowed by role (e.g. class teacher restricted to their class's students; parent restricted to their linked children). Enforce at the DB, not just the API.

---

## 9. Accounting logic (internal double-entry)

Even though there's no external integration, the ledger keeps everything reconcilable. Illustrative postings:

| Event | Debit | Credit |
|-------|-------|--------|
| Invoice issued (per votehead) | Accounts Receivable | Fee Income (votehead) |
| Payment recorded | Cash/Bank (control) | Accounts Receivable |
| Discount / waiver | Fee Income (contra) | Accounts Receivable |
| Bursary award | Bursary Income / Receivable (sponsor) | Accounts Receivable |
| Credit note | Fee Income (contra) | Accounts Receivable |
| Payment reversal | Accounts Receivable | Cash/Bank |

This makes the Fee Collection Summary, arrears, and votehead reports fall out of the ledger cleanly and audit-provably.

---

## 10. Balance-clearing algorithm (allocation)

When a payment of amount `P` is recorded for a student with outstanding line items:

**Priority mode (default):**
1. Fetch outstanding invoice line items, ordered by (invoice issue_date ASC, votehead.priority ASC).
2. Iterate; allocate `min(P_remaining, line_outstanding)` to each until `P_remaining = 0`.
3. If `P_remaining > 0` after all lines cleared ⇒ record as **credit balance** (overpayment).

**Ratio mode:**
1. Compute total outstanding `T` across current voteheads.
2. Allocate to each votehead `P × (line_outstanding / T)`, rounding, with the remainder cent assigned to the highest-priority line.

**Manual mode:**
Bursar enters the split explicitly; system validates Σ = P.

All three write `payment_allocations` rows and corresponding ledger entries.

---

## 11. User flows

### 11.1 Term setup (Bursar/Admin)
1. Confirm academic year & term (from existing module).
2. Create/clone fee structures per class & boarding status.
3. Publish (Admin approves).
4. Batch-generate invoices for all target students.
5. Review invoice run summary; handle exceptions.

### 11.2 Recording a payment (Bursar)
1. Search student by name/admission no.
2. See current balance & votehead breakdown.
3. Click "Record Payment" → enter amount, method, reference, payer, date.
4. Choose allocation (default priority auto-applied; can switch to manual).
5. Save → receipt generated → print/download PDF.

### 11.3 Parent viewing balance (Parent portal)
1. Log in → select child.
2. View current balance and votehead breakdown.
3. Open full statement; download receipt(s) as PDF.
*(No payment action in Phase 1.)*

### 11.4 End-of-term reporting (Admin)
1. Open dashboard → collection rate, arrears.
2. Run Fee Collection Summary + Arrears Report.
3. Batch-generate class statements to print/send home.
4. Export for board/auditor.

---

## 12. Non-functional requirements

- **NFR-1 Stack:** Next.js (App Router) frontend, Supabase (Postgres + Auth + RLS). Server-side money computations only.
- **NFR-2 Offline-first (P1):** Bursar payment-recording and student lookup should work as a PWA with local queueing and sync on reconnect (many schools have unreliable connectivity). Conflict resolution: server is authoritative; queued receipts get their final number on sync.
- **NFR-3 Performance:** Batch-invoicing 1,000 students completes < 30s; student balance query < 200ms; report generation < 5s for a typical school.
- **NFR-4 Security:** RLS on all tables; least-privilege roles; all financial writes via transactional RPCs; no client-side trust for amounts.
- **NFR-5 Auditability:** Append-only ledger + audit_logs; no destructive deletes.
- **NFR-6 Data precision:** `numeric(14,2)`; never use JS floats for money; round half-up consistently.
- **NFR-7 Localization:** English + Kiswahili UI labels; KES currency formatting; Kenyan date format.
- **NFR-8 Multi-tenancy:** every query scoped by `school_id`; no cross-tenant leakage.
- **NFR-9 Backups:** daily automated Postgres backups; point-in-time recovery enabled.
- **NFR-10 Accessibility:** works on low-end Android browsers; printable layouts.

---

## 13. UI / screens inventory

1. Finance Dashboard (tiles + recent payments feed)
2. Voteheads (list, create/edit)
3. Fee Structures (list, builder, publish/approve)
4. Invoicing (single + batch, run summary, exceptions)
5. Student Finance Profile (balance, invoices, payments, statement, actions)
6. Record Payment (modal/page with allocation preview)
7. Receipt view/print
8. Discounts & Bursaries (apply, sponsors, awards)
9. Arrears / Outstanding list (filters, export)
10. Reports hub (all reports in §7.10 with filters + export)
11. Audit log viewer (Admin/Auditor)
12. Parent portal — child fee view + statement/receipt download
13. Settings — default allocation mode, discount ceilings, clearance threshold, receipt/invoice numbering, currency/locale

---

## 14. Acceptance criteria (samples)

- **AC-1:** Batch-invoicing a class of 50 boarders and 30 day scholars produces 80 invoices with correct votehead sets per boarding status, no duplicates, unique sequential numbers.
- **AC-2:** Recording a KES 15,000 payment against a student owing Tuition 20,000 + Boarding 5,000 (priority mode) fully clears Tuition and leaves Boarding at 5,000 owing; receipt shows the exact split; balance = 10,000.
- **AC-3:** An overpayment leaves a positive credit balance that auto-applies to the next invoice generated.
- **AC-4:** Voiding a payment reverses the ledger, marks the receipt void, removes it from Daily Collections totals, and writes an audit entry — with no row hard-deleted.
- **AC-5:** A parent can only ever see their own children's records; attempting another student's URL returns nothing (RLS).
- **AC-6:** Fee Collection Summary's "collected" equals the sum of active (non-void) allocations for the term, and reconciles to the ledger's cash-side total.
- **AC-7:** A bursary award reduces payable balance and appears as a distinct, labelled line on the student statement.

---

## 15. Phased roadmap

| Phase | Contents |
|-------|----------|
| **Phase 1 (this PRD)** | Voteheads, fee structures, invoicing, manual payments, allocation, receipting, discounts/bursaries, balances/arrears, statements, reports, ledger, audit, roles, parent read-only portal. **No external integrations.** |
| **Phase 2** | M-Pesa Daraja (C2B auto-posting by admission no., STK Push, reversals), bank integrations, auto-reconciliation + suspense matching. |
| **Phase 3** | SMS + WhatsApp Cloud API statements/reminders, parent self-service payment, installment plans. |
| **Phase 4** | Payroll, full expense/procurement accounting, KRA-aligned exports, cross-module analytics with EduConnect academics. |

Phase 1 is architected so Phase 2 payment channels become *additional sources* writing the same `payments`/`ledger_entries` records — no rework of the core.

---

## 16. Open questions

1. Do the existing EduConnect `students`, `terms`, and `guardians` tables already expose boarding status and guardian-student links this module needs?
2. Is segregation of duties (bursar posts, admin approves) required at launch or configurable off for small schools?
3. Should carry-forward balances be on by default nationally, or per-school setting?
4. Preferred money storage: `numeric(14,2)` vs integer cents — confirm one convention for the whole platform.
5. Is the lightweight expense register (§7.9) in or out for Phase 1?

---

*End of document.*

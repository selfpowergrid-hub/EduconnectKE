# Plan — In-App Help & Onboarding System (LogiQ-Taaluma)

**Status:** approved concept, not yet implemented.
**Goal:** let a brand-new school set itself up and learn the app **without human training** — with the *Getting Started* setup flow as the centrepiece.
**Audience:** any implementing model. Follow repo conventions:
- React + Vite, **inline styles** (no CSS framework), **no new heavy dependencies** (build the small help widgets by hand — the repo deliberately avoids adding libs).
- Supabase: new SQL in **new idempotent migrations**; RLS via `is_school_admin(school_id)`; cross-role reads via `SECURITY DEFINER` RPCs.
- **Test locally, then wait for an explicit push instruction.** Migrations are run by the user; edge functions/deploys are push-equivalent.
- One commit per phase; `npx vite build` must pass before each commit.

---

## The problem & the strategy

Onboarding a school today needs a human to explain: fill School Information → set levels/term/year → add streams & dorms → add subjects → set the grading system → admit students → set up exams → (Accounts) build the fee structure. Those steps have **dependencies and an order**, which is exactly what people get wrong.

Four pillars, in priority order:

1. **Getting Started checklist** (highest ROI) — an ordered, **self-detecting** setup guide. It knows what's already done by reading the school's data, shows progress, and deep-links each step to the exact page/tab. This alone removes most training.
2. **Contextual help** — a "?" on every page opening a short "what / why / how", plus field tooltips and friendly **empty states** ("No streams yet — here's how").
3. **Guided tours** — optional interactive walkthroughs that highlight real UI for the few complex screens (fee structure, exam entry, grading).
4. **Help Center + Ask for Help** — a searchable in-app knowledge base (articles + FAQs), **plus an "Ask for Help" channel** the user can open from anywhere to send a question to the LogiQ-Taaluma team.

Everything is **module-scoped and role-aware**:
- **Module scope (Exams vs Accounts):** the app runs two modules. Help follows the module the admin is currently in — Exams help in the Exams module, finance help in the Accounts module — while shared foundations (School Information, streams, students) surface in both. This is a first-class dimension, not an afterthought (see "Module scoping" below).
- **Role scope:** admins get setup help; teachers get marks-entry help; bursars/accountants get finance help; parents get portal help.

---

## Verified schema hooks (for auto-detection)

These tables already exist and are RLS-scoped to the school; the onboarding detector reads counts from them:

| Setup step | Table(s) to check | "Done" when |
|---|---|---|
| School Information | `school_information` (by `school_id`) | row exists with name/contact populated |
| Academic setup | `school_registrations` | `school_type` set (always true post-registration) + term/year present |
| Streams | `streams` | ≥ 1 row |
| Dorms (optional) | `dorms` | ≥ 1 row (optional — boarding schools only) |
| Subjects | `subjects` | ≥ 1 row |
| Grading system | `grading_systems` | ≥ 1 row for the school's level(s) |
| Students | `students` | ≥ 1 row |
| Staff & teacher logins | `staff` | ≥ 1 row (bonus: ≥1 with `auth_user_id`) |
| Exams | `exams` | ≥ 1 row |
| Fee structure (Accounts) | `voteheads` + `fee_structures` | ≥1 votehead and ≥1 published `fee_structures` row |
| Share school code | `school_registrations.school_code` | always present (informational step) |

All confirmed present in this codebase (streams/dorms/subjects/grading_systems/students/staff/exams/school_information are in the base schema; voteheads/fee_structures in `20260613_fees_backend_and_parent_lookup.sql`).

---

## Phase 1 — Getting Started checklist (build first)

### 1.1 DB: one RPC that returns setup status

`supabase/migrations/<ts>_onboarding_status.sql` (idempotent, `SECURITY DEFINER`, `search_path=public`, granted to `authenticated`):

```sql
CREATE OR REPLACE FUNCTION public.get_onboarding_status(p_school_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE r JSONB;
BEGIN
  -- Only the school's own admin may read its status.
  IF NOT public.is_school_admin(p_school_id) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  SELECT jsonb_build_object(
    'school_info',   EXISTS(SELECT 1 FROM school_information WHERE school_id = p_school_id),
    'streams',       (SELECT count(*) FROM streams  WHERE school_id = p_school_id),
    'dorms',         (SELECT count(*) FROM dorms    WHERE school_id = p_school_id),
    'subjects',      (SELECT count(*) FROM subjects WHERE school_id = p_school_id),
    'grading',       (SELECT count(*) FROM grading_systems WHERE school_id = p_school_id),
    'students',      (SELECT count(*) FROM students WHERE school_id = p_school_id),
    'staff',         (SELECT count(*) FROM staff    WHERE school_id = p_school_id),
    'staff_logins',  (SELECT count(*) FROM staff    WHERE school_id = p_school_id AND auth_user_id IS NOT NULL),
    'exams',         (SELECT count(*) FROM exams    WHERE school_id = p_school_id),
    'voteheads',     (SELECT count(*) FROM voteheads WHERE school_id = p_school_id),
    'fee_structures',(SELECT count(*) FROM fee_structures WHERE school_id = p_school_id AND status = 'published')
  ) INTO r;
  RETURN r;
END $$;
GRANT EXECUTE ON FUNCTION public.get_onboarding_status(UUID) TO authenticated;
```

(One round-trip; RLS-safe. Implementer: verify each column name against the live schema before finalizing — e.g. `fee_structures.status` value, `staff.auth_user_id`.)

### 1.2 Central step definition — `src/lib/onboardingSteps.js` (new)

An ordered array of steps, each with: `id`, `title`, `blurb` (1 line), `why` (1 line), `nav` (target module + nav id + optional settings tab), `module` (`'exams' | 'accounts' | 'both'`), `optional` (bool), and `done(status)` predicate reading the RPC JSON. Example entry:

```js
{ id: 'streams', title: 'Add streams', module: 'both',
  blurb: 'Create your class streams (e.g. 10A, 10B).',
  why: 'Students are placed in streams; exams and fees can be filtered by them.',
  nav: { module: 'exams', navId: 'streams', tab: 'streams' },
  done: (s) => (s.streams ?? 0) > 0 }
```

Order: school_info → academic (implicit/done) → streams → (dorms, optional) → subjects → grading → students → staff → exams → [accounts:] voteheads/fee_structures → share code. Filter by the school's active modules (`accounts` steps only if the Accounts module is on).

**Module split (required).** The checklist is grouped/filtered by module so it matches where the admin is:
- **Foundations** (shown in both): School Information, Academic setup, Streams, Dorms, Students, Staff & logins, Share school code.
- **Exams module:** Subjects, Grading system, Exams (+ report cards/marksheets pointers).
- **Accounts module:** Voteheads, Fee structure (+ pointers to banking/payroll/final accounts).

`onboardingSteps.js` already carries `module: 'exams' | 'accounts' | 'both'` per step. `GettingStarted` accepts the **active module** and shows Foundations + that module's steps; if the school has both modules, offer a small toggle ("Exams setup / Accounts setup") so progress can be read per module. The dashboard `OnboardingWidget` shows the next step **for the current module**.

### 1.3 Components

- **`src/pages/GettingStarted.jsx`** — full checklist page: progress bar ("4 of 9 done"), each step as a row (check/circle, title, blurb, why, and a **"Set up →"** button that navigates to `nav`). Completed steps collapse/tick green. Uses the RPC on mount; a "Refresh" re-checks.
- **`src/components/help/OnboardingWidget.jsx`** — compact dashboard card: progress ring + "Next: Add streams" + button. Hidden once 100% complete; **dismissible** (stored per user in `localStorage` key `onboarding_dismissed_<schoolId>`), with a way to reopen from the Help menu.
- **Navigation wiring:** reuse the existing nav/tab mechanism. `GettingStarted` receives an `onNavigate(module, navId, tab)` prop; App maps it to `setActiveModule` / `setActiveTab` / Settings `initialTab` (the same path `activeNavLink?.tab` already uses). Verify how App switches module + page + settings tab and reuse it — do **not** invent a new router.

### 1.4 Placement

- Add **"Getting Started"** as the first item in the admin nav (both modules), with a small badge = number of incomplete steps. Hide the badge/item once complete (keep it reachable from Help).
- Auto-render `OnboardingWidget` at the top of the **Dashboard** until complete or dismissed.

### 1.5 Acceptance (Phase 1)

- A fresh school sees "0 of N done"; each "Set up →" lands on the correct page/tab.
- Adding a stream and returning flips the Streams step to ✓ (after Refresh or re-mount).
- Accounts-only steps appear only when the Accounts module is active.
- Non-admins never see it (RPC rejects; nav item hidden for non-admin roles).
- `vite build` clean.

---

## Phase 2 — Contextual help framework

### 2.1 Content registry — `src/lib/helpContent.js` (new)

A plain-JS map keyed by a stable `pageId` (and role where needed):

```js
export const HELP = {
  'settings.streams': {
    title: 'Streams & Dorms',
    what: 'Streams are the classes within a grade (10A, 10B). Dorms are boarding houses.',
    why: 'Every student belongs to a stream; boarders are billed boarder fees.',
    steps: ['Click Add Stream', 'Name it (e.g. 10A) and set capacity', 'Repeat for each class'],
    tips: ['Streams are school-wide — you create them once.'],
    related: ['students.admit', 'fees.structure'],
  },
  // …one entry per page/tab
};
```

Keep content in code (versioned, no DB round-trip). A later enhancement can move it to a DB table if schools need editable content.

**Module tag:** every entry carries `module: 'exams' | 'accounts' | 'both'`. The HelpDrawer, the Help Center, and search all **filter by the active module** so an admin in Accounts isn't shown exam-entry help and vice-versa (shared entries tagged `'both'`).

### 2.2 Components

- **`src/components/help/HelpButton.jsx`** — a "?" button placed in the header (receives the current `pageId`). Opens…
- **`src/components/help/HelpDrawer.jsx`** — a right-side slide-over rendering the `HELP[pageId]` content (what / why / steps / tips / related links + a "Take the tour" button if a tour exists for the page). Reuses the modal/overlay pattern already in the app.
- **`src/components/help/HelpTip.jsx`** — a small inline "ⓘ" that shows a tooltip on hover/focus for individual fields (e.g. next to "Paybill Number").
- **`src/components/common/EmptyState.jsx`** — a friendly empty-state block (icon, one-line explanation, primary CTA). Replace bare "No data" placeholders on the list pages (Students, Streams, Subjects, Exams, Fees, Suppliers, Payroll, etc.).

### 2.3 Wiring

- The main `Header` already exists — add `HelpButton` next to the avatar, passing the active page's `pageId` (derive from `activeNavLink`). Teacher/parent shells get their own help keys.
- Add `pageId` help to each major page incrementally; empty states first (highest visible value).

### 2.5 "Ask for Help" — request channel from anywhere (required)

When the built-in help doesn't cover a user's situation, they must be able to **ask a real person from any screen**. This lives in the header Help menu on every page (admin, teacher, and a slim variant in the parent portal).

**DB (`supabase/migrations/<ts>_help_requests.sql`, idempotent):**

```sql
CREATE TABLE IF NOT EXISTS help_requests (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID REFERENCES school_registrations(id) ON DELETE SET NULL,
  user_id     UUID,                 -- auth.uid() when signed in (null for parents)
  role        TEXT,                 -- admin | teacher | bursar | accountant | auditor | parent
  module      TEXT,                 -- exams | accounts | portal | other
  page        TEXT,                 -- the pageId / route they were on
  message     TEXT NOT NULL,
  contact     TEXT,                 -- email or phone to reply on
  status      TEXT NOT NULL DEFAULT 'open',   -- open | in_progress | closed
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE help_requests ENABLE ROW LEVEL SECURITY;
-- A signed-in user may create their own request and read their own.
CREATE POLICY help_requests_self ON help_requests
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
```

Parents have no auth session, so their variant submits through a tiny `SECURITY DEFINER` RPC `submit_help_request(...)` (validated, rate-limitable) or the existing edge-function pattern — signed-in users can insert directly under the self policy. The LogiQ-Taaluma team reads/triages via the Supabase dashboard initially; a later internal admin view can list `help_requests`.

**Component — `src/components/help/AskForHelp.jsx`:** a modal with a message box and an optional contact field. It **auto-captures context** (school, role, active `module`, current `pageId`) so the requester doesn't have to explain where they are, and the team gets everything needed. On submit → insert/RPC → "Thanks, we'll get back to you on <contact>." 

**Fallbacks:** the modal also shows direct **email + WhatsApp** links to support (so a user can reach out even if offline/RLS hiccups). 

**Optional (later):** an edge function that notifies the support team (email/WhatsApp) when a new `help_requests` row is created — a push-equivalent deploy, so gated behind explicit instruction.

### 2.6 Acceptance (Phase 2)

- Every primary page has a working "?" that opens accurate, **module- and role-appropriate** help.
- Empty tables show a guiding CTA instead of a blank state.
- Field tooltips on the genuinely non-obvious inputs (paybill, fee_level, boarding, grading bands).
- **Ask for Help** is reachable from every screen (incl. the parent portal); a submitted request lands in `help_requests` tagged with module/page/role/school; email/WhatsApp fallbacks are present.

---

## Phase 3 — Guided interactive tours

### 3.1 Lightweight tour engine (no dependency)

- **`src/components/help/Tour.jsx`** — given an array of steps `{ target: '[data-tour="key"]', title, body, placement }`, it: finds the element, draws a highlight ring + a positioned tooltip with **Back / Next / Skip** and a step counter, scrolls the target into view, and on finish/skip records completion.
- Targets are marked in the UI with `data-tour="key"` attributes (no refs plumbing). Add these attributes to the relevant elements as tours are authored.
- **Completion state:** `localStorage` key `tour_done_<tourId>_<userId>` (fast, per-device). Optional cross-device: a tiny `user_help_state` table (`user_id, key, value`) with owner-only RLS — add only if requested.

### 3.2 Tours to author (start with the top 3 pain points)

- **First-run dashboard tour** — orients a new admin (nav modules, Getting Started, help "?").
- **Fee Structure tour** — voteheads → categories → per-grade amounts → publish.
- **Exam Entry tour** — pick level/grade/stream/subject → enter marks → auto-save/sync.
- **Grading System tour** — choose level → add bands/labels → save.
- Later: Bulk Import, Invoicing, Payroll.

Each page with a tour shows a subtle **"Take a tour"** link (and the HelpDrawer links to it).

### 3.3 Acceptance (Phase 3)

- Each tour highlights the correct elements, is skippable, remembers completion, and never blocks the UI.
- First-run dashboard tour auto-starts once for a new admin, then never again unless replayed from Help.

---

## Phase 4 — Help Center + content

### 4.1 `src/pages/HelpCenter.jsx`

- A searchable page grouped by **module** first, then category:
  - **Shared / Getting Started** (school info, streams, students, staff, school code).
  - **Exams** (subjects, grading, exams, marksheets, report cards).
  - **Accounts** (fee structure, invoicing, receipting, banking, suppliers, payroll, final accounts).
  - **Parent Portal** (its own mini-section).
  When opened from inside a module, it **defaults to that module's tab**; a toggle switches modules. Articles render from structured content objects like `helpContent.js` (**no new markdown lib**).
- Top: a search box filtering articles by title/keywords (respecting the module filter, with an "all modules" option).
- Prominent **Ask for Help** button (opens the Phase 2.5 modal) for anything not covered.
- Footer: **support contact** (email/WhatsApp), a "Replay tours" list, and a "Reopen Getting Started" button.
- Reachable from the header Help menu on every screen.

### 4.2 Content inventory (the real work — write these)

Short, task-focused articles (title → 3–8 steps → screenshot/GIF optional):
- Getting Started (mirrors the checklist, expanded).
- School Information & branding; Academic setup (levels, term, year, **school code** for teacher/parent login).
- Streams & Dorms; Subjects; Grading system (CBC vs 8-4-4 senior).
- Admitting students (single + **bulk import**, the smart normalization, guardians).
- Staff & teacher logins (creating logins, resetting passwords, roles).
- Exams (settings, entering marks, marksheets, report cards).
- Fees (structure, categories, invoicing, receipting, concessions, statements).
- Accounts (banking, suppliers, payroll, final accounts) — for finance roles.
- Parent Portal (how parents log in, receipts, statements) — a printable one-pager the school can hand to parents.
- FAQ / troubleshooting (pop-ups blocked for printing, forgotten passwords, "student in wrong grade", etc.).

### 4.3 Acceptance (Phase 4)

- Search returns relevant articles; every article is accurate to the current UI; support contact present.
- A printable **"Parent Portal one-pager"** exists for schools to distribute.

---

## Module scoping (Exams vs Accounts) — applies to all four pillars

The two dimensions every help surface filters on are **module** (`exams | accounts | both/portal`) and **role**. Concretely:
- **Getting Started:** Foundations + the active module's steps; per-module progress when both modules are on (see 1.2/1.3).
- **Contextual "?" + tooltips + empty states:** each `helpContent` entry is tagged `module`; the drawer shows only the current module's (and `both`) help.
- **Tours:** authored per module; a page only offers tours valid for its module.
- **Help Center:** module tabs (Shared / Exams / Accounts / Portal); defaults to the current module.
- **Ask for Help:** auto-tags the request with the active `module` and `pageId` so triage knows the area.

The active module is already tracked in the app shell (module switcher: Exams / Accounts). Read it from there — do not add a second source of truth.

## Cross-cutting requirements

- **Role-aware:** gate help content and the checklist by `role` / `app_role` / active module. Parents get a slim in-portal help ("How to read this page") and their own **Ask for Help** entry.
- **Mobile:** drawers/tours/checklist must be responsive (the app targets phones too).
- **Persistence:** onboarding = auto-detected (no storage); dismissals & tour completion = `localStorage` first, optional `user_help_state` table if cross-device is requested.
- **No heavy deps:** build the drawer/tooltip/tour by hand with inline styles, consistent with the codebase.
- **Copy tone:** short, plain English, Kenyan-school vocabulary; every "how" is ≤ 8 steps.
- **Analytics (optional, later):** count checklist completions / tour skips to see where schools get stuck (a `help_events` table) — only if requested.

## Suggested order & sizing

| Phase | Effort | Why this order |
|---|---|---|
| 1 — Getting Started checklist | M | Biggest training-reduction per hour; mostly client + 1 tiny RPC. |
| 2 — Contextual help + empty states | M | Broad coverage, low risk; content-writing heavy. |
| 3 — Guided tours | M–L | Highest polish; custom engine + per-page `data-tour` tagging. |
| 4 — Help Center + articles | L | Mostly content authoring; ship after the interactive pieces. |

Each phase: implement → `vite build` → local smoke → (if DB touched) hand migration to user + re-probe → **stop and await push instruction.**

## Out of scope (unless asked)

- **In scope now:** a basic **Ask for Help** request channel (`help_requests` + modal + email/WhatsApp fallback), module/role scoping.
- **Still out of scope:** real-time live chat, a full ticketing/agent console (beyond reading rows in Supabase), automated email/WhatsApp notifications on new requests (a later edge function), video hosting, in-app AI assistant, editable-in-DB help content, multi-language translation. All are natural follow-ons once the four pillars land.

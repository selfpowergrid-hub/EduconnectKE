# Plan — Level Scoping, 8-4-4 Forms, and System School Codes (SCH-###)

**Status:** approved plan, not yet implemented.
**Audience:** any implementing model (Sonnet 5 / Opus 4.8+). Follow this document strictly.
**Golden rules for the implementer:**

1. **Never `git push` or deploy.** Commit locally only. The user personally verifies at `localhost:5173` and gives the push instruction. (Standing workflow rule.)
2. New SQL goes in **new idempotent migration files** under `supabase/migrations/` (`CREATE OR REPLACE`, `IF NOT EXISTS`, guarded `ALTER`). Never edit an already-applied migration.
3. Touch **only** the files listed per workstream. Match the existing inline-style React conventions (no new CSS frameworks, no TypeScript conversion, no dependency additions).
4. After each workstream: `npx vite build` must pass, unit tests must pass, and if the DB was touched, re-run the RLS probes (copy probe script to repo root as `_probe.mjs`, run, delete — see `docs/fees-security-hardening.md`).
5. Existing data must keep working: students already store grade codes in `students.level_id` (`pp1…g12`), and existing schools already have a free-form `login_code` that teachers/parents may have memorised.

---

## Verified ground truth (do not re-derive; this was audited 2026-07-08)

- `school_registrations.school_type` holds the institutional level. Values seen in code: `"Primary & JSS"`, `"Primary"`, `"Secondary"`, `"SS"`. It reaches the client as `schoolConfig.schoolType` via [AuthContext.jsx:75](src/contexts/AuthContext.jsx#L75) and [:124](src/contexts/AuthContext.jsx#L124).
- Registration offers exactly two types ([Registration.jsx:23-26](src/pages/Registration.jsx#L23-L26)): `"Primary & JSS"` (PP1–Grade 9) and `"Secondary"` (Grade 10–12). `App.jsx:158` writes it to `school_registrations.school_type`.
- The Settings → School Info "Institutional Levels" toggle ([Settings.jsx:93-96](src/pages/Settings.jsx#L93-L96), [:1110-1112](src/pages/Settings.jsx#L1110-L1112), [:1520-1565](src/pages/Settings.jsx#L1520-L1565)) is **cosmetic local state — it is never saved** and nothing reads it. This is why "Senior Secondary ✓" in the UI changes nothing today.
- Grade lists are **duplicated** as a local `const GRADES_BY_LEVEL` in at least: `Fees.jsx:4`, `PocketMoney.jsx:9`, `ExamEntries.jsx:4`, `Students.jsx:9`, `Exams.jsx:5`, `TeacherAllocations.jsx:5`, `Settings.jsx:2009`, `Settings.jsx:2734`, plus the canonical export in [studentImport.js:3-20](src/lib/studentImport.js#L3-L20) (`GRADES_BY_LEVEL`, `GRADE_NAME_TO_CODE`, `GRADE_CODE_TO_NAME`).
- `src/data/mockData.js:6-31` has `CLASSES` (with codes/colors) and `getClassesByType(type)` which **already** filters by school type — but only `Dashboard.jsx`, `Students.jsx`, `Exams.jsx` use it. Everything else shows all levels unconditionally.
- [Exams.jsx:15](src/pages/Exams.jsx#L15) already maps codes starting with `f` to the `"senior"` subject group: `if (classId.startsWith("f")) return "senior"; // f1-f4`. So `f3`/`f4` are the expected codes for Forms.
- `normalizeGrade()` in [studentImport.js](src/lib/studentImport.js) deliberately **rejects** `FORM` inputs today (line ~47: guard `!/PP|PRE|FORM/.test(up)`).
- DB: `public.fee_level_for_grade(p_level_id)` (defined in `20260613_fees_backend_and_parent_lookup.sql:51-64`, **re-issued in several later migrations** — grep before editing) maps grade codes → fee bands; `g10/g11/g12 → 'sss'`. It does not know `f3`/`f4`.
- School code today: free-form `school_registrations.login_code` (user-picked, ≥4 chars), helpers `normalize_login_code` / `is_login_code_available` (`20260610_school_code_picker.sql`), a BEFORE INSERT trigger on `school_registrations` that respects a provided `login_code`. Consumers: edge functions `list-school-teachers`, `parent-portal`, `check-school-code`; UI in `LoginPage.jsx` (teacher view ~line 128, parent view ~line 529, admin signup code-picker ~lines 85-126 & 176-183) and `src/components/school/SchoolCodeCard.jsx`.

---

## Workstream A — Institutional-level scoping (everything follows `school_type`)

**Requirement:** a school registered/configured as *Senior Secondary* must see **only** Grade 10, 11, 12, Form 3, Form 4 in every grade dropdown/filter/form across Exams and Accounts modules. A *Primary & JSS* school sees **only** PP1 → Grade 9. No Grade 7 anywhere in a secondary school, and vice versa.

### A1. Create one canonical module: `src/lib/schoolLevels.js` (NEW FILE)

```js
// Single source of truth for institutional levels and grade lists.
// Every grade dropdown in the app must be built from these helpers so a
// school only ever sees the levels it actually teaches.

export const LEVELS = {
  "Pre-Primary":       ["PP1", "PP2"],
  "Primary":           ["Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6"],
  "Junior Secondary":  ["Grade 7", "Grade 8", "Grade 9"],
  "Senior Secondary":  ["Grade 10", "Grade 11", "Grade 12", "Form 3", "Form 4"], // Form 3/4 = Workstream B
};

export const GRADE_NAME_TO_CODE = {
  "PP1": "pp1", "PP2": "pp2",
  "Grade 1": "g1", "Grade 2": "g2", "Grade 3": "g3",
  "Grade 4": "g4", "Grade 5": "g5", "Grade 6": "g6",
  "Grade 7": "g7", "Grade 8": "g8", "Grade 9": "g9",
  "Grade 10": "g10", "Grade 11": "g11", "Grade 12": "g12",
  "Form 3": "f3", "Form 4": "f4",
};

export const GRADE_CODE_TO_NAME = Object.fromEntries(
  Object.entries(GRADE_NAME_TO_CODE).map(([k, v]) => [v, k])
);

const PRIMARY_LEVELS = ["Pre-Primary", "Primary", "Junior Secondary"];
const SENIOR_LEVELS  = ["Senior Secondary"];

// school_type comes from school_registrations.school_type via schoolConfig.schoolType.
// Accept every historical spelling. Unknown/missing → show everything (fail open,
// never hide a school's own students).
export function levelNamesForSchool(schoolType) {
  if (schoolType === "Primary & JSS" || schoolType === "Primary") return PRIMARY_LEVELS;
  if (schoolType === "Secondary" || schoolType === "SS" || schoolType === "Senior Secondary") return SENIOR_LEVELS;
  return [...PRIMARY_LEVELS, ...SENIOR_LEVELS]; // "All Levels" or unknown
}

export function gradesByLevelForSchool(schoolType) {
  return Object.fromEntries(levelNamesForSchool(schoolType).map(l => [l, LEVELS[l]]));
}

export function gradeNamesForSchool(schoolType) {
  return levelNamesForSchool(schoolType).flatMap(l => LEVELS[l]);
}

export function gradeCodesForSchool(schoolType) {
  return gradeNamesForSchool(schoolType).map(n => GRADE_NAME_TO_CODE[n]);
}
```

Keep `GRADES_BY_LEVEL` / `GRADE_NAME_TO_CODE` / `GRADE_CODE_TO_NAME` exports in `studentImport.js` as **re-exports from this module** (`export { … } from './schoolLevels';`) so nothing importing them breaks.

### A2. Replace every duplicated grade list with the helpers

For each file below: delete the local `const GRADES_BY_LEVEL = {…}` (and any local name↔code maps), import from `../lib/schoolLevels`, and build the level/grade dropdowns from `gradesByLevelForSchool(schoolConfig?.schoolType)` / `gradeNamesForSchool(…)`. Every one of these components already receives `schoolConfig` as a prop — verify, don't assume, in each file.

| File | What to change |
|---|---|
| `src/pages/Fees.jsx` | Local const at line 4; level select ~1229-1233; grade select ~1243; invoice-wizard grade list ~1652 (`Object.values(GRADES_BY_LEVEL).flat()` → `gradeNamesForSchool`). Also the balances tab default `selectedLevel` must be a level the school actually has. |
| `src/pages/PocketMoney.jsx` | Local const at line 9 + every dropdown built from it. |
| `src/pages/ExamEntries.jsx` | Local const at line 4 + dropdowns. |
| `src/pages/Students.jsx` | Local const at line 9; also line 88 `getClassesByType(schoolConfig?.schoolType \|\| "Primary")` — keep `getClassesByType` (it already filters) but fix the fallback to show all when type unknown, and confirm it returns Forms after Workstream B. Admission form + edit form grade selects; bulk-import entry point passes a **scoped** valid-grade list (see A4). |
| `src/pages/Exams.jsx` | Local const at line 5; line 24 `getClassesByType`. Level filter at ~124 must only offer the school's levels. |
| `src/pages/TeacherAllocations.jsx` | Local const at line 5 + class pickers. |
| `src/pages/Settings.jsx` | Inline consts at 2009 and 2734 (grading-system tab and fee-structure tab) — same treatment. |
| `src/pages/Marksheets.jsx` | Uses grade constants (grep `GRADES_BY_LEVEL` / grade lists inside) — scope its class picker. |
| `src/pages/Dashboard.jsx` | Line 11 already uses `getClassesByType` — verify only that Forms appear for secondary (Workstream B) and the unknown-type fallback. |
| `src/data/mockData.js` | Extend `getClassesByType` so unknown/`"All Levels"` returns all classes, and add Form rows (Workstream B). Do not change its signature. |

**Scoping the student *lists*, not just dropdowns:** pages that filter students client-side by grade code (e.g. Fees balances `levelGrades` at Fees.jsx:525) must keep working. Do **not** hide students whose `level_id` falls outside the school's configured levels from "All students" views — level scoping controls the *choices offered*, not data visibility. (A secondary school with a stray `g7` student is a data-entry problem the admin must still be able to see and fix.)

### A3. Make the Settings "Institutional Levels" toggle real

In `src/pages/Settings.jsx` (School Info tab):

1. Initialise `schoolLevels` from `schoolConfig.schoolType` (already done, lines 93-96) — but extend: both true when type is `"All Levels"`.
2. `handleLevelChange` must prevent unchecking the last remaining level (alert: "A school must teach at least one level.").
3. Add a save action (the School Info tab already has its save flow — attach there, not a new button) that maps the checkbox pair to a single value and persists it:
   - primary only → `"Primary & JSS"`
   - senior only → `"Secondary"`
   - both → `"All Levels"`
   ```js
   await supabase.from('school_registrations')
     .update({ school_type: value })
     .eq('id', schoolConfig.id);
   ```
4. After a successful save the in-memory `schoolConfig` must refresh (AuthContext refetch or a full state update callback — find how other School Info saves propagate and do the same; do not invent a new mechanism).

No DB migration needed: `school_type` is TEXT with no CHECK constraint (verify with a quick probe before assuming; if a constraint exists, add a migration extending it to include `"All Levels"`).

### A4. Bulk import respects scoping

`validateRows` in `src/lib/studentImport.js` already takes a `validGrades` argument. The caller (`src/components/students/BulkImportWizard.jsx` / `Students.jsx`) must pass `gradeNamesForSchool(schoolConfig?.schoolType)` instead of the full list, so a secondary school importing "G7" gets a clear **error** ("Grade 7 is not offered at this school — this school is Senior Secondary only"), not a silent acceptance. Add that specific error wording to the unmatched-grade message when the normalizer matched a real grade that is simply out of scope (the normalizer already distinguishes "unparseable" from "parsed but not in validGrades" for out-of-level grades — reuse that path).

### A5. Acceptance criteria (A)

- Log in as the Senior Secondary test school (`tabolwa@gmail.com` / school shows "Senior Secondary ✓"): every grade dropdown in Students, Exams, Exam Entries, Marksheets, Fees, Pocket Money, Teacher Allocations, Settings (grading + fee structure) offers exactly Grade 10–12 (+ Form 3/4 after B). Grade 7 appears nowhere.
- Toggle the school to "Primary & JSS" in Settings, save, reload → the same dropdowns now offer exactly PP1–Grade 9.
- Toggle both on → everything appears.
- Unchecking both is blocked.
- Bulk import of "G7" into a secondary school produces a row error, not a saved student.
- `npx vite build` clean; existing unit tests (27 in the import suite) still pass.

---

## Workstream B — 8-4-4 provision: Form 3 and Form 4 (secondary schools only)

**Requirement:** Kenya's CBC has reached Grade 10; the phasing-out 8-4-4 cohort is in Form 3 and Form 4. Secondary schools need Form 3 and Form 4 as first-class classes alongside Grade 10–12. They must never appear for Primary & JSS schools.

Grade codes: **`f3`** and **`f4`** (Exams.jsx:15 already anticipates `f`-prefixed codes → `"senior"` subject group).

### B1. Client constants

Already included in the A1 module (`LEVELS["Senior Secondary"]`, `GRADE_NAME_TO_CODE`). Additionally:

- `src/data/mockData.js` — append to `CLASSES` (same shape/colors as g10-g12, `type: "Secondary"`):
  ```js
  { id: "f3", name: "Form 3", age: "16-17 yrs", color: "#6C3483", bg: "#F5EEF8", type: "Secondary" },
  { id: "f4", name: "Form 4", age: "17-18 yrs", color: "#6C3483", bg: "#F5EEF8", type: "Secondary" },
  ```
- Subjects & grading: **reuse the existing senior-secondary subject list and grading** (`SUBJECTS_BY_LEVEL` key `"senior"` — already wired for `f*` codes). Do not build a separate KCSE grading scale in this pass; schools customise subjects in Settings → Subjects.

### B2. Import normalizer learns Forms

In `normalizeGrade()` (`src/lib/studentImport.js`):

- Keep the existing guard so `FORM` never falls into the *Grade-N* matcher.
- Add an explicit Form matcher **before** the Grade-N block: `up.match(/^F(?:ORM)?\s*0*([1-6])$/)` → candidate `"Form N"`. Then resolve **only through `validGrades`** exactly like the other matchers: `Form 3`/`Form 4` at a secondary school → matched; `Form 1`, `Form 2`, or any Form at a primary school → `{ matched: false }` with the standard out-of-scope error. Inputs like `F3`, `f 4`, `form3`, `FORM 03` must all resolve.
- Extend the unit-test suite with: `F3→Form 3`, `form 4→Form 4`, `F1→error`, `Form 3` at a Primary & JSS school → error, and confirm `G3` still maps to Grade 3 (no F/G confusion).

### B3. Database migration (one new file): `supabase/migrations/<ts>_form3_form4_grades.sql`

1. `fee_level_for_grade`: re-issue with the extra arm — `WHEN p_level_id IN ('f3','f4') THEN 'sss'`. **Important:** this function is re-declared in several later migrations; the new migration simply issues the final `CREATE OR REPLACE` with the complete, current body (copy the newest definition, add the arm). It is `IMMUTABLE LANGUAGE sql` — keep that.
2. Grep all migrations for other **hardcoded grade-code lists** (`'g12'`, `'g10'`) that enumerate valid grades — e.g. the phase-10b band-expansion CTE was one-time (leave it), but any RPC/constraint that *validates* grade codes must accept `f3`/`f4`. At audit time none was known beyond `fee_level_for_grade`, but the implementer must verify with `grep -rn "g12" supabase/migrations/` and reason about each hit.
3. No changes to `students` (level_id is unconstrained TEXT).
4. Migration must be idempotent and end with a `NOTIFY pgrst, 'reload schema';` if RPC signatures changed (match the style of prior migrations).

**Do not run `supabase db push`** — the user applies migrations personally; hand the file over and say so.

### B4. Fee structure UI

Settings → Fee Structure builds its grade columns from the (now central) grade list, so `Form 3`/`Form 4` columns appear automatically for secondary schools, and their `fee_structures.fee_level` rows store `f3`/`f4`. Verify `get_student_fee_summary` / invoicing RPCs work for an `f3` student end-to-end locally (create test student, sheet row, invoice — then delete).

### B5. Acceptance criteria (B)

- Secondary school: Form 3 & Form 4 selectable in admission, bulk import (`F3` normalises), exams (subject list = senior), exam entries, marksheets, fees (structure column + invoicing + balances filter), pocket money, teacher allocations.
- Primary & JSS school: no Form anywhere; importing `Form 3` errors clearly.
- A test `f3` student can be admitted, invoiced, and appears in fee balances under Senior Secondary → Form 3. GL stays balanced (probe).

---

## Workstream C — System-allocated school code `SCH-###`

**Requirement:** every school gets a **system-assigned, immutable** code `SCH-001`, `SCH-002`, … (three digits, zero-padded, from 001). Teachers and parents enter this code before their credentials to land in the right school. It replaces the user-picked free-form code as the advertised login code.

**Compatibility decision (deliberate):** existing `login_code` values keep working as **legacy aliases** during lookups — schools have already distributed them — but every UI surface shows and asks for the `SCH-###` code only.

### C1. Migration (one new file): `supabase/migrations/<ts>_system_school_codes.sql`

```sql
-- 1. Column + sequence
ALTER TABLE school_registrations ADD COLUMN IF NOT EXISTS school_code TEXT UNIQUE;
CREATE SEQUENCE IF NOT EXISTS school_code_seq START 1;

-- 2. Formatter + allocator
CREATE OR REPLACE FUNCTION public.format_school_code(n BIGINT)
RETURNS TEXT LANGUAGE sql IMMUTABLE
AS $$ SELECT 'SCH-' || lpad(n::text, 3, '0') $$;   -- SCH-001 … SCH-999, then SCH-1000+

-- 3. BEFORE INSERT trigger: assign when NULL (never overwrite)
CREATE OR REPLACE FUNCTION public.assign_school_code() RETURNS trigger …
  IF NEW.school_code IS NULL THEN
    NEW.school_code := public.format_school_code(nextval('school_code_seq'));
  END IF;
-- CREATE TRIGGER trg_assign_school_code BEFORE INSERT ON school_registrations …
-- (drop-if-exists then create, for idempotency)

-- 4. Backfill existing schools in created_at order, then bump the sequence:
--    UPDATE … school_code = format_school_code(rn) FROM (row_number() OVER (ORDER BY created_at, id)) …
--    WHERE school_code IS NULL;
--    SELECT setval('school_code_seq', (max used n)+1, false);

-- 5. Input normaliser: 'sch001' | 'SCH 001' | 'sch-1' -> 'SCH-001'
CREATE OR REPLACE FUNCTION public.normalize_school_code(p TEXT)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE
-- strip non-alphanumerics, expect SCH + digits, lpad the digits to 3, else NULL.

-- 6. Resolver used by edge functions (SECURITY DEFINER, search_path=public):
CREATE OR REPLACE FUNCTION public.resolve_school_by_code(p TEXT)
RETURNS UUID …
-- try school_code = normalize_school_code(p) first,
-- fall back to login_code = normalize_login_code(p)  (legacy alias),
-- return NULL when neither matches.
GRANT EXECUTE … TO anon, authenticated;
```

The implementer writes the full bodies following the style of `20260610_school_code_picker.sql`; the sketch above fixes semantics, not exact text. RLS: `school_code` is inside `school_registrations`, already RLS-protected; the resolver is SECURITY DEFINER returning only the school id — no data leak beyond "this code exists", same exposure as today's `is_login_code_available`.

### C2. Edge functions

`supabase/functions/list-school-teachers`, `parent-portal`, `check-school-code`: wherever they currently match `school_registrations.login_code`, switch to `resolve_school_by_code(input)` (or replicate its two-step lookup with the service-role client: `school_code` first, then `login_code`). Accept the same request body field names as today (`login_code` / `school_code`) so old clients keep working. **Deploying edge functions is a push-equivalent** — prepare the code, tell the user the `supabase functions deploy <name>` commands, do not run them.

### C3. Client

1. **`src/components/school/SchoolCodeCard.jsx`** — becomes display-only: title "School Code", shows `school_code` (monospace + copy button, keep the styling), explanatory line "System-assigned. Teachers and parents enter this code to sign in to your school." **Delete** the Change/editing flow (states `editing/proposed/status/normalized/saving`, the availability `useEffect`, `handleSave`). Prop changes: takes `code` instead of `currentCode`; update its call sites (grep for `SchoolCodeCard`).
2. **`src/pages/LoginPage.jsx`**
   - Teacher view (~line 128) and parent view (~line 529): label/placeholder become "School Code · e.g. SCH-001"; client-normalise input (uppercase, tolerate `sch001`/`SCH 001`); keep the localStorage remember-me keys as-is. The lookup calls are unchanged (edge functions now resolve both forms).
   - Admin signup (~lines 85-126, 174-183): **remove the code-picker** (states `proposedCode/codeStatus/codeMessage/normalizedCode`, the checking `useEffect`, the `codeStatus !== 'ok'` gate) and stop sending `school_login_code` in signup metadata — the DB trigger assigns `SCH-###` on insert. After first login, the admin sees their assigned code in Settings. **Check first** how signup metadata creates the school row (the BEFORE INSERT trigger mentioned in `20260610_school_code_picker.sql` reads `login_code`); if a DB trigger consumes `school_login_code` from `raw_user_meta_data`, it must tolerate its absence — verify and, if needed, patch that trigger in the C1 migration.
   - `clientNormalizeCode` helper: keep (legacy input still allowed), add a `SCH-###` fast path.
3. **`src/contexts/AuthContext.jsx`** — include `school_code` in the fields selected from `school_registrations` and expose it as `schoolConfig.schoolCode` (grep the two select sites, lines ~75/~124).
4. **Settings → School Info**: render the (now read-only) `SchoolCodeCard` near the top with `schoolConfig.schoolCode` so admins can copy it. If it's already rendered somewhere (grep!), just let the new display-only card show through.

### C4. Acceptance criteria (C)

- Fresh school registration → gets the next `SCH-###` automatically; no code-picker in signup; the code is visible in Settings.
- All pre-existing schools have distinct sequential codes after backfill (probe: authenticated select of own row shows `school_code`; anon cannot read the table — re-run the full RLS probe suite, 42 anon + 20 authed, all pass).
- Teacher login with `SCH-###` works; teacher login with the **old** free-form code still works (legacy alias).
- Parent login with `SCH-###` works (edge function `parent-portal`).
- Inputs `sch001`, `SCH 001`, `sch-001` all resolve to `SCH-001`.
- SchoolCodeCard shows the code, copies it, offers no editing.

---

## Implementation order & sizing

| Phase | Workstream | Why this order |
|---|---|---|
| 1 | A (central module + refactor + Settings persistence) | Foundation; B's Forms ride on the central module. Pure client + at most a `school_type` constraint check. |
| 2 | B (Forms) | Needs A's module; one small migration (`fee_level_for_grade`). |
| 3 | C (school codes) | Independent of A/B; largest DB + edge-function surface, so isolate it last. |

Each phase: implement → `npx vite build` → unit tests → manual smoke on `localhost:5173` → (if DB touched) hand migration to user to run, then probe → **stop and report; wait for the user's push instruction.** One commit per phase.

## Out of scope (do not do)

- No KCSE (A–E) grading scale, no separate 8-4-4 subject catalogue — Forms reuse the senior-secondary subject/grading setup.
- No data migration of existing students' grades.
- No hiding of out-of-scope students from lists (scoping restricts *choices*, not visibility).
- No changes to Final Accounts, payroll, GL, banking, suppliers code.
- No edge-function deploys, `supabase db push`, or `git push` without explicit user instruction.

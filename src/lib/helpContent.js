// Contextual help content, keyed by page id (the nav item id in modules.js).
// Each entry is tagged by `module` so the "?" drawer / Help Center can scope
// to Exams vs Accounts. Keep copy short and task-focused (≤ ~8 steps).

export const HELP = {
  'getting-started': {
    title: 'Getting Started', module: 'both',
    what: 'A guided checklist that sets up your school step by step.',
    why: 'Doing the steps in order avoids errors later (e.g. students need streams first).',
    steps: [
      'Work top to bottom — each step links to the right page.',
      'A step ticks green automatically once its data exists.',
      'Use the module toggle to switch between Exams and Accounts setup.',
    ],
    tips: ['The floating 🚀 button reopens this checklist from any page.'],
  },

  dashboard: {
    title: 'Dashboard', module: 'both',
    what: 'A snapshot of your school — key figures and quick status.',
    why: 'Gives you an at-a-glance view whenever you sign in.',
    steps: ['Switch modules (Exams / Accounts) using the toggle in the sidebar.'],
    tips: ['Finish the setup checklist (🚀) to unlock accurate figures.'],
  },

  // ─── Foundations (both modules) ───
  'school-info': {
    title: 'School Information', module: 'both',
    what: 'Your school profile: name, logo, contacts, and payment details (paybill/bank).',
    why: 'These appear on report cards, invoices, receipts and statements.',
    steps: [
      'Fill in the school name, motto and upload a logo.',
      'Add contact details and, under Financial, your paybill / bank account.',
      'Under Academic Configuration set the current term, year and levels.',
      'Click Save Changes.',
    ],
    tips: [
      'Institutional Levels control which grades appear across the app — a Senior Secondary school only sees Grade 10–12 & Forms.',
      'Your SCH-### school code is here (and top-right) — share it with teachers and parents.',
    ],
  },
  'streams-dorms': {
    title: 'Streams & Dormitories', module: 'both',
    what: 'Streams are the classes within a grade (10A, 10B). Dorms are boarding houses.',
    why: 'Every student sits in a stream; boarders are billed boarder fees and grouped by dorm.',
    steps: [
      'Under Streams, click Add — name it (e.g. 10A) and set a capacity.',
      'Repeat for each class stream.',
      'For boarding schools, add dorms the same way under Dormitories.',
    ],
    tips: ['Streams are school-wide — you create them once, not per grade.'],
  },
  students: {
    title: 'Students & Admission', module: 'both',
    what: 'Your student register — admit, edit, filter and bulk-import students.',
    why: 'Marks, fees, report cards and the parent portal are all built around students.',
    steps: [
      'Click + New to admit one student, or Bulk Import for many from Excel.',
      'Fill the admission number, full name, grade, stream and guardians.',
      'Use the Level / Grade / Stream / Boarding filters to find students fast.',
    ],
    tips: [
      'Bulk import is lenient — "G10", "g 10", "form 3" are understood automatically.',
      'Add both parents under Parents/Guardians so either can log into the portal.',
    ],
  },
  teachers: {
    title: 'Staff & Teachers', module: 'both',
    what: 'Register staff and create logins for teachers and finance users.',
    why: 'Teachers sign in with the school code to enter marks for their classes.',
    steps: [
      'Add a staff member with their name and role.',
      'Create a login: set an email + password and choose the account type.',
      'Share the email, password and school code with them.',
      'Forgot a password? Reset it here — the old one stops working.',
    ],
    tips: ['Account type decides what they see (teacher = exams; bursar/accountant = accounts).'],
  },
  users: {
    title: 'Users & Roles', module: 'both',
    what: 'Manage who can access the system and what they can do.',
    why: 'Keeps sensitive areas (payroll, audit) limited to the right people.',
    steps: ['Review staff logins and their roles.', 'Adjust an account type to change access.'],
    tips: [],
  },

  // ─── Exams module ───
  subjects: {
    title: 'Subjects', module: 'examination',
    what: 'The subjects taught at each level.',
    why: 'Exams and marks are recorded per subject.',
    steps: ['Pick a level.', 'Add each subject (name + code).', 'Repeat per level as needed.'],
    tips: [],
  },
  grading: {
    title: 'Grading System', module: 'examination',
    what: 'The grade bands and labels used to turn marks into grades.',
    why: 'Report cards and marksheets use these to grade each score.',
    steps: ['Pick a level.', 'Add bands (range %, label, and points where needed).', 'Save.'],
    tips: ['Senior secondary can use a KCSE-style scale; junior/primary use CBC competency levels.'],
  },
  exams: {
    title: 'Exam Settings', module: 'examination',
    what: 'Create the exams / CATs for the term and set their weights.',
    why: 'Teachers enter marks against these; report cards combine them by weight.',
    steps: [
      'Pick the level, grade and term.',
      'Add each exam (name, out-of marks, weight %).',
      'Weights across a term should total 100%.',
    ],
    tips: [],
  },
  'exam-entries': {
    title: 'Exam Entries', module: 'examination',
    what: 'Where marks are entered per class and subject.',
    why: 'These marks feed report cards and marksheets.',
    steps: [
      'Choose Level, Grade, Stream, Term and Subject.',
      'Type each student\'s score — entries save/sync automatically.',
      'Use Focus Mode for distraction-free entry.',
    ],
    tips: ['Teachers only see the classes and subjects they are assigned.'],
  },
  'teacher-allocations': {
    title: 'Teacher Allocations', module: 'examination',
    what: 'Assign subjects and classes to each teacher, and manage their logins.',
    why: 'A teacher only sees students and exams matching their allocations.',
    steps: ['Open a teacher.', 'Add subject + grade (+ stream, or all streams).', 'Create/reset their login.'],
    tips: [],
  },
  reports: {
    title: 'Report Cards', module: 'examination',
    what: 'Generate and print student report cards.',
    why: 'The termly output parents and students receive.',
    steps: ['Pick the class and term.', 'Review, then print or save as PDF.'],
    tips: [],
  },
  'merit-list': {
    title: 'Exam Marksheets', module: 'examination',
    what: 'Class marksheets and merit lists across subjects.',
    why: 'A quick overview of performance for a whole class.',
    steps: ['Pick level, class, stream and exam.', 'Print or export.'],
    tips: [],
  },

  // ─── Accounts module ───
  'fees-structure': {
    title: 'Fee Structure', module: 'accounting',
    what: 'Your fee items (voteheads) and the amounts charged per grade and term.',
    why: 'Invoices, balances and statements are generated from this.',
    steps: [
      'Add voteheads (Tuition, Boarding, Lunch, …).',
      'Set amounts per grade and term.',
      'Publish so the amounts take effect.',
    ],
    tips: ['Boarder-only voteheads are billed only to students marked as boarders.'],
  },
  fees: {
    title: 'Fees Management', module: 'accounting',
    what: 'Invoice students, record payments/receipts, and view balances.',
    why: 'The day-to-day of collecting and tracking school fees.',
    steps: [
      'Generate invoices for a term (whole school, grade or stream).',
      'Record a payment to issue a receipt.',
      'Use the Level / Grade / Stream filters to review balances.',
    ],
    tips: ['Parents see the same balances and receipts in the parent portal.'],
  },
  'pocket-money': {
    title: 'Pocket Money', module: 'accounting',
    what: 'Custodial student accounts — deposits, withdrawals and balances.',
    why: 'Money held in trust for students, kept separate from school fees.',
    steps: ['Deposit on a student\'s account.', 'Record withdrawals.', 'Print a statement.'],
    tips: [],
  },
  banking: {
    title: 'Banking & Cash', module: 'accounting',
    what: 'Your money locations (bank/cash), transfers and cashbook.',
    why: 'Keeps a clear record of where school money sits and moves.',
    steps: ['Add bank/cash accounts.', 'Record transfers.', 'Review the cashbook.'],
    tips: [],
  },
  suppliers: {
    title: 'Suppliers & Expenses', module: 'accounting',
    what: 'Suppliers, bills, purchase orders and expense vouchers (accounts payable).',
    why: 'Tracks what the school owes and its spending.',
    steps: ['Add a supplier.', 'Record a bill or expense.', 'Record payments against bills.'],
    tips: [],
  },
  payroll: {
    title: 'Payroll', module: 'accounting',
    what: 'Staff salaries with Kenyan statutory deductions (PAYE, NSSF, SHIF, Housing Levy).',
    why: 'Runs and records staff pay and produces payslips / P9.',
    steps: ['Set up staff pay profiles.', 'Generate a payroll run.', 'Approve, then pay.'],
    tips: ['Payroll is confidential — visible to admin and bursar only.'],
  },
  'fee-reports': {
    title: 'Finance Reports', module: 'accounting',
    what: 'Collection, arrears and other finance reports.',
    why: 'For management and reconciliation.',
    steps: ['Pick a report and period.', 'Print or export.'],
    tips: [],
  },
  'final-accounts': {
    title: 'Final Accounts', module: 'accounting',
    what: 'Trial balance, income & expenditure, balance sheet, GL and year-end close.',
    why: 'The formal accounting view of the whole school.',
    steps: ['Review the statements.', 'Post manual journals if needed.', 'Close the fiscal year when ready.'],
    tips: ['Year-end close is admin-only and locks the period.'],
  },
  'fee-audit': {
    title: 'Audit Log', module: 'accounting',
    what: 'A record of finance actions for accountability.',
    why: 'Shows who did what and when.',
    steps: ['Filter by date or action to trace an entry.'],
    tips: ['Visible to admin and auditor only.'],
  },
  'fee-settings': {
    title: 'Finance Settings', module: 'accounting',
    what: 'Defaults for the finance module (allocation modes, document numbers, etc.).',
    why: 'Controls how fees behave across the school.',
    steps: ['Review each setting and save changes.'],
    tips: [],
  },
};

// A safe fallback so every page has something useful in the "?" drawer.
export const HELP_FALLBACK = {
  title: 'Help', module: 'both',
  what: 'This page is part of LogiQ-Taaluma.',
  why: '',
  steps: [],
  tips: ['Use “Ask for Help” below if you’re stuck — we’ll get back to you.'],
};

export function helpFor(pageId) {
  return HELP[pageId] || HELP_FALLBACK;
}

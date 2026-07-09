// Module registry — the single source of truth for the ERP's module shells.
//
// A "module" is a self-contained interface (its own sidebar sections, theme
// accent and landing) over shared core data. The user's role/app_role decides
// which module(s) they can see; the school admin sees all and switches between
// them. This replaces the old flat `navigation` array in App.jsx and the
// hardcoded `menuSections` in Sidebar.jsx.
//
// Phase A: structure + admin switcher (frontend only). app_role-based staff
// routing and RLS arrive in later phases.

import Dashboard from '../pages/Dashboard';
import Students from '../pages/Students';
import Staff from '../pages/Staff';
import Settings from '../pages/Settings';
import Exams from '../pages/Exams';
import ExamEntries from '../pages/ExamEntries';
import Reports from '../pages/Reports';
import Marksheets from '../pages/Marksheets';
import TeacherAllocations from '../pages/TeacherAllocations';
import Fees from '../pages/Fees';
import FeeAuditLog from '../pages/FeeAuditLog';
import FinanceDashboard from '../pages/FinanceDashboard';
import FinanceReports from '../pages/FinanceReports';
import FinanceSettings from '../pages/FinanceSettings';
import PocketMoney from '../pages/PocketMoney';
import Banking from '../pages/Banking';
import Suppliers from '../pages/Suppliers';
import Payroll from '../pages/Payroll';
import FinalAccounts from '../pages/FinalAccounts';
import GettingStarted from '../pages/GettingStarted';

const DASHBOARD = { id: 'dashboard', label: 'Dashboard', icon: '🏠', component: Dashboard };

// Setup guide — admin only, shown first in every module shell.
const GETTING_STARTED_ITEM = { id: 'getting-started', label: 'Getting Started', icon: '🚀', component: GettingStarted };

// Shared core — administration of school-wide data. Rendered inside whichever
// module shell the admin is in. `roles` (when present) limits visibility:
// items with no `roles` are admin-only.
export const CORE_SECTIONS = [
  {
    title: 'Administration',
    icon: '🏢',
    items: [
      { id: 'school-info', label: 'School Information', icon: 'ℹ️', component: Settings, tab: 'school' },
      { id: 'streams-dorms', label: 'Streams & Dorms', icon: '🏘️', component: Settings, tab: 'streams' },
      { id: 'students', label: 'Students & Admission', icon: '🎓', component: Students, roles: ['admin', 'teacher'] },
      { id: 'teachers', label: 'Staff & Teachers', icon: '👥', component: Staff },
    ],
  },
  {
    title: 'System',
    icon: '⚙️',
    items: [
      { id: 'users', label: 'Users & Roles', icon: '👤', component: Settings, tab: 'users' },
    ],
  },
];

export const MODULES = {
  examination: {
    key: 'examination',
    label: 'Examinations',
    shortLabel: 'Exams',
    icon: '📊',
    accent: '#1B6B3A',
    dashboard: DASHBOARD,
    sections: [
      {
        title: 'Academics',
        icon: '📚',
        items: [
          { id: 'exams', label: 'Exam Settings', icon: '⚙️', component: Exams },
          { id: 'exam-entries', label: 'Exam Entries', icon: '✍️', component: ExamEntries, roles: ['admin', 'teacher'] },
          { id: 'subjects', label: 'Subjects', icon: '📖', component: Settings, tab: 'subjects' },
          { id: 'grading', label: 'Grading System', icon: '📈', component: Settings, tab: 'grading' },
          { id: 'teacher-allocations', label: 'Teacher Allocations', icon: '🧑‍🏫', component: TeacherAllocations },
        ],
      },
      {
        title: 'Reports',
        icon: '📋',
        items: [
          { id: 'reports', label: 'Report Cards', icon: '📋', component: Reports, roles: ['admin', 'teacher'] },
          { id: 'merit-list', label: 'Exam Marksheets', icon: '🔢', component: Marksheets, roles: ['admin', 'teacher'] },
        ],
      },
    ],
  },

  accounting: {
    key: 'accounting',
    label: 'Accounting',
    shortLabel: 'Accounts',
    icon: '💰',
    accent: '#1A5F9C',
    // The accounting shell gets its own dashboard: collection tiles, arrears
    // by grade, recent payments and the ledger strip — not the exam one.
    dashboard: { id: 'dashboard', label: 'Dashboard', icon: '🏠', component: FinanceDashboard },
    sections: [
      {
        title: 'Finance',
        icon: '💵',
        items: [
          { id: 'fees-structure', label: 'Fee Structure', icon: '🧾', component: Settings, tab: 'fees' },
          { id: 'fees', label: 'Fees Management', icon: '💳', component: Fees },
          // Custodial student funds — separate from school fee finances.
          { id: 'pocket-money', label: 'Pocket Money', icon: '👛', component: PocketMoney },
          // Final Accounts Phase B: money locations, transfers, cashbook.
          { id: 'banking', label: 'Banking & Cash', icon: '🏦', component: Banking },
          // Final Accounts Phase C: accounts payable (bills, vouchers).
          { id: 'suppliers', label: 'Suppliers & Expenses', icon: '🏪', component: Suppliers },
          // Final Accounts Phase D: payroll — confidential, admin + bursar only
          // (RLS enforces the same; accountants keep AP but not salaries).
          { id: 'payroll', label: 'Payroll', icon: '🧑‍💼', component: Payroll, roles: ['admin', 'bursar'] },
          { id: 'fee-reports', label: 'Reports', icon: '📊', component: FinanceReports },
        ],
      },
      {
        title: 'Oversight',
        icon: '🛡️',
        items: [
          // Final Accounts Phase E: TB / I&E / Balance Sheet / GL detail /
          // manual journals / year-end close (close itself is admin-only via RPC).
          { id: 'final-accounts', label: 'Final Accounts', icon: '📚', component: FinalAccounts, roles: ['admin', 'accountant', 'bursar', 'auditor'] },
          // PRD FR-11.4: audit log viewable by Admin and Auditor only
          // (RLS enforces the same at the database).
          { id: 'fee-audit', label: 'Audit Log', icon: '🔍', component: FeeAuditLog, roles: ['admin', 'auditor'] },
          { id: 'fee-settings', label: 'Finance Settings', icon: '⚙️', component: FinanceSettings, roles: ['admin', 'accountant', 'bursar'] },
        ],
      },
    ],
  },
};

// Maps a school's activated_modules flag to a module. null = always available
// (accounting/fees was never plan-gated). Examination stays gated on the
// "Examinations" activation the school chose at registration.
export const MODULE_ACTIVATION = {
  examination: 'Examinations',
  accounting: null,
};

// A staff member's app_role -> the single module they work in.
export const ROLE_MODULE = {
  teacher: 'examination',
  exams_officer: 'examination',
  accountant: 'accounting',
  bursar: 'accounting',
  auditor: 'accounting', // read-only: RLS grants SELECT-only on finance tables
};

// Which modules a signed-in user may access, intersected with what the school
// has activated. Admin spans all; other staff get exactly their app_role's one.
export function modulesForUser({ role, appRole, activatedModules }) {
  const base = role === 'admin'
    ? Object.keys(MODULES)
    : [ROLE_MODULE[appRole] || 'examination'];

  return base.filter((m) => {
    if (!MODULES[m]) return false;
    const flag = MODULE_ACTIVATION[m];
    return !flag || (activatedModules || []).includes(flag);
  });
}

// Builds the sections (module + applicable core) for a module, filtered by role.
// Core sections only appear for the admin, except items that name `teacher` in
// their `roles` (e.g. students/exam-entries) which teachers keep.
export function navForModule(moduleKey, role) {
  const mod = MODULES[moduleKey];
  if (!mod) return { dashboard: DASHBOARD, sections: [] };

  const roleVisible = (item) => !item.roles || item.roles.includes(role);

  const moduleSections = mod.sections
    .map((s) => ({ ...s, items: s.items.filter(roleVisible) }))
    .filter((s) => s.items.length > 0);

  const coreSections = role === 'admin'
    ? CORE_SECTIONS
    : CORE_SECTIONS
        .map((s) => ({ ...s, items: s.items.filter((i) => i.roles && i.roles.includes(role)) }))
        .filter((s) => s.items.length > 0);

  // Admins get the setup guide pinned first in every module.
  const setupSection = role === 'admin'
    ? [{ title: 'Setup', icon: '🚀', items: [GETTING_STARTED_ITEM] }]
    : [];

  return { dashboard: mod.dashboard, sections: [...setupSection, ...moduleSections, ...coreSections] };
}

// Flat id -> item lookup across a module's nav (incl. dashboard), for routing.
export function flatItemsForModule(moduleKey, role) {
  const { dashboard, sections } = navForModule(moduleKey, role);
  const items = [dashboard];
  sections.forEach((s) => s.items.forEach((i) => items.push(i)));
  return items;
}

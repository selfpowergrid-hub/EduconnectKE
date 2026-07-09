// Getting Started — the self-detecting setup checklist.
//
// Completion is detected from the school's own data via lightweight count
// queries (admins already have RLS read access to these tables), so no extra
// RPC/migration is needed. Steps are tagged by module so the checklist can be
// scoped to Exams vs Accounts, with shared "foundation" steps in both.

import { supabase } from './supabase';

// Module keys match src/lib/modules.js (MODULES): 'examination' | 'accounting'.
// 'both' = a shared foundation step shown in either module.

export const ONBOARDING_STEPS = [
  {
    id: 'school-info', module: 'both', icon: 'ℹ️',
    title: 'Complete School Information',
    blurb: 'Add your school name, logo, contacts and payment details.',
    why: 'Appears on report cards, receipts and statements.',
    nav: { navId: 'school-info' },
    done: (s) => !!s.school_info,
  },
  {
    id: 'streams', module: 'both', icon: '🏘️',
    title: 'Add streams',
    blurb: 'Create your class streams (e.g. 10A, 10B).',
    why: 'Students are placed in streams; exams and fees can be filtered by them.',
    nav: { navId: 'streams-dorms' },
    done: (s) => (s.streams || 0) > 0,
  },
  {
    id: 'dorms', module: 'both', icon: '🛏️', optional: true,
    title: 'Add dormitories',
    blurb: 'For boarding schools — add your dorms.',
    why: 'Boarders are billed boarder fees and grouped by dorm.',
    nav: { navId: 'streams-dorms' },
    done: (s) => (s.dorms || 0) > 0,
  },
  {
    id: 'students', module: 'both', icon: '🎓',
    title: 'Admit students',
    blurb: 'Add students one by one, or bulk-import from Excel.',
    why: 'Everything else — marks, fees, reports — is built around students.',
    nav: { navId: 'students' },
    done: (s) => (s.students || 0) > 0,
  },
  {
    id: 'staff', module: 'both', icon: '👥',
    title: 'Add staff & teacher logins',
    blurb: 'Register staff and create logins for teachers.',
    why: 'Teachers sign in with the school code to enter marks for their classes.',
    nav: { navId: 'teachers' },
    done: (s) => (s.staff || 0) > 0,
  },

  // ─── Exams module ───
  {
    id: 'subjects', module: 'examination', icon: '📖',
    title: 'Set up subjects',
    blurb: 'Define the subjects taught at each level.',
    why: 'Exams and marks are recorded per subject.',
    nav: { navId: 'subjects', module: 'examination' },
    done: (s) => (s.subjects || 0) > 0,
  },
  {
    id: 'grading', module: 'examination', icon: '📈',
    title: 'Configure the grading system',
    blurb: 'Set the grade bands / labels for each level.',
    why: 'Turns raw marks into grades on report cards and marksheets.',
    nav: { navId: 'grading', module: 'examination' },
    done: (s) => (s.grading || 0) > 0,
  },
  {
    id: 'exams', module: 'examination', icon: '⚙️',
    title: 'Create your exams',
    blurb: 'Add the exams/CATs for the term and their weights.',
    why: 'Teachers enter marks against these; report cards combine them.',
    nav: { navId: 'exams', module: 'examination' },
    done: (s) => (s.exams || 0) > 0,
  },

  // ─── Accounts module ───
  {
    id: 'fee-structure', module: 'accounting', icon: '🧾',
    title: 'Build your fee structure',
    blurb: 'Add fee items (voteheads) and per-grade amounts, then publish.',
    why: 'Invoices, balances and statements are generated from this.',
    nav: { navId: 'fees-structure', module: 'accounting' },
    done: (s) => (s.fee_structures || 0) > 0,
  },
];

// One informational step shown at the end (not counted toward progress).
export const SHARE_CODE_INFO = {
  id: 'share-code', icon: '🏷️',
  title: 'Share your school code',
  blurb: 'Give teachers and parents your SCH-### code so they can sign in.',
  why: 'It is on the School Information page and in the top-right menu.',
};

// Count helper — returns 0 on any error so a missing table never breaks the UI.
async function countRows(table, schoolId, refine) {
  try {
    let q = supabase.from(table).select('*', { count: 'exact', head: true }).eq('school_id', schoolId);
    if (refine) q = refine(q);
    const { count, error } = await q;
    return error ? 0 : (count || 0);
  } catch {
    return 0;
  }
}

// Reads the school's data and returns the status object the step predicates use.
export async function fetchOnboardingStatus(schoolId) {
  if (!schoolId) return {};
  const [
    school_info, streams, dorms, subjects, grading, students, staff, exams, fee_structures,
  ] = await Promise.all([
    countRows('school_information', schoolId),
    countRows('streams', schoolId),
    countRows('dorms', schoolId),
    countRows('subjects', schoolId),
    countRows('grading_systems', schoolId),
    countRows('students', schoolId),
    countRows('staff', schoolId),
    countRows('exams', schoolId),
    countRows('fee_structures', schoolId, (q) => q.eq('status', 'published')),
  ]);
  return {
    school_info: school_info > 0,
    streams, dorms, subjects, grading, students, staff, exams, fee_structures,
  };
}

// Which module-key(s) a step belongs to, given the module currently being viewed.
// Foundation steps ('both') always show; module steps show for their module.
export function stepsForModule(moduleKey) {
  return ONBOARDING_STEPS.filter((st) => st.module === 'both' || st.module === moduleKey);
}

// Progress over the required (non-optional) steps for a given module view.
export function progressFor(steps, status) {
  const required = steps.filter((st) => !st.optional);
  const done = required.filter((st) => st.done(status)).length;
  return { done, total: required.length, pct: required.length ? Math.round((done / required.length) * 100) : 100 };
}

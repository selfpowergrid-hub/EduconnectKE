// Built-in knowledge base — how-to guides and FAQs shipped inside the app.
// Searched locally (keyword scoring, no AI, no network). Add articles freely;
// each is tagged by `module` (both | examination | accounting) and `category`.

export const ARTICLES = [
  // ─────────── Setup (foundations) ───────────
  {
    id: 'set-school-info', module: 'both', category: 'Setup',
    title: 'Set up your school information',
    keywords: 'school information name logo motto contact paybill bank branding profile setup',
    what: 'Your school profile appears on report cards, invoices, receipts and statements.',
    steps: [
      'Go to Administration → School Information.',
      'Enter the school name, motto and upload a logo.',
      'Add contact details and, under Financial, your M-Pesa paybill / bank account.',
      'Under Academic Configuration set the current term, academic year and levels.',
      'Click Save Changes.',
    ],
    tips: ['Your SCH-### school code is on this page and in the top-right menu.'],
  },
  {
    id: 'institutional-levels', module: 'both', category: 'Setup',
    title: 'Choose which grades your school uses (institutional levels)',
    keywords: 'levels grades primary jss senior secondary form 3 4 which grades missing hide show 844 cbc',
    what: 'Institutional Levels control which grades appear everywhere in the app.',
    steps: [
      'Go to School Information → Academic Configuration → Institutional Levels.',
      'Tick “Primary & JSS”, “Senior Secondary”, or both.',
      'Save. Grade dropdowns across Exams and Fees update immediately.',
    ],
    tips: [
      'A Senior Secondary school only sees Grade 10–12 and Form 3/4 — never Grade 7.',
      'If a grade you expect is missing, this is almost always the setting to check.',
    ],
  },
  {
    id: 'school-code', module: 'both', category: 'Setup',
    title: 'Find and share your school code (SCH-###)',
    keywords: 'school code sch login teacher parent share sign in code where',
    what: 'Teachers and parents type your SCH-### code before their details to reach your school.',
    steps: [
      'Open Administration → School Information (or the top-right menu).',
      'Copy the SCH-### code shown there.',
      'Share it with your teachers and parents.',
    ],
    tips: ['The code is system-assigned and never changes.'],
  },
  {
    id: 'add-streams', module: 'both', category: 'Setup',
    title: 'Add class streams',
    keywords: 'streams stream class 10a 10b add create classes',
    what: 'Streams are the classes within a grade (e.g. 10A, 10B). Students are placed in a stream.',
    steps: [
      'Go to Administration → Streams & Dorms.',
      'Under Streams, click Add.',
      'Name the stream (e.g. 10A) and set a capacity.',
      'Repeat for each class.',
    ],
    tips: ['Streams are school-wide — create them once, not per grade.'],
  },
  {
    id: 'add-dorms', module: 'both', category: 'Setup',
    title: 'Add dormitories (boarding schools)',
    keywords: 'dorm dormitory boarding boarder house add',
    what: 'Dorms group boarders and drive boarder fee billing.',
    steps: [
      'Go to Streams & Dorms → Dormitories.',
      'Click Add, name the dorm and set capacity (and gender if needed).',
      'Assign boarders to a dorm when admitting them.',
    ],
    tips: ['A student with a dorm is treated as a boarder and billed boarder fees.'],
  },
  {
    id: 'admit-student', module: 'both', category: 'Setup',
    title: 'Admit a student',
    keywords: 'admit student add new register admission enrol enroll single',
    what: 'Add a student to your register with their admission number, name, grade and guardians.',
    steps: [
      'Go to Administration → Students & Admission.',
      'Click + New.',
      'Enter the admission number, full name, grade and stream.',
      'Fill in Parents/Guardians (father, mother, or guardian).',
      'Click Admit Student.',
    ],
    tips: ['Add both parents so either can sign into the parent portal.'],
  },
  {
    id: 'bulk-import', module: 'both', category: 'Setup',
    title: 'Bulk-import students from Excel',
    keywords: 'bulk import excel spreadsheet upload many students old list csv template mass',
    what: 'Add many students at once from a spreadsheet.',
    steps: [
      'Go to Students & Admission → Bulk Import.',
      'Download the template and fill one row per student.',
      'Save the file and upload it back.',
      'Review the preview — fix any rows flagged red — then import.',
    ],
    tips: [
      'The import is lenient: “G10”, “g 10”, “grade 10”, “form 3” are all understood.',
      'A grade your school doesn’t offer is rejected with a clear message.',
    ],
  },
  {
    id: 'guardians', module: 'both', category: 'Setup',
    title: 'Record both parents / guardians',
    keywords: 'parent guardian father mother both email phone contact two parents',
    what: 'Each student can have several guardians, each with their own phone and email.',
    steps: [
      'Open a student (admit or edit).',
      'Under Parents/Guardians, fill Father and Mother (name, phone, email).',
      'Use “+ Add another guardian” for a third if needed.',
      'Save.',
    ],
    tips: ['Either parent’s phone works at the parent portal with the child’s admission number.'],
  },
  {
    id: 'staff-logins', module: 'both', category: 'Setup',
    title: 'Add staff and create teacher logins',
    keywords: 'staff teacher login create account password add employee sign in credentials',
    what: 'Register staff and give teachers/finance users a login.',
    steps: [
      'Go to Administration → Staff & Teachers.',
      'Add a staff member (name + role).',
      'Create a login: set an email + password and choose the account type.',
      'Share the email, password and school code with them.',
    ],
    tips: ['Account type decides access: teacher = exams; bursar/accountant = accounts.'],
  },
  {
    id: 'reset-teacher-password', module: 'both', category: 'Troubleshooting',
    title: 'A teacher can’t log in / reset a teacher password',
    keywords: 'teacher cannot log in wrong password reset forgot login problem sign in fails',
    what: 'Teachers sign in with the school code, their name and the password you set.',
    steps: [
      'Confirm they are using the correct SCH-### school code.',
      'Go to Staff & Teachers and open the teacher.',
      'Click reset password, set a new one, and share it.',
      'The old password stops working immediately.',
    ],
    tips: ['Only the school admin can set or reset teacher passwords.'],
  },

  // ─────────── Exams ───────────
  {
    id: 'subjects', module: 'examination', category: 'Exams',
    title: 'Set up subjects',
    keywords: 'subjects subject add level exam academics',
    what: 'Define the subjects taught at each level; marks are recorded per subject.',
    steps: ['Go to Academics → Subjects.', 'Pick a level.', 'Add each subject (name + code).'],
    tips: [],
  },
  {
    id: 'grading', module: 'examination', category: 'Exams',
    title: 'Configure the grading system',
    keywords: 'grading grades bands marks to grade kcse cbc points scale report',
    what: 'Grade bands turn marks into grades on report cards and marksheets.',
    steps: ['Go to Academics → Grading System.', 'Pick a level.', 'Add bands (range %, label, points).', 'Save.'],
    tips: ['Senior secondary can use a KCSE-style scale; junior/primary use CBC levels.'],
  },
  {
    id: 'create-exams', module: 'examination', category: 'Exams',
    title: 'Create exams / CATs and set weights',
    keywords: 'exam cat create weight term out of marks set up assessment test',
    what: 'Exams are what teachers enter marks against; report cards combine them by weight.',
    steps: [
      'Go to Academics → Exam Settings.',
      'Pick the level, grade and term.',
      'Add each exam (name, out-of marks, weight %).',
      'Make the weights across a term total 100%.',
    ],
    tips: [],
  },
  {
    id: 'enter-marks', module: 'examination', category: 'Exams',
    title: 'Enter marks',
    keywords: 'enter marks scores exam entries record type marks save',
    what: 'Record each student’s score per class and subject.',
    steps: [
      'Go to Academics → Exam Entries.',
      'Choose Level, Grade, Stream, Term and Subject.',
      'Type each score — entries save automatically.',
    ],
    tips: ['Teachers only see the classes and subjects they’re allocated.'],
  },
  {
    id: 'forms-3-4', module: 'examination', category: 'Exams',
    title: 'Use Form 3 and Form 4 (8-4-4)',
    keywords: 'form 3 4 844 old system secondary f3 f4 add form students',
    what: 'Senior secondary schools can use Form 3/4 alongside Grade 10–12 for the 8-4-4 cohort.',
    steps: [
      'Make sure the school is set to Senior Secondary (Institutional Levels).',
      'Form 3 and Form 4 then appear in grade dropdowns and admission.',
      'Admit or import Form students as normal (“F3”, “form 4” are understood).',
    ],
    tips: ['Forms only appear for secondary schools, never for primary/JSS.'],
  },
  {
    id: 'report-cards', module: 'examination', category: 'Exams',
    title: 'Print report cards',
    keywords: 'report card print pdf termly results parent',
    what: 'Generate and print each student’s termly report card.',
    steps: ['Go to Reports → Report Cards.', 'Pick the class and term.', 'Review, then print or save as PDF.'],
    tips: [],
  },
  {
    id: 'allocations', module: 'examination', category: 'Exams',
    title: 'Allocate subjects to teachers',
    keywords: 'teacher allocation assign subject class stream who teaches',
    what: 'Assign subjects and classes so a teacher only sees their own students and exams.',
    steps: ['Go to Academics → Teacher Allocations.', 'Open a teacher.', 'Add subject + grade (+ stream, or all streams).'],
    tips: ['A teacher allocated “all streams” of a grade can pick any specific stream when entering marks.'],
  },

  // ─────────── Accounts ───────────
  {
    id: 'fee-structure', module: 'accounting', category: 'Accounts',
    title: 'Build and publish your fee structure',
    keywords: 'fee structure votehead amount grade term publish set up fees tuition boarding',
    what: 'Fee items (voteheads) and per-grade amounts — invoices and balances come from this.',
    steps: [
      'Go to Finance → Fee Structure.',
      'Add voteheads (Tuition, Boarding, Lunch…).',
      'Set amounts per grade and term.',
      'Publish so the amounts take effect.',
    ],
    tips: ['Boarder-only voteheads are billed only to students marked as boarders.'],
  },
  {
    id: 'invoicing', module: 'accounting', category: 'Accounts',
    title: 'Generate invoices',
    keywords: 'invoice bill generate students term charge fees management',
    what: 'Create invoices so students have a term balance.',
    steps: [
      'Go to Finance → Fees Management.',
      'Click Generate Invoices.',
      'Choose the term and scope (whole school, grade or stream).',
      'Confirm.',
    ],
    tips: ['Parents see the invoice/balance in the parent portal.'],
  },
  {
    id: 'record-payment', module: 'accounting', category: 'Accounts',
    title: 'Record a payment and print a receipt',
    keywords: 'payment receipt record pay mpesa cash bank fees paid',
    what: 'Record money received to reduce a balance and issue a receipt.',
    steps: [
      'Go to Fees Management and find the student.',
      'Record a payment (amount, method, reference).',
      'A receipt is issued — print or save it.',
    ],
    tips: ['Parents can reprint their own receipts in the portal.'],
  },
  {
    id: 'bursary', module: 'accounting', category: 'Accounts',
    title: 'Give a bursary, discount or waiver',
    keywords: 'bursary discount waiver concession sponsor reduce fees scholarship',
    what: 'Reduce what a student owes with a labelled concession.',
    steps: [
      'Open the student in Fees Management.',
      'Add a concession (bursary / discount / waiver) with a label and amount.',
      'It shows on the statement and reduces the balance.',
    ],
    tips: [],
  },
  {
    id: 'payroll', module: 'accounting', category: 'Accounts',
    title: 'Run payroll',
    keywords: 'payroll salary staff pay paye nssf shif housing levy p9 payslip statutory',
    what: 'Pay staff with Kenyan statutory deductions (PAYE, NSSF, SHIF, Housing Levy).',
    steps: ['Go to Finance → Payroll.', 'Set up staff pay profiles.', 'Generate a run, approve it, then pay.'],
    tips: ['Payroll is confidential — admin and bursar only.'],
  },

  // ─────────── Parent Portal ───────────
  {
    id: 'parent-login', module: 'both', category: 'Parent Portal',
    title: 'How parents sign in',
    keywords: 'parent portal login sign in phone admission number school code guardian',
    what: 'Parents view results and fees with no account — just three details.',
    steps: [
      'On the login screen choose Parent / Guardian.',
      'Enter the school code (SCH-###), the parent phone number and the child’s admission number.',
      'Sign in to see results and fee balance for that child.',
    ],
    tips: [
      'Either parent’s phone works if both are recorded on the student.',
      'A parent signs in separately for each child.',
    ],
  },
  {
    id: 'parent-receipts', module: 'both', category: 'Parent Portal',
    title: 'Parents printing receipts & statements',
    keywords: 'parent receipt statement print pdf fees year download',
    what: 'Parents can print any receipt and a full fee statement for any year.',
    steps: [
      'In the parent portal open the Fees tab.',
      'Use the year selector to pick a year.',
      'Click a payment’s Receipt button, or Download Statement.',
    ],
    tips: ['If printing does nothing, allow pop-ups for the site.'],
  },

  // ─────────── Troubleshooting ───────────
  {
    id: 'popups', module: 'both', category: 'Troubleshooting',
    title: 'Printing / PDF does nothing',
    keywords: 'print pdf blocked popup pop-up not working statement receipt report',
    what: 'Printing opens a new tab; if that’s blocked, nothing appears.',
    steps: ['Allow pop-ups for this site in your browser.', 'Try the print/download button again.'],
    tips: [],
  },
  {
    id: 'wrong-grade', module: 'both', category: 'Troubleshooting',
    title: 'A student is in the wrong grade',
    keywords: 'student wrong grade change move edit class level fix',
    what: 'Fix a student’s grade by editing their record.',
    steps: ['Go to Students & Admission.', 'Open the student (edit).', 'Change the Class / Grade and Save.'],
    tips: [],
  },
];

const STOP = new Set(['how', 'do', 'i', 'to', 'a', 'an', 'the', 'my', 'of', 'in', 'on', 'can', 'is', 'are', 'and', 'for', 'with', 'you', 'your', 'me', 'it', 'we', 'our']);

// Local keyword search — scores title/keywords/body matches; no AI/network.
export function searchArticles(query, moduleKey) {
  const words = String(query || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOP.has(w));
  if (!words.length) return [];

  return ARTICLES
    .map((a) => {
      const title = a.title.toLowerCase();
      const kw = (a.keywords || '').toLowerCase();
      const body = [a.what, ...(a.steps || []), ...(a.tips || [])].join(' ').toLowerCase();
      let score = 0;
      for (const w of words) {
        // Word-start boundary so "stream" matches "streams" but "form" does
        // NOT match "information". Keywords are curated, so substring is fine.
        const re = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
        if (re.test(title)) score += 5;
        if (kw.includes(w)) score += 3;
        if (re.test(body)) score += 1;
      }
      if (score > 0 && moduleKey && (a.module === moduleKey || a.module === 'both')) score += 0.5;
      return { a, score };
    })
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score)
    .slice(0, 8)
    .map((x) => x.a);
}

// Browse list — articles for the given module (+ shared), grouped by category.
export function articlesByCategory(moduleKey, allModules = false) {
  const list = ARTICLES.filter((a) => allModules || a.module === 'both' || a.module === moduleKey);
  const groups = {};
  for (const a of list) (groups[a.category] = groups[a.category] || []).push(a);
  return groups;
}

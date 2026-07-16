// Report-card general comments: defaults, token rendering, and the
// deterministic per-student variant picker.
//
// report_comments rows: { role, grade_band, level_category ('All' | class
// code), variant, comment }. A class-specific set overrides the general set
// for that class; among variants the student's id picks one stably, so
// wording varies across a class but never changes between prints.

export const COMMENT_TOKENS = [
  ['{name}', "Student's first name"],
  ['{grade}', 'Overall mean grade'],
  ['{mean}', 'Overall mean %'],
  ['{best_subject}', 'Highest-scoring subject'],
  ['{weak_subject}', 'Lowest-scoring subject'],
];

// Default wording by performance tier (0 = top band … 4 = bottom band).
// Two variations per role per tier — same meaning, different words.
// Deliberately plain English with NO tokens: ready to save untouched.
// (Tokens still work — a school can type {name} etc. into any comment.)
const TIER_DEFAULTS = [
  {
    class_teacher: [
      'An excellent all-round performance. Keep up this momentum.',
      'Outstanding work across the subjects — maintain this high standard.',
    ],
    principal: [
      'Outstanding results. A role model to the class — keep aiming even higher.',
      'A truly impressive performance. The school is proud of you.',
    ],
  },
  {
    class_teacher: [
      'A strong performance. With a little more consistency, the top grade is within reach.',
      'Very good work, especially in the stronger subjects. Keep pushing higher.',
    ],
    principal: [
      'Very good work. Consistency will take you to the very top.',
      'Commendable results. Keep working hard — excellence is near.',
    ],
  },
  {
    class_teacher: [
      'A fair effort. Steady daily revision will raise the mean score.',
      'Average performance with clear ability. Apply the same energy to every subject.',
    ],
    principal: [
      'Average performance with clear potential. Aim higher next term.',
      'You can do better than this. Set a higher target and pursue it.',
    ],
  },
  {
    class_teacher: [
      'More effort is required. Guided revision and closer attention to the weaker subjects are needed.',
      'Below expectation this term. Greater commitment will turn this around.',
    ],
    principal: [
      'This performance calls for serious improvement. Let us see a change next term.',
      'Much more is expected. Work closely with your teachers to improve.',
    ],
  },
  {
    class_teacher: [
      'A very weak performance. Close monitoring, remedial support and supervised study are required.',
      'A complete change of approach is needed — attend remedial classes and seek help early.',
    ],
    principal: [
      'Unsatisfactory results. Parents and teachers must work together to turn this around.',
      'This level of performance cannot continue. A serious commitment to study is required immediately.',
    ],
  },
];

// Map an ordered band list (best → worst) to default comments for every band.
// Returns { class_teacher: { band: [v1, v2] }, principal: { band: [v1, v2] } }.
export function defaultCommentsForBands(bands) {
  const out = { class_teacher: {}, principal: {} };
  const n = bands.length;
  bands.forEach((band, i) => {
    const tier = n <= 1 ? 0 : Math.min(4, Math.floor((i / (n - 1)) * 4 + 0.0001));
    out.class_teacher[band] = [...TIER_DEFAULTS[tier].class_teacher];
    out.principal[band] = [...TIER_DEFAULTS[tier].principal];
  });
  return out;
}

// Substitute tokens with a student's actual results.
export function renderCommentTokens(text, { name, grade, mean, best, weak }) {
  return String(text || '')
    .replaceAll('{name}', name || 'The student')
    .replaceAll('{grade}', grade || '-')
    .replaceAll('{mean}', mean != null ? String(Math.round(mean)) : '-')
    .replaceAll('{best_subject}', best || 'their best subject')
    .replaceAll('{weak_subject}', weak || 'the weaker subjects');
}

// Small stable hash so a student always gets the same variation.
const hash = (s) => {
  let h = 0;
  for (let i = 0; i < String(s).length; i++) h = (h * 31 + String(s).charCodeAt(i)) >>> 0;
  return h;
};

// Pick the comment for a role + band: class-specific rows beat the general
// ('All') set; among variants the student id chooses deterministically.
export function resolveComment(rows, { role, band, classCode, studentId }) {
  const forRoleBand = rows.filter(r => r.role === role && r.grade_band === band);
  if (!forRoleBand.length) return null;
  const specific = forRoleBand.filter(r => r.level_category === classCode);
  const pool = (specific.length ? specific : forRoleBand.filter(r => r.level_category === 'All'))
    .sort((a, b) => (a.variant || 1) - (b.variant || 1));
  if (!pool.length) return null;
  return pool[hash(studentId) % pool.length].comment;
}

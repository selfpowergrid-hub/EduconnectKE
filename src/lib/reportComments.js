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
const TIER_DEFAULTS = [
  {
    class_teacher: [
      'Excellent work, {name}! An outstanding mean of {mean}% with {best_subject} leading the way. Keep this momentum.',
      '{name} has delivered a superb performance across the board. {best_subject} is exceptional — maintain the standard.',
    ],
    principal: [
      'Outstanding results. {name} is a role model to the class — keep aiming even higher.',
      'A truly impressive grade {grade}. The school is proud of you, {name}.',
    ],
  },
  {
    class_teacher: [
      'A strong performance, {name}. With more focus on {weak_subject}, the top grade is within reach.',
      '{name} has performed very well, especially in {best_subject}. Push {weak_subject} to climb higher.',
    ],
    principal: [
      'Very good work, {name}. Consistency will take you to the very top.',
      'Commendable results, {name}. Keep working hard — excellence is near.',
    ],
  },
  {
    class_teacher: [
      'A fair effort, {name}. {best_subject} shows your ability — apply the same energy to {weak_subject}.',
      '{name} is making progress. Steady daily revision, particularly in {weak_subject}, will raise the mean of {mean}%.',
    ],
    principal: [
      'Average performance with clear potential. Aim higher next term, {name}.',
      'You can do better than grade {grade}, {name}. Set a higher target and pursue it.',
    ],
  },
  {
    class_teacher: [
      '{name} needs to put in more effort. Extra attention to {weak_subject} and guided revision are required.',
      'Below expectation this term. {name}, use {best_subject} as proof of your ability — apply yourself everywhere.',
    ],
    principal: [
      'This performance calls for serious improvement. Let us see a change next term, {name}.',
      '{name}, much more is expected of you. Work closely with your teachers to improve.',
    ],
  },
  {
    class_teacher: [
      'A very weak performance. {name} requires close monitoring, remedial support and supervised daily study.',
      '{name} must change approach completely — attend remedial classes and seek help in {weak_subject} and beyond.',
    ],
    principal: [
      'Unsatisfactory results. Parents and teachers must work together to turn this around for {name}.',
      '{name}, this level of performance cannot continue. A serious commitment to study is required immediately.',
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

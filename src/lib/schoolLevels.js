// Single source of truth for institutional levels and grade lists.
// Every grade dropdown in the app must be built from these helpers so a
// school only ever sees the levels it actually teaches
// (school_registrations.school_type → schoolConfig.schoolType).

export const LEVELS = {
  "Pre-Primary": ["PP1", "PP2"],
  "Primary": ["Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6"],
  "Junior Secondary": ["Grade 7", "Grade 8", "Grade 9"],
  // CBC has reached Grade 10; the phasing-out 8-4-4 cohort sits in Form 3/4,
  // so senior secondary carries both alongside each other.
  "Senior Secondary": ["Grade 10", "Grade 11", "Grade 12", "Form 3", "Form 4"],
};

// Kept for existing imports — the full, unscoped map.
export const GRADES_BY_LEVEL = LEVELS;

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
const SENIOR_LEVELS = ["Senior Secondary"];

// Accepts every historical spelling of school_type. Unknown/missing → show
// everything (fail open — never hide a school's own students).
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

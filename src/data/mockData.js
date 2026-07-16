export const SCHOOL_NAME = "Mwanga Academy";
export const CURRENT_TERM = "Term 1";
export const CURRENT_YEAR = "2026";
export const PAYBILL_NO = "123456";

export const CLASSES = [
  { id: "pp1", name: "PP1", age: "4-5 yrs", color: "#1B6B3A", bg: "#E8F5EE", type: "Primary" },
  { id: "pp2", name: "PP2", age: "5-6 yrs", color: "#1B6B3A", bg: "#E8F5EE", type: "Primary" },
  { id: "g1", name: "Grade 1", age: "6-7 yrs", color: "#1B6B3A", bg: "#E8F5EE", type: "Primary" },
  { id: "g2", name: "Grade 2", age: "7-8 yrs", color: "#1B6B3A", bg: "#E8F5EE", type: "Primary" },
  { id: "g3", name: "Grade 3", age: "8-9 yrs", color: "#1B6B3A", bg: "#E8F5EE", type: "Primary" },
  { id: "g4", name: "Grade 4", age: "9-10 yrs", color: "#1B6B3A", bg: "#E8F5EE", type: "Primary" },
  { id: "g5", name: "Grade 5", age: "10-11 yrs", color: "#1B6B3A", bg: "#E8F5EE", type: "Primary" },
  { id: "g6", name: "Grade 6", age: "11-12 yrs", color: "#1B6B3A", bg: "#E8F5EE", type: "Primary" },
  { id: "g7", name: "Grade 7", age: "12-13 yrs", color: "#1A5F9C", bg: "#EBF3FB", type: "JSS" },
  { id: "g8", name: "Grade 8", age: "13-14 yrs", color: "#1A5F9C", bg: "#EBF3FB", type: "JSS" },
  { id: "g9", name: "Grade 9", age: "14-15 yrs", color: "#1A5F9C", bg: "#EBF3FB", type: "JSS" },
  { id: "g10", name: "Grade 10", age: "15-16 yrs", color: "#6C3483", bg: "#F5EEF8", type: "Secondary" },
  { id: "g11", name: "Grade 11", age: "16-17 yrs", color: "#6C3483", bg: "#F5EEF8", type: "Secondary" },
  { id: "g12", name: "Grade 12", age: "17-18 yrs", color: "#6C3483", bg: "#F5EEF8", type: "Secondary" },
  // 8-4-4 cohort still in the system, senior-secondary only.
  { id: "f3", name: "Form 3", age: "16-17 yrs", color: "#6C3483", bg: "#F5EEF8", type: "Secondary" },
  { id: "f4", name: "Form 4", age: "17-18 yrs", color: "#6C3483", bg: "#F5EEF8", type: "Secondary" },
];

export const getClassesByType = (type) => {
  if (type === "Primary & JSS" || type === "Primary") {
    return CLASSES.filter(c => c.type === "Primary" || c.type === "JSS");
  }
  if (type === "Secondary" || type === "SS" || type === "Senior Secondary") {
    return CLASSES.filter(c => c.type === "Secondary");
  }
  // Unknown / "All Levels" / missing → show everything rather than hide a
  // school's own classes.
  const matched = CLASSES.filter(c => c.type === type);
  return matched.length ? matched : CLASSES;
};

export const SUBJECTS_BY_LEVEL = {
  ecde: [
    "Language Activities",
    "Mathematical Activities",
    "Environmental Activities",
    "Creative Activities",
    "Religious Education",
  ],
  lower_primary: [
    "English",
    "Kiswahili",
    "Mathematics",
    "Environmental Studies",
    "CRE",
    "Creative Arts",
    "Physical Education",
  ],
  upper_primary: [
    "English",
    "Kiswahili",
    "Mathematics",
    "Science & Technology",
    "Social Studies",
    "CRE/IRE",
    "Agriculture",
    "Creative Arts",
    "Physical Education",
  ],
  jss: [
    "English",
    "Kiswahili",
    "Mathematics",
    "Integrated Science",
    "Health Education",
    "Pre-Technical Studies",
    "Social Studies",
    "Business Studies",
    "Agriculture",
    "Life Skills",
    "Creative Arts",
    "Physical Education",
  ],
  senior: [
    "English",
    "Kiswahili",
    "Mathematics",
    "Biology",
    "Chemistry",
    "Physics",
    "History",
    "Geography",
    "CRE",
    "Business Studies",
    "Agriculture",
    "Computer Science",
  ],
};

// ---------------------------------------------------------------------------
// Built-in grading defaults for every newly registered school (captured from
// the reference configuration on 2026-07-15). A school sees these until it
// saves its own grading system, which then takes precedence.
//   - Form 3 / Form 4      → DEFAULT_FORM_GRADES (A–E 12-point scale)
//   - PP1 through Grade 12 → DEFAULT_CBC_GRADES  (competency EE/ME/AE scale)
// Rows use the grading_systems DB shape (grade / description / min_score /
// max_score / points) plus display colors for badges.
// ---------------------------------------------------------------------------
export const DEFAULT_FORM_GRADES = [
  { grade: "A",  description: "EXCELLENT",             min_score: 80, max_score: 100, points: 12, color: "#1B6B3A", bg: "#E8F5EE" },
  { grade: "A-", description: "EXCELLENT",             min_score: 75, max_score: 79,  points: 11, color: "#1B6B3A", bg: "#E8F5EE" },
  { grade: "B+", description: "VERY GOOD",             min_score: 70, max_score: 74,  points: 10, color: "#1A5F9C", bg: "#EBF3FB" },
  { grade: "B",  description: "GOOD",                  min_score: 65, max_score: 69,  points: 9,  color: "#1A5F9C", bg: "#EBF3FB" },
  { grade: "B-", description: "GOOD",                  min_score: 60, max_score: 64,  points: 8,  color: "#1A5F9C", bg: "#EBF3FB" },
  { grade: "C+", description: "AVERAGE STUDENT",       min_score: 50, max_score: 59,  points: 7,  color: "#D35400", bg: "#FEF0E6" },
  { grade: "C",  description: "CAN DO BETTER",         min_score: 40, max_score: 49,  points: 6,  color: "#D35400", bg: "#FEF0E6" },
  { grade: "C-", description: "CAN DO BETTER",         min_score: 30, max_score: 39,  points: 5,  color: "#D35400", bg: "#FEF0E6" },
  { grade: "D+", description: "POOR PERFORMANCE",      min_score: 25, max_score: 29,  points: 4,  color: "#C0392B", bg: "#FDEDEC" },
  { grade: "D",  description: "POOR PERFORMANCE",      min_score: 20, max_score: 24,  points: 3,  color: "#C0392B", bg: "#FDEDEC" },
  { grade: "D-", description: "VERY POOR PERFORMANCE", min_score: 15, max_score: 19,  points: 2,  color: "#C0392B", bg: "#FDEDEC" },
  { grade: "E",  description: "FAILED",                min_score: 0,  max_score: 14,  points: 1,  color: "#C0392B", bg: "#FDEDEC" },
];

export const DEFAULT_CBC_GRADES = [
  { grade: "EE 1", description: "EXCEEDING EXPECTATIONS 1",  min_score: 80, max_score: 100, points: 12, color: "#1B6B3A", bg: "#E8F5EE" },
  { grade: "EE2",  description: "EXCEEDING EXPECTATION II",  min_score: 70, max_score: 79,  points: 11, color: "#1B6B3A", bg: "#E8F5EE" },
  { grade: "ME 1", description: "MEETING EXPECTATION I",     min_score: 60, max_score: 69,  points: 10, color: "#1A5F9C", bg: "#EBF3FB" },
  { grade: "ME 2", description: "MEETING EXPECTATION II",    min_score: 50, max_score: 59,  points: 9,  color: "#1A5F9C", bg: "#EBF3FB" },
  { grade: "AE",   description: "APPROACHING EXPECTATION",   min_score: 40, max_score: 49,  points: 8,  color: "#D35400", bg: "#FEF0E6" },
  { grade: "BE",   description: "BELOW EXPECTATION",         min_score: 0,  max_score: 39,  points: 7,  color: "#C0392B", bg: "#FDEDEC" },
];

// Which built-in default applies to a given grade/class. Accepts either the
// display name ("Form 3", "Grade 10") or the class code ("f3", "g10").
export const defaultGradesFor = (gradeNameOrCode) =>
  /^(form\s|f\d)/i.test(String(gradeNameOrCode || "")) ? DEFAULT_FORM_GRADES : DEFAULT_CBC_GRADES;

// ---------------------------------------------------------------------------
// Built-in default subjects per grade (Kenya). CBC lists follow the KICD 2024
// rationalized learning areas; senior school follows the 2026 pathway
// structure; Form 3/4 use official KNEC KCSE subject codes. Loaded into a
// school's account via "Load Default Subjects" — the school can then edit
// freely. Types match the Subjects page: Core/Optional below senior level,
// Compulsory/Elective for Senior Secondary (Grade 10–12, Form 3–4).
// ---------------------------------------------------------------------------
const CBC_PP_SUBJECTS = [
  { code: "LA",  name: "Language Activities",            type: "Core" },
  { code: "MA",  name: "Mathematical Activities",        type: "Core" },
  { code: "EA",  name: "Environmental Activities",       type: "Core" },
  { code: "CA",  name: "Creative Activities",            type: "Core" },
  { code: "REA", name: "Religious Education Activities", type: "Core" },
];

const CBC_LOWER_PRIMARY_SUBJECTS = [
  { code: "ENG", name: "English Language Activities",    type: "Core" },
  { code: "KIS", name: "Kiswahili Language Activities",  type: "Core" },
  { code: "IL",  name: "Indigenous Language Activities", type: "Core" },
  { code: "MA",  name: "Mathematical Activities",        type: "Core" },
  { code: "EA",  name: "Environmental Activities",       type: "Core" },
  { code: "CA",  name: "Creative Activities",            type: "Core" },
  { code: "REA", name: "Religious Education Activities", type: "Core" },
];

const CBC_UPPER_PRIMARY_SUBJECTS = [
  { code: "ENG", name: "English",                 type: "Core" },
  { code: "KIS", name: "Kiswahili",               type: "Core" },
  { code: "MAT", name: "Mathematics",             type: "Core" },
  { code: "RE",  name: "Religious Education",     type: "Core" },
  { code: "SCT", name: "Science & Technology",    type: "Core" },
  { code: "SST", name: "Social Studies",          type: "Core" },
  { code: "AGN", name: "Agriculture & Nutrition", type: "Core" },
  { code: "CRA", name: "Creative Arts",           type: "Core" },
];

const CBC_JSS_SUBJECTS = [
  { code: "ENG", name: "English",                 type: "Core" },
  { code: "KIS", name: "Kiswahili",               type: "Core" },
  { code: "MAT", name: "Mathematics",             type: "Core" },
  { code: "RE",  name: "Religious Education",     type: "Core" },
  { code: "SST", name: "Social Studies",          type: "Core" },
  { code: "ISC", name: "Integrated Science",      type: "Core" },
  { code: "PTS", name: "Pre-Technical Studies",   type: "Core" },
  { code: "AGN", name: "Agriculture & Nutrition", type: "Core" },
  { code: "CAS", name: "Creative Arts & Sports",  type: "Core" },
];

const CBC_SENIOR_SUBJECTS = [
  // Compulsory core (PE is compulsory but assessed internally)
  { code: "ENG", name: "English",                    type: "Compulsory" },
  { code: "KIS", name: "Kiswahili",                  type: "Compulsory" },
  { code: "MAT", name: "Mathematics",                type: "Compulsory" },
  { code: "CSL", name: "Community Service Learning", type: "Compulsory" },
  { code: "PE",  name: "Physical Education",         type: "Compulsory" },
  // STEM pathway electives
  { code: "BIO", name: "Biology",                type: "Elective" },
  { code: "CHE", name: "Chemistry",              type: "Elective" },
  { code: "PHY", name: "Physics",                type: "Elective" },
  { code: "GSC", name: "General Science",        type: "Elective" },
  { code: "CSC", name: "Computer Science",       type: "Elective" },
  { code: "AGR", name: "Agriculture",            type: "Elective" },
  { code: "HSC", name: "Home Science",           type: "Elective" },
  // Social Sciences pathway electives
  { code: "HCT", name: "History & Citizenship",       type: "Elective" },
  { code: "GEO", name: "Geography",                   type: "Elective" },
  { code: "CRE", name: "Christian Religious Education", type: "Elective" },
  { code: "IRE", name: "Islamic Religious Education",   type: "Elective" },
  { code: "BST", name: "Business Studies",            type: "Elective" },
  { code: "LIT", name: "Literature in English",       type: "Elective" },
  { code: "FAS", name: "Fasihi ya Kiswahili",         type: "Elective" },
  { code: "FRE", name: "French",                      type: "Elective" },
  { code: "GER", name: "German",                      type: "Elective" },
  { code: "ARB", name: "Arabic",                      type: "Elective" },
  // Arts & Sports Science pathway electives
  { code: "FA",  name: "Fine Arts",            type: "Elective" },
  { code: "MUS", name: "Music & Dance",        type: "Elective" },
  { code: "TF",  name: "Theatre & Film",       type: "Elective" },
  { code: "SRS", name: "Sports & Recreation",  type: "Elective" },
];

const FORM_844_SUBJECTS = [
  // Group 1 — compulsory (KNEC codes)
  { code: "101", name: "English",     type: "Compulsory", subject_group: 1 },
  { code: "102", name: "Kiswahili",   type: "Compulsory", subject_group: 1 },
  { code: "121", name: "Mathematics", type: "Compulsory", subject_group: 1 },
  // Group 2 — sciences
  { code: "231", name: "Biology",   type: "Elective", subject_group: 2 },
  { code: "232", name: "Physics",   type: "Elective", subject_group: 2 },
  { code: "233", name: "Chemistry", type: "Elective", subject_group: 2 },
  // Group 3 — humanities
  { code: "311", name: "History & Government",          type: "Elective", subject_group: 3 },
  { code: "312", name: "Geography",                     type: "Elective", subject_group: 3 },
  { code: "313", name: "Christian Religious Education", type: "Elective", subject_group: 3 },
  { code: "314", name: "Islamic Religious Education",   type: "Elective", subject_group: 3 },
  // Group 4 — technical & applied
  { code: "441", name: "Home Science",     type: "Elective", subject_group: 4 },
  { code: "443", name: "Agriculture",      type: "Elective", subject_group: 4 },
  { code: "451", name: "Computer Studies", type: "Elective", subject_group: 4 },
  // Group 5 — business & languages
  { code: "565", name: "Business Studies", type: "Elective", subject_group: 5 },
];

// The classic KNEC "best 7" counting rule for 8-4-4 forms: all of Group 1,
// best 2 sciences, best 1 humanity, then the single best remaining subject.
export const KNEC_BEST7_RULES = [
  { group: 1, take: "all" },
  { group: 2, take: 2 },
  { group: 3, take: 1 },
  { remaining: true, take: 1 },
];
export const KNEC_BEST7_MIN_SUBJECTS = 7;

export const DEFAULT_SUBJECTS_BY_GRADE = (() => {
  const map = {};
  ["pp1", "pp2"].forEach(g => { map[g] = CBC_PP_SUBJECTS; });
  ["g1", "g2", "g3"].forEach(g => { map[g] = CBC_LOWER_PRIMARY_SUBJECTS; });
  ["g4", "g5", "g6"].forEach(g => { map[g] = CBC_UPPER_PRIMARY_SUBJECTS; });
  ["g7", "g8", "g9"].forEach(g => { map[g] = CBC_JSS_SUBJECTS; });
  ["g10", "g11", "g12"].forEach(g => { map[g] = CBC_SENIOR_SUBJECTS; });
  ["f3", "f4"].forEach(g => { map[g] = FORM_844_SUBJECTS; });
  return map;
})();

// Accepts a class code ("f3", "g10") or display name ("Form 3", "Grade 10").
export const defaultSubjectsFor = (gradeNameOrCode) => {
  const raw = String(gradeNameOrCode || "").trim();
  if (DEFAULT_SUBJECTS_BY_GRADE[raw.toLowerCase()]) return DEFAULT_SUBJECTS_BY_GRADE[raw.toLowerCase()];
  const nameToCode = {
    "PP1": "pp1", "PP2": "pp2",
    "Grade 1": "g1", "Grade 2": "g2", "Grade 3": "g3", "Grade 4": "g4", "Grade 5": "g5", "Grade 6": "g6",
    "Grade 7": "g7", "Grade 8": "g8", "Grade 9": "g9",
    "Grade 10": "g10", "Grade 11": "g11", "Grade 12": "g12", "Form 3": "f3", "Form 4": "f4"
  };
  return DEFAULT_SUBJECTS_BY_GRADE[nameToCode[raw]] || [];
};

export const COMPETENCY_GRADES = [
  { code: "EE1", label: "Exceeding Expectations (Distinction)", min: 90, color: "#1B6B3A", bg: "#E8F5EE" },
  { code: "EE2", label: "Exceeding Expectations (Credit)", min: 80, color: "#1B6B3A", bg: "#E8F5EE" },
  { code: "ME1", label: "Meeting Expectations (Very Good)", min: 70, color: "#1A5F9C", bg: "#EBF3FB" },
  { code: "ME2", label: "Meeting Expectations (Good)", min: 60, color: "#1A5F9C", bg: "#EBF3FB" },
  { code: "AE1", label: "Approaching Expectations (Satisfactory)", min: 50, color: "#D35400", bg: "#FEF0E6" },
  { code: "AE2", label: "Approaching Expectations (Fair)", min: 40, color: "#D35400", bg: "#FEF0E6" },
  { code: "BE1", label: "Below Expectations (Weak)", min: 20, color: "#C0392B", bg: "#FDEDEC" },
  { code: "BE2", label: "Below Expectations (Very Weak)", min: 0, color: "#C0392B", bg: "#FDEDEC" },
];

export const ACADEMIC_GRADES = [
  { code: "A", label: "Excellent", min: 80, color: "#1B6B3A", bg: "#E8F5EE" },
  { code: "A-", label: "Very Good", min: 75, color: "#1B6B3A", bg: "#E8F5EE" },
  { code: "B+", label: "Good", min: 70, color: "#1A5F9C", bg: "#EBF3FB" },
  { code: "B", label: "Good", min: 65, color: "#1A5F9C", bg: "#EBF3FB" },
  { code: "B-", label: "Average", min: 60, color: "#1A5F9C", bg: "#EBF3FB" },
  { code: "C+", label: "Average", min: 55, color: "#D35400", bg: "#FEF0E6" },
  { code: "C", label: "Average", min: 50, color: "#D35400", bg: "#FEF0E6" },
  { code: "C-", label: "Below Average", min: 45, color: "#D35400", bg: "#FEF0E6" },
  { code: "D+", label: "Below Average", min: 40, color: "#C0392B", bg: "#FDEDEC" },
  { code: "D", label: "Poor", min: 35, color: "#C0392B", bg: "#FDEDEC" },
  { code: "D-", label: "Poor", min: 30, color: "#C0392B", bg: "#FDEDEC" },
  { code: "E", label: "Very Poor", min: 0, color: "#C0392B", bg: "#FDEDEC" },
];

const firstNames = [
  "Achieng", "Kamau", "Wanjiku", "Ochieng", "Muthoni", "Kipchoge", "Nafula", "Baraka", "Zawadi", "Amina",
  "Brian", "Peter", "Grace", "John", "Mary", "Daniel", "Faith", "Samuel", "Esther", "David",
  "Lilian", "James", "Joyce", "Michael", "Charity", "Robert", "Beatrice", "George", "Winnie", "Francis",
  "Eunice", "Patrick", "Scholastica", "Vincent", "Perpetua", "Anthony", "Immaculate", "Stephen", "Celestine", "Paul"
];

const lastNames = [
  "Mwangi", "Otieno", "Kamau", "Njoroge", "Odhiambo", "Waweru", "Mutua", "Kipkoech", "Auma", "Hassan",
  "Ndegwa", "Ouma", "Gitonga", "Karanja", "Nyambura", "Koech", "Wairimu", "Mugo", "Chebet", "Owino",
  "Githuku", "Muriuki", "Anyango", "Maina", "Wanjiru", "Simiyu", "Njeru", "Rotich", "Macharia", "Githii"
];

let nextId = 1001;

function generateStudent(gradeId, stream) {
  const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
  const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
  const id = nextId++;
  
  const baseFees = gradeId.startsWith("g1") && gradeId.length > 2 ? 55000 : // g10, g11, g12
                   gradeId.startsWith("g") ? 35000 : // g7, g8, g9
                   gradeId.startsWith("pp") ? 25000 : 20000;
                   
  const paidFactor = Math.random();
  const feePaid = Math.round((baseFees * paidFactor) / 500) * 500;
  
  return {
    id,
    admNo: `MWA/${id}`,
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`,
    gradeId,
    stream,
    gender: Math.random() > 0.5 ? "M" : "F",
    dob: `${2008 + Math.floor(Math.random() * 8)}-${String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 28) + 1).padStart(2, '0')}`,
    parent: `${lastNames[Math.floor(Math.random() * lastNames.length)]} (${Math.random() > 0.5 ? 'Father' : 'Mother'})`,
    phone: `07${Math.floor(10000000 + Math.random() * 89999999)}`,
    feeTotal: baseFees,
    feePaid: feePaid,
    feeBalance: baseFees - feePaid,
    house: ["Red", "Blue", "Green", "Yellow"][Math.floor(Math.random() * 4)],
    enrollDate: "2026-01-06"
  };
}

export const STUDENTS = [];
const activeGrades = CLASSES.map(c => c.id);

activeGrades.forEach(grade => {
  ["A", "B"].forEach(stream => {
    const count = 25 + Math.floor(Math.random() * 10);
    for (let i = 0; i < count; i++) {
      STUDENTS.push(generateStudent(grade, stream));
    }
  });
});

export const STAFF_ROLES = [
  "School Principal",
  "Deputy Principal",
  "Senior Teacher",
  "Class Teacher",
  "Subject Teacher",
  "Librarian",
  "School Bursar",
  "Secretary",
  "Lab Technician",
  "School Nurse",
  "Security Officer",
  "Cook",
  "Groundsman/Cleaner",
  "Storekeeper"
];

export const STAFF = [
  {
    id: 1,
    name: "Mrs. Wanjiku Mwangi",
    tsc: "TSC/001234",
    subject: "Mathematics",
    email: "w.mwangi@mwanga.ac.ke",
    phone: "0712345678",
    classes: ["g9A", "g10A", "g11A"],
    type: "Teaching",
    role: "School Principal",
  },
  {
    id: 2,
    name: "Mr. Otieno Ochieng",
    tsc: "TSC/002345",
    subject: "English",
    email: "o.ochieng@mwanga.ac.ke",
    phone: "0722345678",
    classes: ["g9B", "g10B", "g12A"],
    type: "Teaching",
    role: "Deputy Principal",
  },
  {
    id: 3,
    name: "Ms. Auma Achieng",
    tsc: "TSC/003456",
    subject: "Biology",
    email: "a.achieng@mwanga.ac.ke",
    phone: "0733345678",
    classes: ["g10A", "g11A", "g12A"],
    type: "Teaching",
    role: "Senior Teacher",
  },
  {
    id: 4,
    name: "Mr. Kipchoge Rotich",
    tsc: "TSC/004567",
    subject: "Physics",
    email: "k.rotich@mwanga.ac.ke",
    phone: "0744345678",
    classes: ["g10B", "g11B", "g12B"],
    type: "Teaching",
    role: "Class Teacher",
  },
  {
    id: 5,
    name: "Mrs. Njoroge Wairimu",
    tsc: "TSC/005678",
    subject: "Chemistry",
    email: "n.wairimu@mwanga.ac.ke",
    phone: "0755345678",
    classes: ["g10A", "g11B", "g12A"],
    type: "Teaching",
    role: "Subject Teacher",
  },
  {
    id: 6,
    name: "Mr. Hassan Baraka",
    tsc: "TSC/006789",
    subject: "Kiswahili",
    email: "h.baraka@mwanga.ac.ke",
    phone: "0766345678",
    classes: ["g7A", "g8A", "g9A"],
    type: "Teaching",
    role: "Subject Teacher",
  },
  {
    id: 7,
    name: "Ms. Chebet Koech",
    tsc: "TSC/007890",
    subject: "History",
    email: "c.koech@mwanga.ac.ke",
    phone: "0777345678",
    classes: ["g10A", "g11A", "g12B"],
    type: "Teaching",
  },
  {
    id: 8,
    name: "Mr. Mutua Ndegwa",
    tsc: "TSC/008901",
    subject: "Computer Science",
    email: "m.ndegwa@mwanga.ac.ke",
    phone: "0788345678",
    classes: ["g10B", "g11A", "g12A"],
    type: "Teaching",
  },
  {
    id: 9,
    name: "Mrs. Karanja Grace",
    tsc: "",
    subject: "",
    email: "g.karanja@mwanga.ac.ke",
    phone: "0799345678",
    classes: [],
    type: "Non-Teaching",
  },
  {
    id: 10,
    name: "Mr. Githii Joseph",
    tsc: "",
    subject: "",
    email: "j.githii@mwanga.ac.ke",
    phone: "0700345678",
    classes: [],
    type: "Non-Teaching",
  },
];

export const FEE_STRUCTURE = {
  ecde: { tuition: 8000, activity: 3000, building: 2000, lunch: 5000, uniform: 2000, total: 20000 },
  pp: { tuition: 10000, activity: 4000, building: 3000, lunch: 5000, uniform: 3000, total: 25000 },
  lower_primary: { tuition: 15000, activity: 5000, building: 4000, lunch: 6000, uniform: 3000, total: 33000 },
  upper_primary: { tuition: 18000, activity: 5000, building: 4000, lunch: 6000, uniform: 3000, total: 36000 },
  jss: { tuition: 22000, activity: 6000, building: 5000, lunch: 7000, boarding: 15000, total: 55000 },
  senior: { tuition: 25000, activity: 6000, building: 5000, lunch: 7000, boarding: 15000, total: 58000 },
};

export const RECENT_ACTIVITY = [
  { id: 1, type: "exam", text: "Grade 9A Mathematics CAT 2 marks entered by Mr. Otieno (42 students)", time: "Today · 10:32 AM", color: "#1B6B3A" },
  { id: 2, type: "report", text: "78 report cards generated and printed for Grade 6A and 6B", time: "Today · 9:15 AM", color: "#1A5F9C" },
  { id: 3, type: "fees", text: "M-Pesa payment of KES 12,500 received for Kamau Brian (Adm: MWA/2045)", time: "Yesterday · 4:44 PM", color: "#D4A017" },
  { id: 4, type: "sms", text: "SMS fee reminders sent to 147 parents with outstanding balances", time: "Yesterday · 8:00 AM", color: "#D35400" },
  { id: 5, type: "admission", text: "3 new learners admitted to Playgroup — Wanjiku M., Oloo T., Chebet A.", time: "Mar 13 · 11:20 AM", color: "#6C3483" },
  { id: 6, type: "exam", text: "Grade 12B Physics End-term paper uploaded by Mr. Kipchoge", time: "Mar 12 · 3:10 PM", color: "#1B6B3A" },
  { id: 7, type: "fees", text: "Fee structure updated for Term 2 by Principal Mwangi", time: "Mar 11 · 10:00 AM", color: "#D4A017" },
];

export const MPESA_TRANSACTIONS = [
  { id: "QAZ123", name: "Kamau Brian", adm: "MWA/2045", amount: 12500, date: "2026-03-16 10:32", status: "confirmed", phone: "0712345678" },
  { id: "WSX456", name: "Wanjiku Peter", adm: "MWA/1823", amount: 8000, date: "2026-03-15 14:18", status: "confirmed", phone: "0723456789" },
  { id: "EDC789", name: "Otieno Grace", adm: "MWA/2201", amount: 25000, date: "2026-03-15 09:44", status: "confirmed", phone: "0734567890" },
  { id: "RFV012", name: "Muthoni James", adm: "MWA/1654", amount: 5000, date: "2026-03-14 16:22", status: "confirmed", phone: "0745678901" },
  { id: "TGB345", name: "Achieng John", adm: "MWA/2087", amount: 15000, date: "2026-03-14 11:05", status: "pending", phone: "0756789012" },
  { id: "YHN678", name: "Rotich Mary", adm: "MWA/1990", amount: 20000, date: "2026-03-13 13:50", status: "confirmed", phone: "0767890123" },
  { id: "UJM901", name: "Ndegwa Faith", adm: "MWA/2314", amount: 10000, date: "2026-03-12 08:30", status: "confirmed", phone: "0778901234" },
];

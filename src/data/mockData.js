export const SCHOOL_NAME = "Mwanga Academy";
export const CURRENT_TERM = "Term 1";
export const CURRENT_YEAR = "2026";
export const PAYBILL_NO = "123456";

export const CLASSES = [
  { id: "pg", name: "Playgroup", age: "3-4 yrs", color: "#E67E22", bg: "#FEF0E6" },
  { id: "pp1", name: "PP1", age: "4-5 yrs", color: "#E67E22", bg: "#FEF0E6" },
  { id: "pp2", name: "PP2", age: "5-6 yrs", color: "#E67E22", bg: "#FEF0E6" },
  { id: "g1", name: "Grade 1", age: "6-7 yrs", color: "#1B6B3A", bg: "#E8F5EE" },
  { id: "g2", name: "Grade 2", age: "7-8 yrs", color: "#1B6B3A", bg: "#E8F5EE" },
  { id: "g3", name: "Grade 3", age: "8-9 yrs", color: "#1B6B3A", bg: "#E8F5EE" },
  { id: "g4", name: "Grade 4", age: "9-10 yrs", color: "#1B6B3A", bg: "#E8F5EE" },
  { id: "g5", name: "Grade 5", age: "10-11 yrs", color: "#1B6B3A", bg: "#E8F5EE" },
  { id: "g6", name: "Grade 6", age: "11-12 yrs", color: "#1B6B3A", bg: "#E8F5EE" },
  { id: "g7", name: "Grade 7", age: "12-13 yrs", color: "#1A5F9C", bg: "#EBF3FB" },
  { id: "g8", name: "Grade 8", age: "13-14 yrs", color: "#1A5F9C", bg: "#EBF3FB" },
  { id: "g9", name: "Grade 9", age: "14-15 yrs", color: "#1A5F9C", bg: "#EBF3FB" },
  { id: "g10", name: "Grade 10", age: "15-16 yrs", color: "#6C3483", bg: "#F5EEF8" },
  { id: "g11", name: "Grade 11", age: "16-17 yrs", color: "#6C3483", bg: "#F5EEF8" },
  { id: "g12", name: "Grade 12", age: "17-18 yrs", color: "#6C3483", bg: "#F5EEF8" },
];

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

export const COMPETENCY_GRADES = [
  { code: "EE", label: "Exceeds Expectation", min: 75, color: "#1B6B3A", bg: "#E8F5EE" },
  { code: "ME", label: "Meets Expectation", min: 50, color: "#1A5F9C", bg: "#EBF3FB" },
  { code: "AE", label: "Approaching Expectation", min: 25, color: "#D35400", bg: "#FEF0E6" },
  { code: "BE", label: "Below Expectation", min: 0, color: "#C0392B", bg: "#FDEDEC" },
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
  
  const baseFees = gradeId.startsWith("g1") || gradeId.startsWith("g2") ? 45000 :
                   gradeId.startsWith("g") ? (parseInt(gradeId.replace("g", "")) >= 10 ? 55000 : 35000) :
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
const activeGrades = ["g6", "g7", "g8", "g9", "g10", "g11", "g12", "g1", "g2", "g3", "g4", "g5"];

activeGrades.forEach(grade => {
  ["A", "B"].forEach(stream => {
    const count = 35 + Math.floor(Math.random() * 10);
    for (let i = 0; i < count; i++) {
      STUDENTS.push(generateStudent(grade, stream));
    }
  });
});

["pg", "pp1", "pp2"].forEach(grade => {
  const count = 20 + Math.floor(Math.random() * 10);
  for (let i = 0; i < count; i++) {
    STUDENTS.push(generateStudent(grade, "A"));
  }
});

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

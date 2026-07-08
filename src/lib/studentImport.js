import * as XLSX from 'xlsx';
import { GRADE_NAME_TO_CODE, LEVELS } from './schoolLevels';

// Grade constants moved to schoolLevels.js — re-exported so existing imports keep working.
export { GRADES_BY_LEVEL, GRADE_NAME_TO_CODE, GRADE_CODE_TO_NAME } from './schoolLevels';

// Every grade the system knows about, regardless of a school's configured
// levels — used to tell "this isn't a grade" apart from "this school does not
// teach that grade".
const ALL_GRADE_NAMES = Object.values(LEVELS).flat();

// ---------------------------------------------------------------------------
// Lenient normalizers for the standard fields. A bulk import should accept the
// many ways people actually type these values ("G10", "g 10", "grade10",
// "MALE", "boarding") and quietly canonicalize them, rather than rejecting the
// row. Each returns { value, matched, changed } so the caller can note what it
// interpreted. `matched: false` means we genuinely couldn't resolve it.

// "G10" | "g 10" | "grade10" | "GR 10" | "10" | "pp1" | "PP 2" → a valid grade.
export function normalizeGrade(raw, validGrades) {
  const s = String(raw ?? '').trim();
  if (!s) return { value: '', matched: false, changed: false };

  const exact = validGrades.find(g => g.toLowerCase() === s.toLowerCase());
  if (exact) return { value: exact, matched: true, changed: exact !== s };

  const up = s.toUpperCase().replace(/[._-]/g, ' ');

  // Pre-primary: PP1, PP 1, P.P.2, PRE PRIMARY 1
  const pp = up.match(/^P\s*P\s*0*(\d)/) || (/PRE/.test(up) && up.match(/(\d)/));
  if (pp) {
    const cand = 'PP' + pp[1];
    const hit = validGrades.find(g => g.toLowerCase() === cand.toLowerCase());
    if (hit) return { value: hit, matched: true, changed: true };
  }

  // Grade N / G N / GR N / STD N / plain N — but never "Form N" (ambiguous).
  if (!/PP|PRE|FORM/.test(up)) {
    const num = up.match(/(\d{1,2})/);
    if (num) {
      const cand = 'Grade ' + parseInt(num[1], 10);
      const hit = validGrades.find(g => g.toLowerCase() === cand.toLowerCase());
      if (hit) return { value: hit, matched: true, changed: true };
    }
  }

  return { value: s, matched: false, changed: false };
}

// Case- and whitespace-insensitive match against a configured name list
// (streams, dorms). Blank is allowed for optional fields.
export function normalizeName(raw, validNames) {
  const s = String(raw ?? '').trim();
  if (!s) return { value: '', matched: true, changed: false };
  const key = (v) => v.toLowerCase().replace(/\s+/g, '');
  const hit = validNames.find(n => key(n) === key(s));
  if (hit) return { value: hit, matched: true, changed: hit !== s };
  return { value: s, matched: false, changed: false };
}

// M / F from many spellings.
export function normalizeGender(raw) {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return { value: '', matched: false, changed: false };
  if (['m', 'male', 'boy', 'b'].includes(s)) return { value: 'M', matched: true, changed: s !== 'M' };
  if (['f', 'female', 'girl', 'g'].includes(s)) return { value: 'F', matched: true, changed: s !== 'F' };
  return { value: s.toUpperCase(), matched: false, changed: false };
}

// Day / Boarder from "d", "day", "b", "boarder", "boarding", "resident".
export function normalizeBoarding(raw) {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return { value: 'day', matched: true, changed: false, blank: true };
  if (/^(b|board|resid)/.test(s)) return { value: 'boarder', matched: true, changed: s !== 'boarder' };
  if (/^(d|day)/.test(s)) return { value: 'day', matched: true, changed: s !== 'day' };
  return { value: 'day', matched: false, changed: true };
}

const TEMPLATE_HEADERS = ["Adm No", "Full Name", "Grade", "Stream", "Gender", "Parent Phone", "Boarding", "Dorm"];

const EXAMPLE_ROWS = [
  ["2026/001", "Mary Wanjiku Kamau", "", "", "F", "0712345678", "Day", ""],
  ["2026/002", "Brian Otieno Ouma", "", "", "M", "0723456789", "Boarder", ""],
  ["2026/003", "Faith Achieng Odhiambo", "", "", "F", "", "Day", ""],
];

export function buildTemplate({ schoolName, defaultGrade, defaultStream, defaultGender, validGrades, validStreams, validDorms = [] }) {
  const wb = XLSX.utils.book_new();

  const rows = EXAMPLE_ROWS.map(r => {
    const copy = [...r];
    copy[2] = defaultGrade || "";
    copy[3] = defaultStream || "";
    if (defaultGender && defaultGender !== "per_row") copy[4] = defaultGender;
    return copy;
  });

  while (rows.length < 50) {
    rows.push(["", "", defaultGrade || "", defaultStream || "", defaultGender && defaultGender !== "per_row" ? defaultGender : "", "", "Day", ""]);
  }

  const data = [TEMPLATE_HEADERS, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(data);

  ws['!cols'] = [
    { wch: 14 },
    { wch: 32 },
    { wch: 12 },
    { wch: 14 },
    { wch: 8 },
    { wch: 16 },
    { wch: 12 },
    { wch: 14 },
  ];

  const lastRow = rows.length + 1;

  const gradeListRef = validGrades.length ? `"${validGrades.join(',')}"` : null;
  const streamListRef = validStreams.length ? `"${validStreams.join(',')}"` : null;

  ws['!dataValidation'] = [];
  if (gradeListRef) {
    ws['!dataValidation'].push({
      sqref: `C2:C${lastRow}`,
      type: 'list',
      formulae: [gradeListRef],
    });
  }
  if (streamListRef) {
    ws['!dataValidation'].push({
      sqref: `D2:D${lastRow}`,
      type: 'list',
      formulae: [streamListRef],
    });
  }
  ws['!dataValidation'].push({
    sqref: `E2:E${lastRow}`,
    type: 'list',
    formulae: [`"M,F"`],
  });
  ws['!dataValidation'].push({
    sqref: `G2:G${lastRow}`,
    type: 'list',
    formulae: [`"Day,Boarder"`],
  });
  if (validDorms.length) {
    ws['!dataValidation'].push({
      sqref: `H2:H${lastRow}`,
      type: 'list',
      formulae: [`"${validDorms.join(',')}"`],
    });
  }

  XLSX.utils.book_append_sheet(wb, ws, "Students");

  const instructionRows = [
    [`${schoolName || 'School'} — Student Bulk Import Template`],
    [],
    ["How to use this template:"],
    ["1. Open the 'Students' sheet."],
    ["2. Fill one row per student. The first 3 rows are examples — overwrite or delete them."],
    ["3. Required fields: Adm No, Full Name."],
    ["4. Optional fields: Stream, Gender, Parent Phone, Boarding, Dorm."],
    ["5. Grade and Stream defaults are already pre-filled — change per row if needed."],
    ["6. Save the file and upload it back into the Bulk Import wizard."],
    [],
    ["Field rules:"],
    ["Adm No — unique per school. Cannot duplicate existing admission numbers."],
    [`Full Name — written as one piece, e.g. "Mary Wanjiku Kamau".`],
    [`Grade — must be one of: ${validGrades.join(', ') || '(no grades configured)'}`],
    [`Stream — must be one of: ${validStreams.join(', ') || '(no streams configured — leave blank)'}`],
    ["Gender — M or F."],
    ["Parent Phone — optional, free text (e.g. 0712345678)."],
    ["Boarding — Day or Boarder. Blank defaults to Day."],
    [`Dorm — boarders only (optional). Leave blank for day scholars. Must be one of: ${validDorms.join(', ') || '(no dorms configured — leave blank)'}`],
  ];
  const wsInfo = XLSX.utils.aoa_to_sheet(instructionRows);
  wsInfo['!cols'] = [{ wch: 80 }];
  XLSX.utils.book_append_sheet(wb, wsInfo, "Instructions");

  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
}

export function downloadTemplate(opts) {
  const buffer = buildTemplate(opts);
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeName = (opts.schoolName || 'school').replace(/[^a-z0-9]+/gi, '_').toLowerCase();
  a.href = url;
  a.download = `${safeName}_student_import_template.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function parseExcelFile(file) {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const sheetName = wb.SheetNames.find(n => n.toLowerCase() === 'students') || wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
  if (rows.length === 0) return { headers: [], rows: [] };
  const headers = rows[0].map(h => String(h || '').trim());
  const data = rows.slice(1)
    .map(r => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = String(r[i] ?? '').trim(); });
      return obj;
    })
    .filter(r => Object.values(r).some(v => v !== ''));
  return { headers, rows: data };
}

export function validateRows(parsedRows, { validGrades, validStreams, validDorms = [], existingAdmNos }) {
  const seenAdmNos = new Set();
  const results = [];

  parsedRows.forEach((row, idx) => {
    const errors = [];
    const warnings = [];
    const notes = [];   // informational auto-corrections (row stays valid)

    const admNo = row['Adm No'] || '';
    const fullName = row['Full Name'] || '';
    const rawGrade = row['Grade'] || '';
    const rawStream = row['Stream'] || '';
    const rawGender = row['Gender'] || '';
    const rawBoarding = row['Boarding'] || '';
    const rawDorm = row['Dorm'] || '';
    const phone = row['Parent Phone'] || '';

    if (!admNo) errors.push('Adm No is required');
    if (!fullName) errors.push('Full Name is required');

    if (admNo && seenAdmNos.has(admNo)) errors.push(`Adm No "${admNo}" is duplicated in this file`);
    if (admNo) seenAdmNos.add(admNo);

    if (admNo && existingAdmNos.has(admNo)) errors.push(`Adm No "${admNo}" already exists in the school`);

    // Grade — lenient: "G10" / "g 10" / "10" → "Grade 10".
    let grade = '';
    if (!rawGrade) {
      errors.push('Grade is required');
    } else {
      const g = normalizeGrade(rawGrade, validGrades);
      if (g.matched) {
        grade = g.value;
        if (g.changed) notes.push(`Grade read as "${grade}"`);
      } else {
        // Distinguish "not a grade at all" from "a real grade this school does
        // not teach" so the user gets an actionable message.
        const globally = normalizeGrade(rawGrade, ALL_GRADE_NAMES);
        if (globally.matched) {
          errors.push(`${globally.value} is not offered at this school (this school teaches: ${validGrades.join(', ')})`);
        } else {
          errors.push(`Grade "${rawGrade}" is not valid (expected one of: ${validGrades.join(', ')})`);
        }
      }
    }

    // Stream — case/spacing-insensitive against configured streams.
    let stream = '';
    if (rawStream && validStreams.length) {
      const st = normalizeName(rawStream, validStreams);
      if (st.matched) {
        stream = st.value;
        if (st.changed) notes.push(`Stream read as "${stream}"`);
      } else {
        errors.push(`Stream "${rawStream}" is not valid (expected one of: ${validStreams.join(', ')})`);
      }
    } else if (rawStream) {
      stream = rawStream;   // no streams configured — kept as text, ignored on insert
    }

    // Gender — M/F from many spellings; blank defaults to M.
    let gender = 'M';
    if (!rawGender) {
      warnings.push('Gender is blank — defaults to M');
    } else {
      const gd = normalizeGender(rawGender);
      if (gd.matched) {
        gender = gd.value;
        if (gd.changed) notes.push(`Gender read as "${gender}"`);
      } else {
        errors.push(`Gender "${rawGender}" must be M or F`);
      }
    }

    // Boarding — Day/Boarder from many spellings; blank defaults to Day.
    const bd = normalizeBoarding(rawBoarding);
    const boarding = bd.value;
    if (!bd.matched) notes.push(`Boarding "${rawBoarding}" not recognised — treated as Day`);
    else if (bd.changed && !bd.blank) notes.push(`Boarding read as "${boarding === 'boarder' ? 'Boarder' : 'Day'}"`);

    // Dorm — case/spacing-insensitive against configured dorms.
    let dorm = '';
    if (rawDorm) {
      const dm = normalizeName(rawDorm, validDorms);
      if (dm.matched && dm.value) {
        dorm = dm.value;
        if (dm.changed) notes.push(`Dorm read as "${dorm}"`);
      } else {
        errors.push(`Dorm "${rawDorm}" is not valid (expected one of: ${validDorms.join(', ') || 'none configured'})`);
      }
    }
    if (dorm && boarding !== 'boarder') {
      warnings.push('Dorm set but boarding is Day — student will be treated as a boarder');
    }

    if (!phone) warnings.push('Phone is blank');

    results.push({
      rowIndex: idx + 2,
      admNo,
      fullName,
      grade,
      stream,
      gender,
      phone,
      boarding: dorm ? 'boarder' : boarding,
      dorm,
      errors,
      warnings,
      notes,
      isValid: errors.length === 0,
    });
  });

  return results;
}

export function toInsertPayload(validatedRow, { schoolId, streamNameToId, dormNameToId = {} }) {
  return {
    school_id: schoolId,
    adm_no: validatedRow.admNo,
    first_name: validatedRow.fullName,
    last_name: '',
    gender: validatedRow.gender,
    level_id: GRADE_NAME_TO_CODE[validatedRow.grade],
    stream_id: validatedRow.stream ? (streamNameToId[validatedRow.stream] || null) : null,
    boarding_status: validatedRow.boarding === 'boarder' ? 'boarder' : 'day',
    dorm_id: validatedRow.boarding === 'boarder' && validatedRow.dorm ? (dormNameToId[validatedRow.dorm] || null) : null,
    parent_phone: validatedRow.phone || null,
    status: 'Active',
  };
}

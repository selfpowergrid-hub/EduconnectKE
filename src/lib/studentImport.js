import * as XLSX from 'xlsx';

export const GRADES_BY_LEVEL = {
  "Pre-Primary": ["PP1", "PP2"],
  "Primary": ["Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6"],
  "Junior Secondary": ["Grade 7", "Grade 8", "Grade 9"],
  "Senior Secondary": ["Grade 10", "Grade 11", "Grade 12"]
};

export const GRADE_NAME_TO_CODE = {
  "PP1": "pp1", "PP2": "pp2",
  "Grade 1": "g1", "Grade 2": "g2", "Grade 3": "g3",
  "Grade 4": "g4", "Grade 5": "g5", "Grade 6": "g6",
  "Grade 7": "g7", "Grade 8": "g8", "Grade 9": "g9",
  "Grade 10": "g10", "Grade 11": "g11", "Grade 12": "g12"
};

export const GRADE_CODE_TO_NAME = Object.fromEntries(
  Object.entries(GRADE_NAME_TO_CODE).map(([k, v]) => [v, k])
);

const TEMPLATE_HEADERS = ["Adm No", "Full Name", "Grade", "Stream", "Gender", "Parent Phone"];

const EXAMPLE_ROWS = [
  ["2026/001", "Mary Wanjiku Kamau", "", "", "F", "0712345678"],
  ["2026/002", "Brian Otieno Ouma", "", "", "M", "0723456789"],
  ["2026/003", "Faith Achieng Odhiambo", "", "", "F", ""],
];

export function buildTemplate({ schoolName, defaultGrade, defaultStream, defaultGender, validGrades, validStreams }) {
  const wb = XLSX.utils.book_new();

  const rows = EXAMPLE_ROWS.map(r => {
    const copy = [...r];
    copy[2] = defaultGrade || "";
    copy[3] = defaultStream || "";
    if (defaultGender && defaultGender !== "per_row") copy[4] = defaultGender;
    return copy;
  });

  while (rows.length < 50) {
    rows.push(["", "", defaultGrade || "", defaultStream || "", defaultGender && defaultGender !== "per_row" ? defaultGender : "", ""]);
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

  XLSX.utils.book_append_sheet(wb, ws, "Students");

  const instructionRows = [
    [`${schoolName || 'School'} — Student Bulk Import Template`],
    [],
    ["How to use this template:"],
    ["1. Open the 'Students' sheet."],
    ["2. Fill one row per student. The first 3 rows are examples — overwrite or delete them."],
    ["3. Required fields: Adm No, Full Name."],
    ["4. Optional fields: Grade, Stream, Gender, Parent Phone."],
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

export function validateRows(parsedRows, { validGrades, validStreams, existingAdmNos }) {
  const seenAdmNos = new Set();
  const results = [];

  parsedRows.forEach((row, idx) => {
    const errors = [];
    const warnings = [];

    const admNo = row['Adm No'] || '';
    const fullName = row['Full Name'] || '';
    const grade = row['Grade'] || '';
    const stream = row['Stream'] || '';
    const gender = (row['Gender'] || '').toUpperCase();
    const phone = row['Parent Phone'] || '';

    if (!admNo) errors.push('Adm No is required');
    if (!fullName) errors.push('Full Name is required');

    if (admNo && seenAdmNos.has(admNo)) errors.push(`Adm No "${admNo}" is duplicated in this file`);
    if (admNo) seenAdmNos.add(admNo);

    if (admNo && existingAdmNos.has(admNo)) errors.push(`Adm No "${admNo}" already exists in the school`);

    if (grade && !validGrades.includes(grade)) errors.push(`Grade "${grade}" is not valid (expected one of: ${validGrades.join(', ')})`);
    if (!grade) errors.push('Grade is required');

    if (stream && validStreams.length && !validStreams.includes(stream)) {
      errors.push(`Stream "${stream}" is not valid (expected one of: ${validStreams.join(', ')})`);
    }

    if (gender && gender !== 'M' && gender !== 'F') errors.push(`Gender "${gender}" must be M or F`);
    if (!gender) warnings.push('Gender is blank — defaults to M');

    if (!phone) warnings.push('Phone is blank');

    results.push({
      rowIndex: idx + 2,
      admNo,
      fullName,
      grade,
      stream,
      gender: gender || 'M',
      phone,
      errors,
      warnings,
      isValid: errors.length === 0,
    });
  });

  return results;
}

export function toInsertPayload(validatedRow, { schoolId, streamNameToId }) {
  return {
    school_id: schoolId,
    adm_no: validatedRow.admNo,
    first_name: validatedRow.fullName,
    last_name: '',
    gender: validatedRow.gender,
    level_id: GRADE_NAME_TO_CODE[validatedRow.grade],
    stream_id: validatedRow.stream ? (streamNameToId[validatedRow.stream] || null) : null,
    parent_phone: validatedRow.phone || null,
    status: 'Active',
  };
}

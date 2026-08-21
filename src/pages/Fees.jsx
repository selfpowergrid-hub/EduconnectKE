import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
import { GRADE_NAME_TO_CODE, GRADE_CODE_TO_NAME, gradesByLevelForSchool } from '../lib/schoolLevels';

// Pricing is now keyed per grade (fee_level stores the grade code directly);
// the CBC band only survives as an invoice-generation target on the server.

const studentName = (s) => `${s.first_name || ""} ${s.last_name || ""}`.trim();

const FEE_LEVEL_LABEL = {
  pp: "Pre-Primary (PP1–PP2)",
  lower_pri: "Lower Primary (G1–G3)",
  upper_pri: "Upper Primary (G4–G6)",
  jss: "Junior Secondary (G7–G9)",
  sss: "Senior Secondary (G10–G12)",
};

// Which CBC fee bands belong to each institutional level, so the invoice
// wizard only offers bands the school actually teaches.
const FEE_LEVELS_BY_SCHOOL_LEVEL = {
  "Pre-Primary": ["pp"],
  "Primary": ["lower_pri", "upper_pri"],
  "Junior Secondary": ["jss"],
  "Senior Secondary": ["sss"],
};

const INVOICE_STATUS_STYLE = {
  issued:         { background: "#EAF2FA", color: "#1A5F9C", label: "Issued" },
  partially_paid: { background: "#FEF6E7", color: "#8A6A1F", label: "Partially Paid" },
  paid:           { background: "#E8F5EE", color: "#1B6B3A", label: "Paid" },
  cancelled:      { background: "#F5F6F8", color: "#8A8FA8", label: "Cancelled" },
};

// KES amount in words for receipts, e.g. 15250 -> "Fifteen Thousand Two
// Hundred and Fifty Shillings Only".
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function threeDigitsInWords(n) {
  const parts = [];
  if (n >= 100) {
    parts.push(ONES[Math.floor(n / 100)] + " Hundred");
    n %= 100;
    if (n > 0) parts.push("and");
  }
  if (n >= 20) {
    parts.push(TENS[Math.floor(n / 10)] + (n % 10 ? "-" + ONES[n % 10] : ""));
  } else if (n > 0) {
    parts.push(ONES[n]);
  }
  return parts.join(" ");
}

function amountInWords(amount) {
  let n = Math.round(Number(amount) || 0);
  if (n <= 0) return "Zero Shillings Only";
  const groups = [];
  const names = ["", " Thousand", " Million", " Billion"];
  let gi = 0;
  while (n > 0 && gi < names.length) {
    const chunk = n % 1000;
    if (chunk > 0) groups.unshift(threeDigitsInWords(chunk) + names[gi]);
    n = Math.floor(n / 1000);
    gi += 1;
  }
  return groups.join(" ") + " Shillings Only";
}

const Fees = ({ schoolConfig }) => {
  // Levels/grades scoped to what this school actually teaches.
  const GRADES_BY_LEVEL = useMemo(
    () => gradesByLevelForSchool(schoolConfig?.schoolType),
    [schoolConfig?.schoolType]
  );
  const defaultLevel = Object.keys(GRADES_BY_LEVEL)[0];
  const scopedGradeNames = useMemo(
    () => Object.values(GRADES_BY_LEVEL).flat(),
    [GRADES_BY_LEVEL]
  );
  const feeLevelOptions = useMemo(
    () => Object.keys(GRADES_BY_LEVEL).flatMap(l => FEE_LEVELS_BY_SCHOOL_LEVEL[l] || []),
    [GRADES_BY_LEVEL]
  );
  const [activeTab, setActiveTab] = useState("balances");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedLevel, setSelectedLevel] = useState(defaultLevel);
  const [selectedGrade, setSelectedGrade] = useState(GRADES_BY_LEVEL[defaultLevel][0]);
  // Stream filter — "all" by default (full student list); only narrows when
  // the user explicitly picks a stream. Streams are school-wide, so the
  // selection stays valid across level/grade changes.
  const [selectedStream, setSelectedStream] = useState("all");
  const [year, setYear] = useState(new Date().getFullYear());

  const [studentsList, setStudentsList] = useState([]);
  const [structureRows, setStructureRows] = useState([]);   // published fee_structures rows for the year
  const [studentCharges, setStudentCharges] = useState([]); // per-student specific votehead charges
  const [voteheadsById, setVoteheadsById] = useState({});   // votehead id -> { applies_to, is_active, priority, code, description }
  const [paidByStudent, setPaidByStudent] = useState({});   // student_id -> total paid (active)
  const [payments, setPayments] = useState([]);             // recent fee_payments rows
  const [allocations, setAllocations] = useState([]);       // active allocations (real per-votehead/term paid)
  const [allocModeDefault, setAllocModeDefault] = useState("priority");
  const [termDefaultSetting, setTermDefaultSetting] = useState(""); // '' = by calendar
  const appliedWorkingYear = useRef(false); // apply the school's working year once
  const [feeCats, setFeeCats] = useState([]);              // Day/Boarder + special categories
  const [studentFeeCats, setStudentFeeCats] = useState([]); // per-year, per-term special category assignments
  const [openingBalances, setOpeningBalances] = useState([]); // manual per-student lump balances (mid-year adoption)
  const [openingCredits, setOpeningCredits] = useState([]);   // brought-forward prepayments (credit on account)
  const [isLoading, setIsLoading] = useState(true);

  // Fee Balances term filter + per-student drill-down
  const [termFilter, setTermFilter] = useState("all");      // 'all' | '1' | '2' | '3'
  const [studentModal, setStudentModal] = useState(null);   // student row or null

  // Record-payment modal
  const [payModalFor, setPayModalFor] = useState(null);     // student row or null
  const [payForm, setPayForm] = useState({ amount: "", term: "", method: "mpesa", reference: "", payer_name: "", allocMode: "" });
  const [isSavingPayment, setIsSavingPayment] = useState(false);

  // Receipts
  const [receiptByPayment, setReceiptByPayment] = useState({}); // payment_id -> receipt row
  const [receiptView, setReceiptView] = useState(null);         // data for the receipt modal

  // Discounts & bursaries
  const [sponsors, setSponsors] = useState([]);
  const [adjustments, setAdjustments] = useState([]);
  const [bursaries, setBursaries] = useState([]);
  const [newSponsor, setNewSponsor] = useState({ name: "", type: "cdf", contact: "" });
  const [showAwardModal, setShowAwardModal] = useState(false);
  const [awardForm, setAwardForm] = useState({ studentQuery: "", student_id: "", sponsor_id: "", amount: "", term: "", reference: "" });
  const [isAwarding, setIsAwarding] = useState(false);
  const [discountForm, setDiscountForm] = useState({ kind: "discount", calc: "fixed", value: "", reason: "" });
  const [isApplyingDiscount, setIsApplyingDiscount] = useState(false);

  // Invoices
  const [invoices, setInvoices] = useState([]);
  const [streamsList, setStreamsList] = useState([]);
  const [invTermFilter, setInvTermFilter] = useState("all");
  const [showGenModal, setShowGenModal] = useState(false);
  const [genForm, setGenForm] = useState({ term: "1", scope: "school", feeLevel: feeLevelOptions[0], grade: scopedGradeNames[0], streamId: "", dueDate: "" });
  const [isGenerating, setIsGenerating] = useState(false);
  const [genResult, setGenResult] = useState(null);
  const [invoiceModal, setInvoiceModal] = useState(null);   // invoice row or null
  const [invoiceItems, setInvoiceItems] = useState([]);
  const [customCharge, setCustomCharge] = useState({ description: "", amount: "" });
  const [isAddingCharge, setIsAddingCharge] = useState(false);

  // Student Charges Tab
  const [studentChargeModal, setStudentChargeModal] = useState(null); // student row or null
  const [isSavingCharge, setIsSavingCharge] = useState(false);
  const [chargeFormRows, setChargeFormRows] = useState([]); // array of { id?, votehead_id, t1, t2, t3, notes }

  // Inline "edit fees" inside the breakdown modal — this ONE student's per-
  // votehead amounts. Already-invoiced terms are locked (estimated-only edits).
  const [feeEdit, setFeeEdit] = useState(false);
  const [feeEditRows, setFeeEditRows] = useState([]); // [{ votehead_id, t1, t2, t3 }]
  const [feeAddVh, setFeeAddVh] = useState('');
  const [isSavingFees, setIsSavingFees] = useState(false);

  // Collapsible "Payments & Receipts" list inside the breakdown modal.
  const [showPayList, setShowPayList] = useState(false);

  // "Student Balances" tab — manual per-student lump balances (mid-year adoption).
  const [balanceVh, setBalanceVh] = useState('');        // votehead for the batch
  const [balanceMode, setBalanceMode] = useState('replace'); // 'replace' | 'add'
  const [balanceInputs, setBalanceInputs] = useState({}); // studentId -> typed amount
  const [isSavingBalances, setIsSavingBalances] = useState(false);
  // Excel import into the Student Balances tab (auto-detect cols, preview, apply).
  const [importPanel, setImportPanel] = useState(false);
  const [importSheets, setImportSheets] = useState([]);   // [{ name, aoa }]
  const [importSheetIdx, setImportSheetIdx] = useState(0);
  const [importHeaders, setImportHeaders] = useState([]);
  const [importRows, setImportRows] = useState([]);      // data rows (arrays)
  const [importAdmCol, setImportAdmCol] = useState(-1);
  const [importBalCol, setImportBalCol] = useState(-1);
  const [importFileName, setImportFileName] = useState('');
  const balanceFileRef = useRef(null);

  const openStudentCharges = (student) => {
    const existing = studentCharges.filter(c => c.student_id === student.id);
    const initialRows = existing.map(e => ({
      id: e.id,
      votehead_id: e.votehead_id,
      t1: e.t1, t2: e.t2, t3: e.t3,
      notes: e.notes || ''
    }));
    setChargeFormRows(initialRows);
    setStudentChargeModal(student);
  };

  const handleSaveStudentCharges = async () => {
    setIsSavingCharge(true);
    try {
      const student = studentChargeModal;
      const user = (await supabase.auth.getUser()).data.user;

      const uniqueVoteheads = new Set();
      for (const r of chargeFormRows) {
        if (!r.votehead_id) continue;
        if (uniqueVoteheads.has(r.votehead_id)) {
          throw new Error('The same votehead appears on two rows — merge them into one.');
        }
        uniqueVoteheads.add(r.votehead_id);
        if ((Number(r.t1) || 0) < 0 || (Number(r.t2) || 0) < 0 || (Number(r.t3) || 0) < 0) {
          throw new Error('Amounts cannot be negative.');
        }
      }

      // Rows are keyed by (student, votehead, year) — never by id — so a mix
      // of new and existing rows upserts cleanly, and switching a row's
      // votehead behaves as delete-old + insert-new.
      const rows = chargeFormRows.filter(r => r.votehead_id).map(r => ({
        school_id: schoolConfig.id,
        student_id: student.id,
        votehead_id: r.votehead_id,
        year: year,
        t1: Number(r.t1) || 0,
        t2: Number(r.t2) || 0,
        t3: Number(r.t3) || 0,
        notes: (r.notes || '').trim() || null,
        created_by: user?.id || null,
      }));

      const keepVoteheads = new Set(rows.map(r => r.votehead_id));
      const toDelete = studentCharges
        .filter(c => c.student_id === student.id && !keepVoteheads.has(c.votehead_id))
        .map(c => c.id);

      if (toDelete.length > 0) {
        const { error: delErr } = await supabase
          .from('student_votehead_charges').delete().in('id', toDelete);
        if (delErr) throw delErr;
      }
      if (rows.length > 0) {
        const { error } = await supabase
          .from('student_votehead_charges')
          .upsert(rows, { onConflict: 'school_id,student_id,votehead_id,year' });
        if (error) throw error;
      }

      await loadAll();
      setStudentChargeModal(null);
    } catch (err) {
      alert((err.message || '').includes('row-level security')
        ? 'Your sign-in session appears to have expired. Refresh the page (or sign out and back in) and try again.'
        : 'Failed to save charges: ' + err.message);
    } finally {
      setIsSavingCharge(false);
    }
  };

  // ---- Inline fee editing (breakdown modal) — this student only -------------

  // Which terms are locked for the open student: any already invoiced.
  const lockedTermsFor = (s) => invoicedTermByStudent[s.id] || new Set();

  const startFeeEdit = (s) => {
    const rows = effectiveRowsFor(s)
      .map(r => ({ ...r, vh: voteheadsById[r.votehead_id] }))
      .filter(({ vh }) => !!vh)
      .sort((a, b) => (a.vh?.priority ?? 999) - (b.vh?.priority ?? 999) || (a.vh?.display_order ?? 0) - (b.vh?.display_order ?? 0))
      .map(r => ({ votehead_id: r.votehead_id, t1: Number(r.t1) || 0, t2: Number(r.t2) || 0, t3: Number(r.t3) || 0 }));
    setFeeEditRows(rows);
    setFeeAddVh('');
    setFeeEdit(true);
  };

  const cancelFeeEdit = () => { setFeeEdit(false); setFeeEditRows([]); setFeeAddVh(''); };

  const setFeeCell = (vhId, termKey, val) => {
    const clean = val === '' ? '' : Math.max(0, Number(val) || 0);
    setFeeEditRows(rows => rows.map(r => r.votehead_id === vhId ? { ...r, [termKey]: clean } : r));
  };

  const addFeeVotehead = (vhId) => {
    if (!vhId || feeEditRows.some(r => r.votehead_id === vhId)) return;
    setFeeEditRows(rows => [...rows, { votehead_id: vhId, t1: 0, t2: 0, t3: 0 }]);
    setFeeAddVh('');
  };

  const removeFeeVotehead = (vhId) => setFeeEditRows(rows => rows.filter(r => r.votehead_id !== vhId));

  // Save this student's edits: only voteheads that DIFFER from the class fee
  // structure become override rows; ones set back to the structure delete any
  // existing override, so a student never carries a needless override.
  const handleSaveFeeEdit = async () => {
    setIsSavingFees(true);
    try {
      const s = studentModal;
      const user = (await supabase.auth.getUser()).data.user;
      const base = baseRowsFor(s); // Map<votehead_id, { t1, t2, t3 }>
      const existing = studentCharges.filter(c => c.student_id === s.id);
      const existingByVh = new Map(existing.map(c => [c.votehead_id, c]));

      const toUpsert = [];
      const toDelete = [];
      feeEditRows.forEach(r => {
        if (!r.votehead_id) return;
        const t1 = Number(r.t1) || 0, t2 = Number(r.t2) || 0, t3 = Number(r.t3) || 0;
        const b = base.get(r.votehead_id);
        const sameAsBase = b && (Number(b.t1) || 0) === t1 && (Number(b.t2) || 0) === t2 && (Number(b.t3) || 0) === t3;
        if (sameAsBase) {
          const ex = existingByVh.get(r.votehead_id);
          if (ex) toDelete.push(ex.id);
        } else {
          toUpsert.push({ school_id: schoolConfig.id, student_id: s.id, votehead_id: r.votehead_id, year, t1, t2, t3, created_by: user?.id || null });
        }
      });
      // Voteheads removed from the editor that had an override → drop them.
      const kept = new Set(feeEditRows.map(r => r.votehead_id));
      existing.forEach(c => { if (!kept.has(c.votehead_id)) toDelete.push(c.id); });

      if (toDelete.length) {
        const { error } = await supabase.from('student_votehead_charges').delete().in('id', toDelete);
        if (error) throw error;
      }
      if (toUpsert.length) {
        const { error } = await supabase.from('student_votehead_charges')
          .upsert(toUpsert, { onConflict: 'school_id,student_id,votehead_id,year' });
        if (error) throw error;
      }
      await loadAll();
      cancelFeeEdit();
    } catch (err) {
      alert((err.message || '').includes('row-level security')
        ? 'Your sign-in session appears to have expired. Refresh the page and try again.'
        : 'Failed to save fees: ' + err.message);
    } finally {
      setIsSavingFees(false);
    }
  };


  useEffect(() => {
    if (schoolConfig?.id) loadAll();
  }, [schoolConfig?.id, year]);

  // Student Balances tab: auto-pick a votehead, then seed the amount inputs
  // (and the replace/add mode) from what's already saved for that votehead.
  useEffect(() => {
    if (activeTab !== 'student_balances') return;
    const activeVhs = Object.values(voteheadsById).filter(v => v.is_active !== false);
    if (!balanceVh && activeVhs.length) {
      setBalanceVh([...activeVhs].sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999))[0].id);
      return;
    }
    const seed = {};
    let seededMode = null;
    openingBalances.forEach(o => { if (o.votehead_id === balanceVh) { seed[o.student_id] = String(o.amount); seededMode = o.mode; } });
    // A prepayment shows as a negative figure.
    openingCredits.forEach(c => { if (seed[c.student_id] === undefined) seed[c.student_id] = String(-Number(c.amount)); });
    setBalanceInputs(seed);
    if (seededMode) setBalanceMode(seededMode);
  }, [activeTab, balanceVh, openingBalances, openingCredits, voteheadsById]);

  // Save the batch: shown students with a positive amount are upserted (with the
  // chosen votehead + mode); ones cleared to blank/0 have their balance removed.
  const handleSaveBalances = async () => {
    if (!balanceVh) { alert('Choose a votehead first.'); return; }
    setIsSavingBalances(true);
    try {
      const user = (await supabase.auth.getUser()).data.user;
      // Existing rows for this batch's votehead (arrears) and per-student credits.
      const existBal = {}; openingBalances.forEach(o => { if (o.votehead_id === balanceVh) existBal[o.student_id] = o; });
      const existCred = {}; openingCredits.forEach(c => { existCred[c.student_id] = c; });
      const balUpsert = [], balDelete = [], credUpsert = [], credDelete = [];
      filteredStudents.forEach(s => {
        const raw = balanceInputs[s.id];
        const blank = raw === '' || raw === undefined || raw === null || String(raw).trim() === '';
        const amt = blank ? 0 : Number(raw);
        if (!isFinite(amt) || amt === 0) {                 // clear both
          if (existBal[s.id]) balDelete.push(existBal[s.id].id);
          if (existCred[s.id]) credDelete.push(existCred[s.id].id);
        } else if (amt > 0) {                              // arrear (owes)
          balUpsert.push({ school_id: schoolConfig.id, student_id: s.id, votehead_id: balanceVh, year, amount: amt, mode: balanceMode, created_by: user?.id || null });
          if (existCred[s.id]) credDelete.push(existCred[s.id].id);
        } else {                                            // negative = prepayment / credit
          credUpsert.push({ school_id: schoolConfig.id, student_id: s.id, year, amount: -amt, created_by: user?.id || null });
          if (existBal[s.id]) balDelete.push(existBal[s.id].id);
        }
      });
      const run = async (table, del, up, conflict) => {
        if (del.length) { const { error } = await supabase.from(table).delete().in('id', del); if (error) throw error; }
        if (up.length) { const { error } = await supabase.from(table).upsert(up, { onConflict: conflict }); if (error) throw error; }
      };
      await run('student_opening_balances', balDelete, balUpsert, 'school_id,student_id,votehead_id,year');
      await run('student_opening_credits', credDelete, credUpsert, 'school_id,student_id,year');
      await loadAll();
      alert(`Saved ${balUpsert.length} balance${balUpsert.length === 1 ? '' : 's'}${credUpsert.length ? `, ${credUpsert.length} credit${credUpsert.length === 1 ? '' : 's'}` : ''}.`);
    } catch (err) {
      alert((err.message || '').includes('row-level security')
        ? 'Your sign-in session appears to have expired. Refresh the page and try again.'
        : 'Failed to save balances: ' + err.message);
    } finally {
      setIsSavingBalances(false);
    }
  };

  // --- Excel balance import -------------------------------------------------
  const normAdm = (v) => String(v ?? '').trim().toUpperCase();

  // Export the shown students as a fill-in template (guarantees exact adm nos).
  const downloadBalanceTemplate = () => {
    const rows = [['Adm No', 'Student Name', 'Balance']];
    filteredStudents.forEach(s => rows.push([s.adm_no || '', studentName(s), '']));
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 14 }, { wch: 28 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Balances');
    const cls = (GRADE_CODE_TO_NAME[selectedGrade] || selectedGrade || 'students').replace(/\s+/g, '_');
    XLSX.writeFile(wb, `balances_template_${cls}_${year}.xlsx`);
  };

  const ADM_PATS = [/adm/, /admission/, /\breg/, /index/];
  const BAL_PATS = [/balance/, /amount/, /\bfees?\b/, /arrears/, /owed/, /\bbal\b/];
  const cellMatches = (cell, pats) => { const c = String(cell ?? '').toLowerCase().trim(); return !!c && pats.some(p => p.test(c)); };
  const detectCol = (headers, patterns) => headers.findIndex(h => cellMatches(h, patterns));

  // The real header row may sit below a title/banner. Prefer the first row that
  // has BOTH an admission-like and a balance-like heading; else first non-empty.
  const findHeaderRow = (aoa) => {
    for (let i = 0; i < Math.min(aoa.length, 25); i++) {
      const row = aoa[i] || [];
      if (row.some(c => cellMatches(c, ADM_PATS)) && row.some(c => cellMatches(c, BAL_PATS))) return i;
    }
    return aoa.findIndex(r => (r || []).some(c => String(c).trim() !== ''));
  };

  // Derive headers/rows/detected columns from one sheet of the loaded workbook.
  const applyImportSheet = (sheets, idx) => {
    setImportSheetIdx(idx);
    const aoa = sheets[idx]?.aoa || [];
    const hr = findHeaderRow(aoa);
    if (hr < 0) { setImportHeaders([]); setImportRows([]); setImportAdmCol(-1); setImportBalCol(-1); return; }
    const headers = aoa[hr].map(h => String(h).trim());
    const dataRows = aoa.slice(hr + 1).filter(r => r.some(c => String(c).trim() !== ''));
    setImportHeaders(headers);
    setImportRows(dataRows);
    setImportAdmCol(detectCol(headers, ADM_PATS));
    setImportBalCol(detectCol(headers, BAL_PATS));
  };

  const handleBalanceFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array' });
        const sheets = wb.SheetNames.map(name => ({
          name,
          aoa: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', raw: false }),
        }));
        if (!sheets.length) { alert('The workbook has no sheets.'); return; }
        setImportSheets(sheets);
        // Auto-pick the sheet that looks most like a balances table: a header
        // row with both adm + balance columns wins, then most data rows.
        const score = (s) => {
          const hr = findHeaderRow(s.aoa);
          if (hr < 0) return -1;
          const header = (s.aoa[hr] || []);
          const both = header.some(c => cellMatches(c, ADM_PATS)) && header.some(c => cellMatches(c, BAL_PATS));
          const dataCount = s.aoa.slice(hr + 1).filter(r => r.some(c => String(c).trim() !== '')).length;
          return (both ? 1e6 : 0) + dataCount;
        };
        let best = 0, bestScore = -Infinity;
        sheets.forEach((s, i) => { const sc = score(s); if (sc > bestScore) { bestScore = sc; best = i; } });
        applyImportSheet(sheets, best);
        setImportPanel(true);
      } catch (err) {
        alert('Could not read the file: ' + err.message);
      } finally {
        if (balanceFileRef.current) balanceFileRef.current.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const applyBalanceImport = () => {
    if (!balanceImportPreview) return;
    setBalanceInputs(prev => {
      const next = { ...prev };
      balanceImportPreview.matched.forEach(m => { next[m.id] = String(m.amount); });
      return next;
    });
    setImportPanel(false);
    setImportRows([]); setImportHeaders([]); setImportSheets([]);
  };

  const cancelBalanceImport = () => { setImportPanel(false); setImportRows([]); setImportHeaders([]); setImportSheets([]); };

  const loadAll = async () => {
    setIsLoading(true);
    try {
      const [students, structures, vhs, pays, invs, strms, spons, adjs, burs, allocs, settings, cats, scharges, sfcats, obals, ocreds] = await Promise.all([
        supabase.from('students').select('id, adm_no, first_name, last_name, level_id, stream_id, dorm_id, boarding_status, fee_category_id')
          .eq('school_id', schoolConfig.id),
        supabase.from('fee_structures').select('fee_level, votehead_id, category_id, t1, t2, t3, status')
          .eq('school_id', schoolConfig.id).eq('year', year),
        supabase.from('voteheads').select('id, applies_to, is_active, priority, display_order, code, description')
          .eq('school_id', schoolConfig.id),
        supabase.from('fee_payments')
          .select('id, student_id, amount, term, method, reference, paid_at, payer_name, status')
          .eq('school_id', schoolConfig.id).eq('year', year)
          .order('paid_at', { ascending: false }),
        supabase.from('fee_invoices').select('*')
          .eq('school_id', schoolConfig.id).eq('year', year)
          .order('created_at', { ascending: false }),
        // Streams are school-wide (no grade column) — selecting a nonexistent
        // level_id made this query fail silently and left streamsList empty.
        supabase.from('streams').select('id, name')
          .eq('school_id', schoolConfig.id).order('name'),
        supabase.from('fee_sponsors').select('*')
          .eq('school_id', schoolConfig.id).order('name'),
        supabase.from('fee_adjustments').select('*')
          .eq('school_id', schoolConfig.id).eq('year', year)
          .order('created_at', { ascending: false }),
        supabase.from('fee_bursary_awards').select('*, fee_sponsors(name)')
          .eq('school_id', schoolConfig.id).eq('year', year)
          .order('created_at', { ascending: false }),
        supabase.from('fee_payment_allocations')
          .select('amount, invoice_id, invoice_item_id, payment_id, adjustment_id, bursary_id, fee_invoices!inner(student_id, term, year), fee_invoice_items(votehead_id), fee_payments(status), fee_adjustments(status), fee_bursary_awards(status)')
          .eq('school_id', schoolConfig.id).eq('fee_invoices.year', year),
        supabase.from('fee_settings').select('allocation_mode, working_year, current_term')
          .eq('school_id', schoolConfig.id).maybeSingle(),
        supabase.from('fee_categories').select('id, name, kind')
          .eq('school_id', schoolConfig.id),
        supabase.from('student_votehead_charges').select('*')
          .eq('school_id', schoolConfig.id).eq('year', year),
        supabase.from('student_fee_categories').select('*')
          .eq('school_id', schoolConfig.id).eq('year', year),
        supabase.from('student_opening_balances').select('*')
          .eq('school_id', schoolConfig.id).eq('year', year),
        supabase.from('student_opening_credits').select('*')
          .eq('school_id', schoolConfig.id).eq('year', year),
      ]);

      if (students.error) throw students.error;
      if (structures.error) throw structures.error;
      if (vhs.error) throw vhs.error;
      if (pays.error) throw pays.error;
      if (invs.error) throw invs.error;
      if (scharges.error) throw scharges.error;
      setInvoices(invs.data || []);
      setStreamsList(strms.data || []);
      setSponsors(spons.data || []);
      setAdjustments(adjs.data || []);
      setBursaries(burs.data || []);
      // Keep only allocations whose source (payment/adjustment/bursary) is active.
      setAllocations((allocs.data || []).filter(a =>
        a.fee_payments?.status === 'active'
        || a.fee_adjustments?.status === 'active'
        || a.fee_bursary_awards?.status === 'active'));
      setAllocModeDefault(settings.data?.allocation_mode || 'priority');
      setTermDefaultSetting(settings.data?.current_term ? String(settings.data.current_term) : "");
      // Honour the school's working year (Finance Settings) on first load;
      // after that the on-screen year selector is in charge.
      if (!appliedWorkingYear.current) {
        appliedWorkingYear.current = true;
        if (settings.data?.working_year && settings.data.working_year !== year) {
          setYear(settings.data.working_year);
        }
      }
      setFeeCats(cats.data || []);
      setStudentCharges(scharges.data || []);
      setStudentFeeCats(sfcats.data || []);
      setOpeningBalances(obals.data || []);
      setOpeningCredits(ocreds.data || []);

      // Receipts (separate query: table may hold many years; key by payment)
      const paymentIds = (pays.data || []).map(p => p.id);
      if (paymentIds.length) {
        const { data: rcts } = await supabase
          .from('fee_receipts').select('payment_id, receipt_no, is_void, issued_at')
          .in('payment_id', paymentIds);
        setReceiptByPayment(Object.fromEntries((rcts || []).map(r => [r.payment_id, r])));
      } else {
        setReceiptByPayment({});
      }

      setStudentsList(students.data || []);
      setStructureRows((structures.data || []).filter(r => (r.status || 'published') === 'published'));
      setVoteheadsById(Object.fromEntries((vhs.data || []).map(v => [v.id, v])));

      const paid = {};
      (pays.data || []).forEach(p => {
        if (p.status === 'voided') return;
        paid[p.student_id] = (paid[p.student_id] || 0) + Number(p.amount);
      });
      setPaidByStudent(paid);
      setPayments(pays.data || []);
    } catch (err) {
      console.error('Error loading fees:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Boarder = the explicit boarding_status (falls back to dorm for old rows).
  const isBoarder = (s) => (s.boarding_status || (s.dorm_id ? 'boarder' : 'day')) === 'boarder';

  // A student's fee category. Rule: UNSPECIFIED students stay on the plain
  // "All students" sheet. Category pricing applies only via explicit
  // assignment, or the Boarder admission toggle (an explicit specification —
  // 'day' is merely the default and implies nothing).
  // A student's effective fee category FOR A GIVEN TERM. A special-category
  // assignment (student_fee_categories) applies only in the terms it covers
  // (t1/t2/t3), so a term-only special structure stops billing after that term.
  // Outside those terms — and for students with no assignment — we fall back to
  // the legacy standing field, then the boarder/day default.
  const categoryForTerm = (s, term) => {
    const sfc = studentFeeCats.find(x => x.student_id === s.id && x[`t${term}`]);
    if (sfc) return sfc.category_id;
    if (s.fee_category_id) return s.fee_category_id;
    if (isBoarder(s)) return feeCats.find(c => c.kind === 'boarder')?.id || null;
    return null;
  };

  // --- Fee Categories tab: per-student structure assignment -----------------
  const [isAssigning, setIsAssigning] = useState(false);
  const [setAllCatId, setSetAllCatId] = useState("");

  // Which terms a category's structure charges this year — a term is covered if
  // any of the category's fee_structures rows has a non-zero amount in it. This
  // is what makes the assignment intelligently year- or term-scoped.
  const termsChargedByCategory = (catId) => {
    const rows = structureRows.filter(r => r.category_id === catId);
    return { t1: rows.some(r => Number(r.t1) > 0), t2: rows.some(r => Number(r.t2) > 0), t3: rows.some(r => Number(r.t3) > 0), any: rows.length > 0 };
  };
  const termsLabel = (t) => {
    const names = [t.t1 && 'Term 1', t.t2 && 'Term 2', t.t3 && 'Term 3'].filter(Boolean);
    if (names.length === 3) return 'the whole year (Terms 1–3)';
    return names.join(' & ') || 'no terms';
  };
  const catScopeSuffix = (catId) => {
    const t = termsChargedByCategory(catId);
    if (!t.any) return 'not priced';
    return t.t1 && t.t2 && t.t3 ? 'whole year' : [t.t1 && 'T1', t.t2 && 'T2', t.t3 && 'T3'].filter(Boolean).join('/');
  };

  // Core writer: assign catId (or null = revert to default) to student ids.
  // Verified write + local refresh; confirms are the callers' job.
  const writeCategoryAssignment = async (ids, catId) => {
    setIsAssigning(true);
    try {
      // One special assignment per student per year: clear existing first.
      const { error: delErr } = await supabase
        .from('student_fee_categories')
        .delete().eq('school_id', schoolConfig.id).eq('year', year)
        .in('student_id', ids);
      if (delErr) throw delErr;

      if (catId) {
        const terms = termsChargedByCategory(catId);
        const payload = ids.map(sid => ({
          school_id: schoolConfig.id, student_id: sid, category_id: catId,
          year, t1: terms.t1, t2: terms.t2, t3: terms.t3,
        }));
        const { data, error } = await supabase.from('student_fee_categories').insert(payload).select();
        if (error) throw error;
        if (!data || data.length !== payload.length) throw new Error(`Save not fully persisted (expected ${payload.length}, stored ${data?.length || 0}).`);
      } else {
        // Reverting to default also clears the legacy standing field so the
        // boarder/day automatic default genuinely takes over.
        const { error: legErr } = await supabase
          .from('students').update({ fee_category_id: null })
          .eq('school_id', schoolConfig.id).in('id', ids);
        if (legErr) throw legErr;
        setStudentsList(prev => prev.map(s => ids.includes(s.id) ? { ...s, fee_category_id: null } : s));
      }

      const { data: fresh } = await supabase.from('student_fee_categories')
        .select('*').eq('school_id', schoolConfig.id).eq('year', year);
      setStudentFeeCats(fresh || []);
      return true;
    } catch (err) {
      alert('Failed to update fee category: ' + err.message);
      return false;
    } finally {
      setIsAssigning(false);
    }
  };

  // Per-student dropdown change (Fee Categories tab).
  const assignStudentCategory = async (s, catId) => {
    const name = `${s.first_name || ''} ${s.last_name || ''}`.trim();
    if (!catId) {
      if (!window.confirm(`Revert ${name} to the normal (grade / boarder-day) fees for ${year}?`)) return;
      await writeCategoryAssignment([s.id], null);
      return;
    }
    const cat = feeCats.find(c => c.id === catId);
    const terms = termsChargedByCategory(catId);
    if (!terms.any) {
      alert(`"${cat?.name}" has no fee structure priced for ${year}. Price its structure first (Fee Structure → select the category), then assign students.`);
      return;
    }
    if (!window.confirm(
      `Move ${name} to "${cat?.name}" for ${year}?\n\n` +
      `This structure charges ${termsLabel(terms)} — the assignment applies to those terms only; normal fees apply outside them.`
    )) return;
    await writeCategoryAssignment([s.id], catId);
  };

  // Toolbar: apply one category to everyone matching the current filter.
  const handleSetAllShown = async (list) => {
    if (!setAllCatId || !list.length) return;
    const clearing = setAllCatId === '__clear__';
    const cat = feeCats.find(c => c.id === setAllCatId);
    if (!clearing) {
      const terms = termsChargedByCategory(setAllCatId);
      if (!terms.any) {
        alert(`"${cat?.name}" has no fee structure priced for ${year}. Price its structure first, then assign students.`);
        return;
      }
      if (!window.confirm(
        `Set ALL ${list.length} students shown to "${cat?.name}" for ${year}?\n\n` +
        `This structure charges ${termsLabel(terms)} — the assignment applies to those terms only.`
      )) return;
    } else {
      if (!window.confirm(`Revert ALL ${list.length} students shown to their normal (grade / boarder-day) fees for ${year}?`)) return;
    }
    const ok = await writeCategoryAssignment(list.map(s => s.id), clearing ? null : setAllCatId);
    if (ok) setSetAllCatId("");
  };

  // Whole-year category for display badges: the special assignment (any term)
  // wins, else the legacy/standing/boarder default.
  const categoryFor = (s) => {
    const sfc = studentFeeCats.find(x => x.student_id === s.id && (x.t1 || x.t2 || x.t3));
    if (sfc) return sfc.category_id;
    if (s.fee_category_id) return s.fee_category_id;
    if (isBoarder(s)) return feeCats.find(c => c.kind === 'boarder')?.id || null;
    return null;
  };

  // Display identity for the Category column: explicit assignment wins, else
  // the boarding toggle. Styling per kind.
  const CATEGORY_BADGE = {
    boarder: { icon: '🛏', bg: '#EAF2FA', fg: '#1A5F9C' },
    day:     { icon: '☀', bg: '#FEF6E7', fg: '#8A6A1F' },
    special: { icon: '⭐', bg: '#F5EEF8', fg: '#6C3483' },
  };
  const categoryLabelFor = (s) => {
    const assigned = s.fee_category_id ? feeCats.find(c => c.id === s.fee_category_id) : null;
    if (assigned) return { name: assigned.name, ...(CATEGORY_BADGE[assigned.kind] || CATEGORY_BADGE.special) };
    if (isBoarder(s)) return { name: 'Boarder', ...CATEGORY_BADGE.boarder };
    return { name: 'Day Scholar', ...CATEGORY_BADGE.day };
  };

  // Effective price sheet for a student: their grade's published rows where
  // the votehead is active and in scope, with a category-specific row
  // REPLACING the "All students" row for the same votehead.
  // The student's effective price sheet. Each votehead's t1/t2/t3 are resolved
  // INDEPENDENTLY per term against that term's category (categoryForTerm), so a
  // special structure that only charges e.g. Term 2 adds its amount to t2 only
  // and leaves t1/t3 on the student's normal category. For a student with no
  // special assignment this collapses to exactly the previous behaviour.
  // Class price sheet (shared + per-term category, scope-filtered) WITHOUT the
  // student's personal charges — term-aware baseline used by both the balance
  // math and the personal-charges modal.
  const baseRowsFor = (s) => {
    const merged = new Map(); // voteheadId -> { votehead_id, t1, t2, t3 }
    const ensure = (vhId) => {
      if (!merged.has(vhId)) merged.set(vhId, { votehead_id: vhId, t1: 0, t2: 0, t3: 0 });
      return merged.get(vhId);
    };
    [1, 2, 3].forEach(term => {
      const cat = categoryForTerm(s, term);
      // shared ("All students") first, then this term's category rows override.
      [false, true].forEach(specificPass => {
        structureRows.forEach(r => {
          if (r.fee_level !== s.level_id) return;
          const isSpecific = !!r.category_id;
          if (isSpecific !== specificPass) return;
          if (isSpecific && r.category_id !== cat) return;
          const vh = voteheadsById[r.votehead_id];
          if (vh) {
            if (vh.is_active === false) return;
            const scope = vh.applies_to || 'all';
            if (scope === 'boarders' && !isBoarder(s)) return;
            if (scope === 'day' && isBoarder(s)) return;
          }
          ensure(r.votehead_id)[`t${term}`] = Number(r[`t${term}`]) || 0;
        });
      });
    });
    return merged;
  };

  const effectiveRowsFor = (s) => {
    const merged = baseRowsFor(s);
    // student-specific overrides apply across all terms (personal charges).
    studentCharges.forEach(r => {
      if (r.student_id !== s.id) return;
      const vh = voteheadsById[r.votehead_id];
      if (vh && vh.is_active !== false) {
        merged.set(r.votehead_id, {
          votehead_id: r.votehead_id,
          t1: Number(r.t1) || 0, t2: Number(r.t2) || 0, t3: Number(r.t3) || 0,
          fee_level: s.level_id,
        });
      }
    });
    // Manual opening balances (mid-year adoption): a lump per votehead placed in
    // the school's current working term. 'replace' makes it the ONLY bill (the
    // structure and any category are ignored); 'add' bills it on top.
    const obs = openingBalances.filter(o => o.student_id === s.id);
    if (obs.length) {
      const curTerm = Number(termDefaultSetting) || 1;
      const tk = `t${curTerm}`;
      if (obs.some(o => o.mode === 'replace')) merged.clear();
      obs.forEach(o => {
        const vh = voteheadsById[o.votehead_id];
        if (!vh || vh.is_active === false) return;
        const row = merged.get(o.votehead_id) || { votehead_id: o.votehead_id, t1: 0, t2: 0, t3: 0, fee_level: s.level_id };
        row[tk] = Number(row[tk] || 0) + Number(o.amount);
        merged.set(o.votehead_id, row);
      });
    }
    return [...merged.values()];
  };

  const billedFor = (s) => effectiveRowsFor(s)
    .reduce((sum, r) => sum + Number(r.t1) + Number(r.t2) + Number(r.t3), 0);
  const paidFor = (s) => paidByStudent[s.id] || 0;

  // Active discounts/waivers + bursaries reduce the balance alongside cash.
  const concessionByStudent = useMemo(() => {
    const m = {};
    adjustments.forEach(a => { if (a.status === 'active') m[a.student_id] = (m[a.student_id] || 0) + Number(a.amount); });
    bursaries.forEach(b => { if (b.status === 'active') m[b.student_id] = (m[b.student_id] || 0) + Number(b.amount); });
    return m;
  }, [adjustments, bursaries]);
  const concessionFor = (s) => concessionByStudent[s.id] || 0;
  // Brought-forward prepayment (money on account) reduces the balance like a
  // settlement — same side as cash and concessions.
  const openingCreditByStudent = useMemo(() => {
    const m = {};
    openingCredits.forEach(c => { m[c.student_id] = (m[c.student_id] || 0) + Number(c.amount); });
    return m;
  }, [openingCredits]);
  const openingCreditFor = (s) => openingCreditByStudent[s.id] || 0;
  const balanceFor = (s) => billedFor(s) - paidFor(s) - concessionFor(s) - openingCreditFor(s);

  // Which (student, term) pairs have real invoices generated (non-cancelled).
  const invoicedTermByStudent = useMemo(() => {
    const m = {};
    invoices.forEach(i => {
      if (i.status === 'cancelled') return;
      (m[i.student_id] = m[i.student_id] || new Set()).add(Number(i.term));
    });
    return m;
  }, [invoices]);

  // Real per-student, per-term, per-votehead settlement from allocations.
  //   realCash[sid][term][vhId], realConc[sid][term][vhId]
  const realByStudent = useMemo(() => {
    const m = {};
    allocations.forEach(a => {
      const sid = a.fee_invoices?.student_id;
      const term = Number(a.fee_invoices?.term);
      const vhId = a.fee_invoice_items?.votehead_id || 'custom';
      if (!sid || !term) return;
      const bucket = (m[sid] = m[sid] || { cash: {}, conc: {} });
      const kind = a.payment_id ? 'cash' : 'conc';
      const t = (bucket[kind][term] = bucket[kind][term] || {});
      t[vhId] = (t[vhId] || 0) + Number(a.amount);
    });
    return m;
  }, [allocations]);

  // The full per-student breakdown: owed / paid / balance by term and votehead.
  // Real allocations are used where invoices exist; the rest of the student's
  // cash is distributed virtually by the school's allocation mode.
  const breakdownFor = (s) => {
    const applicable = effectiveRowsFor(s)
      .map(r => ({ ...r, vh: voteheadsById[r.votehead_id] }))
      .filter(({ vh }) => !!vh)
      .sort((a, b) => (a.vh?.priority ?? 999) - (b.vh?.priority ?? 999)
        || (a.vh?.display_order ?? 0) - (b.vh?.display_order ?? 0));

    // owed[term][vhId]
    const owed = { 1: {}, 2: {}, 3: {} };
    applicable.forEach(r => {
      owed[1][r.votehead_id] = Number(r.t1);
      owed[2][r.votehead_id] = Number(r.t2);
      owed[3][r.votehead_id] = Number(r.t3);
    });

    const real = realByStudent[s.id] || { cash: {}, conc: {} };
    const cashReal = (t, vh) => (real.cash[t] && real.cash[t][vh]) || 0;
    const concReal = (t, vh) => (real.conc[t] && real.conc[t][vh]) || 0;

    // Virtual pool = total active cash not tied to real allocations.
    const totalCash = paidFor(s);
    let totalCashReal = 0;
    [1, 2, 3].forEach(t => Object.values(real.cash[t] || {}).forEach(v => { totalCashReal += v; }));
    let pool = Math.max(0, totalCash - totalCashReal);

    // Cells needing virtual cash: owed minus real cash minus concession, >0.
    const cells = [];
    applicable.forEach(r => {
      [1, 2, 3].forEach(t => {
        const remaining = (owed[t][r.votehead_id] || 0) - cashReal(t, r.votehead_id) - concReal(t, r.votehead_id);
        if (remaining > 0.005) cells.push({ term: t, vhId: r.votehead_id, priority: r.vh?.priority ?? 999, remaining });
      });
    });

    const virtual = { 1: {}, 2: {}, 3: {} };
    if (pool > 0.005 && cells.length) {
      if (allocModeDefault === 'percentage') {
        const totalRemaining = cells.reduce((sum, c) => sum + c.remaining, 0);
        cells.forEach(c => {
          const give = Math.min(c.remaining, Math.round((pool * c.remaining / totalRemaining) * 100) / 100);
          virtual[c.term][c.vhId] = (virtual[c.term][c.vhId] || 0) + give;
        });
      } else {
        // priority: term ascending, then votehead priority
        cells.sort((a, b) => a.term - b.term || a.priority - b.priority);
        cells.forEach(c => {
          if (pool <= 0.005) return;
          const give = Math.min(c.remaining, pool);
          virtual[c.term][c.vhId] = (virtual[c.term][c.vhId] || 0) + give;
          pool -= give;
        });
      }
    }

    // Assemble per-term rows + totals.
    const terms = {};
    [1, 2, 3].forEach(t => {
      const rows = applicable.map(r => {
        const o = owed[t][r.votehead_id] || 0;
        const cash = cashReal(t, r.votehead_id) + (virtual[t][r.votehead_id] || 0);
        const conc = concReal(t, r.votehead_id);
        return {
          vhId: r.votehead_id,
          code: r.vh?.code || '—',
          description: r.vh?.description || '—',
          owed: o, paid: cash, concession: conc,
          balance: o - cash - conc,
        };
      }).filter(row => row.owed > 0 || row.paid > 0 || row.concession > 0);
      const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
      terms[t] = {
        rows,
        owed: sum('owed'), paid: sum('paid'), concession: sum('concession'), balance: sum('balance'),
        isReal: (invoicedTermByStudent[s.id] || new Set()).has(t),
      };
    });

    const credit = openingCreditFor(s);
    const yr = {
      owed: billedFor(s), paid: totalCash, concession: concessionFor(s), credit,
      balance: billedFor(s) - totalCash - concessionFor(s) - credit,
    };
    yr.overpay = yr.balance < 0 ? -yr.balance : 0;
    return { terms, year: yr };
  };

  // Per-term view helpers for the list.
  const listMetricsFor = (s) => {
    if (termFilter === 'all') {
      const bal = balanceFor(s);
      return { billed: billedFor(s), paid: paidFor(s), balance: bal };
    }
    const b = breakdownFor(s).terms[Number(termFilter)];
    return { billed: b.owed, paid: b.paid, balance: b.balance };
  };

  // Column sorting for the student lists. Default = ADM No ascending, a STABLE
  // key: money changes (e.g. switching a fee category) never move a row.
  const [sortKey, setSortKey] = useState('adm');   // 'adm' | 'name' | 'balance'
  const [sortDir, setSortDir] = useState('asc');   // 'asc' | 'desc'
  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir(key === 'balance' ? 'desc' : 'asc'); }
  };
  const sortArrow = (key) => sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ' ⇅';
  // ADM numbers sort numerically when both are numbers ("6296" > "700"),
  // falling back to text for mixed formats like "2026/001".
  const cmpAdm = (a, b) => {
    const na = Number(a), nb = Number(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
    return String(a || '').localeCompare(String(b || ''), undefined, { numeric: true });
  };

  const filteredStudents = useMemo(() => {
    const targetGradeId = selectedGrade === "all" ? null : GRADE_NAME_TO_CODE[selectedGrade];
    const levelGrades = (GRADES_BY_LEVEL[selectedLevel] || []).map(name => GRADE_NAME_TO_CODE[name]);

    const rows = studentsList
      .filter(s => {
        const q = searchTerm.toLowerCase();
        const matchesSearch = studentName(s).toLowerCase().includes(q) || (s.adm_no || "").toLowerCase().includes(q);
        const matchesLevel = levelGrades.includes(s.level_id);
        const matchesGrade = selectedGrade === "all" ? true : s.level_id === targetGradeId;
        const matchesStream = selectedStream === "all" ? true : s.stream_id === selectedStream;
        return matchesSearch && matchesLevel && matchesGrade && matchesStream;
      })
      .map(s => ({ ...s, concession: concessionFor(s), ...listMetricsFor(s) }));

    const dir = sortDir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      if (sortKey === 'name') return dir * studentName(a).localeCompare(studentName(b));
      if (sortKey === 'balance') return dir * (a.balance - b.balance);
      return dir * cmpAdm(a.adm_no, b.adm_no);
    });
    return rows;
  }, [studentsList, structureRows, studentCharges, studentFeeCats, voteheadsById, feeCats, paidByStudent, concessionByStudent, realByStudent, allocModeDefault, termFilter, searchTerm, selectedLevel, selectedGrade, selectedStream, sortKey, sortDir]);

  // Match an uploaded file against the shown students. Returns the fill list +
  // a verification breakdown; nothing is written here. Declared after
  // filteredStudents since it depends on it.
  const balanceImportPreview = useMemo(() => {
    if (!importPanel || importAdmCol < 0 || importBalCol < 0) return null;
    const entries = importRows.map(r => {
      const key = normAdm(r[importAdmCol]);
      const balRaw = r[importBalCol];
      const cleaned = String(balRaw ?? '').replace(/[^0-9.-]/g, ''); // drop KES, commas, spaces
      const num = Number(cleaned);
      // Must actually contain a digit — a text value like "abc" strips to ""
      // (which Number() would read as 0), so guard against that. A negative
      // value is allowed: it means a prepayment / credit.
      const valid = cleaned.trim() !== '' && /\d/.test(cleaned) && isFinite(num);
      return { key, keyZ: key.replace(/^0+/, ''), balRaw, num, valid };
    }).filter(e => e.key);

    const seen = {}; entries.forEach(e => { seen[e.key] = (seen[e.key] || 0) + 1; });
    const dupKeys = new Set(Object.keys(seen).filter(k => seen[k] > 1));
    const byKey = new Map(), byKeyZ = new Map();
    entries.forEach(e => { if (dupKeys.has(e.key)) return; byKey.set(e.key, e); if (!byKeyZ.has(e.keyZ)) byKeyZ.set(e.keyZ, e); });

    const matched = []; const notInFile = []; let invalid = 0; const usedKeys = new Set();
    filteredStudents.forEach(s => {
      const key = normAdm(s.adm_no);
      const e = byKey.get(key) || byKeyZ.get(key.replace(/^0+/, ''));
      if (!e) { if (!dupKeys.has(key)) notInFile.push(s); return; }
      usedKeys.add(e.key);
      if (!e.valid) { invalid++; return; }
      matched.push({ id: s.id, adm: s.adm_no, name: studentName(s), amount: e.num });
    });
    const extraInFile = [...byKey.keys()].filter(k => !usedKeys.has(k)).length;
    return { matched, stats: { matched: matched.length, notInFile: notInFile.length, extraInFile, dupes: dupKeys.size, invalid } };
  }, [importPanel, importRows, importAdmCol, importBalCol, filteredStudents]);

  const studentById = useMemo(() => {
    const m = {};
    studentsList.forEach(s => { m[s.id] = s; });
    return m;
  }, [studentsList]);

  const filteredPayments = useMemo(() => {
    const q = searchTerm.toLowerCase();
    return payments.filter(p => {
      const s = studentById[p.student_id];
      const name = s ? studentName(s) : "";
      return name.toLowerCase().includes(q)
        || (s?.adm_no || "").toLowerCase().includes(q)
        || (p.reference || "").toLowerCase().includes(q);
    });
  }, [payments, studentById, searchTerm]);

  // Default term: the school's Finance Settings choice wins; otherwise the
  // Kenyan calendar heuristic (Jan–Apr = T1, May–Aug = T2, Sep–Dec = T3).
  const currentCalendarTerm = () => {
    const m = new Date().getMonth() + 1;
    return m <= 4 ? "1" : m <= 8 ? "2" : "3";
  };
  const defaultTerm = () => termDefaultSetting || currentCalendarTerm();

  const openPayModal = (student) => {
    setPayForm({ amount: "", term: defaultTerm(), method: "mpesa", reference: "", payer_name: "", allocMode: "" });
    setPayModalFor(student);
  };

  // Distribution preview over the YEAR'S FULL BILL (same engine as the
  // drill-down): every votehead of every term still carrying a balance —
  // invoiced or not — filled term 1 → 2 → 3 (then votehead priority), or
  // pro-rata in percentage mode. Only when the whole year is covered does
  // the remainder become prepayment for next year. This keeps the preview
  // consistent with the Billed/Paid/Balance chips: it never claims "nothing
  // outstanding" while the year still owes.
  const buildPayPreview = () => {
    const amount = parseFloat(payForm.amount) || 0;
    const mode = payForm.allocMode || allocModeDefault;
    const bd = breakdownFor(payModalFor);

    const rows = [];
    [1, 2, 3].forEach(t => {
      bd.terms[t].rows.forEach(r => {
        if (r.balance > 0.005) {
          rows.push({
            id: `${t}-${r.vhId}`,
            label: `${r.code} ${r.description}`,
            term: t,
            isReal: bd.terms[t].isReal,
            outstanding: r.balance,
            priority: voteheadsById[r.vhId]?.priority ?? 999,
            give: 0,
          });
        }
      });
    });
    rows.sort((a, b) => a.term - b.term || a.priority - b.priority);

    let remaining = amount;
    if (mode === 'percentage') {
      const totalOut = rows.reduce((s, r) => s + r.outstanding, 0);
      if (totalOut > 0) {
        rows.forEach(r => {
          r.give = Math.min(r.outstanding, Math.floor((amount * r.outstanding / totalOut) * 100) / 100);
        });
        remaining = amount - rows.reduce((s, r) => s + r.give, 0);
        rows.forEach(r => { // mop up rounding/overflow in term/priority order
          if (remaining <= 0.005) return;
          const extra = Math.min(r.outstanding - r.give, remaining);
          r.give += extra; remaining -= extra;
        });
      }
    } else {
      rows.forEach(r => {
        if (remaining <= 0.005) return;
        r.give = Math.min(r.outstanding, remaining);
        remaining -= r.give;
      });
    }
    const allocated = rows.reduce((s, r) => s + r.give, 0);
    const hasEstimated = rows.some(r => !r.isReal);
    return { rows, allocated, credit: Math.max(0, amount - allocated), amount, hasEstimated };
  };

  // Records via the record_fee_payment RPC: one transaction that inserts the
  // payment, allocates it to outstanding invoices (oldest first, votehead
  // priority), updates invoice statuses and issues a sequential receipt.
  const handleSavePayment = async () => {
    const amount = parseFloat(payForm.amount);
    if (!amount || amount <= 0) { alert('Enter a valid amount.'); return; }
    setIsSavingPayment(true);
    try {
      const student = payModalFor;
      // Snapshot the preview BEFORE saving: it tells us which not-yet-invoiced
      // voteheads this payment is committed to, so the receipt can itemize
      // them (the engine itself only allocates against real invoices).
      const pv = buildPayPreview();
      const { data, error } = await supabase.rpc('record_fee_payment', {
        p_school_id: schoolConfig.id,
        p_student_id: student.id,
        p_amount: amount,
        p_year: year,
        p_method: payForm.method || null,
        p_reference: payForm.reference.trim() || null,
        p_payer_name: payForm.payer_name.trim() || null,
        p_term: payForm.term ? parseInt(payForm.term) : null,
        p_allocation_mode: payForm.allocMode || null,
      });
      if (error) throw error;

      // The engine allocates only against real invoices; whatever it reports
      // as credit gets itemized on the receipt across the not-yet-invoiced
      // voteheads the preview committed it to (same order/mode, capped).
      // Only what remains beyond the whole year is next-year prepayment.
      let rem = Number(data.credit || 0);
      const virtualAllocations = [];
      pv.rows.filter(r => !r.isReal && r.give > 0.005).forEach(r => {
        if (rem <= 0.005) return;
        const give = Math.min(r.give, r.outstanding, rem);
        if (give > 0.005) {
          virtualAllocations.push({ description: r.label, term: r.term, amount: give });
          rem -= give;
        }
      });
      const prepayNext = Math.max(0, rem);

      await loadAll();
      setPayModalFor(null);
      setReceiptView({
        receiptNo: data.receipt_no,
        student,
        amount: Number(data.amount),
        allocations: data.allocations || [],
        virtualAllocations,
        prepayNext,
        credit: Number(data.credit || 0),
        method: payForm.method,
        reference: payForm.reference.trim(),
        payerName: payForm.payer_name.trim(),
        paidAt: new Date().toISOString(),
        isVoid: false,
      });
    } catch (err) {
      alert('Failed to record payment: ' + err.message);
    } finally {
      setIsSavingPayment(false);
    }
  };

  const handleVoidPayment = async (p) => {
    const rct = receiptByPayment[p.id];
    const reason = window.prompt(`Void this payment of KES ${Number(p.amount).toLocaleString()}${rct ? ` (receipt ${rct.receipt_no})` : ""}?\n\nEnter the void reason (required):`);
    if (reason === null) return;
    try {
      const { error } = await supabase.rpc('void_fee_payment', { p_payment_id: p.id, p_reason: reason });
      if (error) throw error;
      await loadAll();
    } catch (err) {
      alert('Failed to void payment: ' + err.message);
    }
  };

  // Reprint from the payments list: pull this payment's allocation split.
  const handleViewReceipt = async (p) => {
    const s = studentById[p.student_id];
    let allocations = [];
    try {
      const { data } = await supabase
        .from('fee_payment_allocations')
        .select('amount, fee_invoice_items(description), fee_invoices(invoice_no)')
        .eq('payment_id', p.id);
      allocations = (data || []).map(a => ({
        description: a.fee_invoice_items?.description || '—',
        invoice_no: a.fee_invoices?.invoice_no || '',
        amount: a.amount,
      }));
    } catch (err) {
      console.error('Failed to load allocations:', err);
    }
    const allocated = allocations.reduce((sum, a) => sum + Number(a.amount), 0);
    setReceiptView({
      receiptNo: receiptByPayment[p.id]?.receipt_no || '(no receipt — recorded before receipting)',
      student: s,
      amount: Number(p.amount),
      allocations,
      credit: Number(p.amount) - allocated,
      method: p.method,
      reference: p.reference || '',
      payerName: p.payer_name || '',
      paidAt: p.paid_at,
      isVoid: p.status === 'voided',
    });
  };

  const printReceipt = () => {
    const rv = receiptView;
    if (!rv) return;
    const s = rv.student;
    const balance = s ? balanceFor(s) : null;
    // Real invoice settlements, then committed not-yet-invoiced voteheads.
    const rows = [
      ...(rv.allocations || []).map(a =>
        `<tr><td>${a.description}${a.invoice_no ? ` <span class="mut">(${a.invoice_no})</span>` : ""}</td><td class="amt">${Number(a.amount).toLocaleString()}</td></tr>`),
      ...(rv.virtualAllocations || []).map(a =>
        `<tr><td>${a.description} <span class="mut">(Term ${a.term} — to be invoiced)</span></td><td class="amt">${Math.round(Number(a.amount)).toLocaleString()}</td></tr>`),
    ].join("");
    const creditLine = rv.virtualAllocations !== undefined
      ? (rv.prepayNext > 0.005 ? `<tr><td>Prepayment for ${year + 1}</td><td class="amt">${Math.round(rv.prepayNext).toLocaleString()}</td></tr>` : '')
      : (rv.credit > 0 ? `<tr><td>Credit carried forward</td><td class="amt">${rv.credit.toLocaleString()}</td></tr>` : '');
    const w = window.open('', '_blank', 'width=440,height=640');
    if (!w) { alert('Allow pop-ups to print receipts.'); return; }
    w.document.write(`<!doctype html><html><head><title>${rv.receiptNo}</title><style>
      body { font-family: 'Courier New', monospace; font-size: 12.5px; color: #111; margin: 18px; position: relative; }
      h2 { text-align: center; margin: 0 0 2px; font-size: 15px; }
      .sub { text-align: center; margin: 0 0 12px; font-size: 11px; }
      .line { border-top: 1px dashed #555; margin: 8px 0; }
      table { width: 100%; border-collapse: collapse; }
      td { padding: 3px 0; vertical-align: top; }
      .amt { text-align: right; white-space: nowrap; }
      .mut { color: #666; font-size: 10.5px; }
      .tot td { border-top: 1px solid #111; font-weight: bold; padding-top: 6px; }
      .void { position: absolute; top: 38%; left: 8%; font-size: 52px; color: rgba(192,57,43,0.35);
              transform: rotate(-24deg); font-weight: bold; letter-spacing: 8px; }
      .words { font-size: 11px; font-style: italic; margin-top: 6px; }
      .foot { margin-top: 14px; font-size: 10.5px; color: #444; text-align: center; }
      @media print { .noprint { display: none; } }
    </style></head><body>
      ${rv.isVoid ? '<div class="void">VOID</div>' : ''}
      <h2>${schoolConfig?.schoolName || 'School'}</h2>
      <p class="sub">${schoolConfig?.address || ''} ${schoolConfig?.phone ? '· ' + schoolConfig.phone : ''}<br/>OFFICIAL FEE RECEIPT</p>
      <div class="line"></div>
      <table>
        <tr><td>Receipt No:</td><td class="amt"><strong>${rv.receiptNo}</strong></td></tr>
        <tr><td>Date:</td><td class="amt">${new Date(rv.paidAt).toLocaleString()}</td></tr>
        <tr><td>Student:</td><td class="amt">${s ? studentName(s) : '—'}</td></tr>
        <tr><td>Adm No:</td><td class="amt">${s?.adm_no || '—'}</td></tr>
        ${rv.payerName ? `<tr><td>Paid by:</td><td class="amt">${rv.payerName}</td></tr>` : ''}
        <tr><td>Method:</td><td class="amt">${(rv.method || '—').toUpperCase()}${rv.reference ? ' · ' + rv.reference : ''}</td></tr>
      </table>
      <div class="line"></div>
      <table>
        <tr><td><strong>SETTLED</strong></td><td class="amt"><strong>KES</strong></td></tr>
        ${rows || '<tr><td class="mut" colspan="2">Held as credit — nothing outstanding at time of payment.</td></tr>'}
        ${creditLine}
        <tr class="tot"><td>TOTAL PAID</td><td class="amt">${rv.amount.toLocaleString()}</td></tr>
      </table>
      <p class="words">Amount in words: ${amountInWords(rv.amount)}</p>
      ${balance !== null ? `<div class="line"></div><table><tr><td>Balance (${year}):</td><td class="amt"><strong>KES ${balance.toLocaleString()}</strong></td></tr></table>` : ''}
      <p class="foot">Generated by LogiQ-Taaluma · ${new Date().toLocaleString()}</p>
      <div class="noprint" style="text-align:center;margin-top:14px;">
        <button onclick="window.print()" style="padding:8px 22px;">Print</button>
      </div>
    </body></html>`);
    w.document.close();
    w.focus();
  };

  // --- Student statement (PRD FR-8.1..8.3): chronological, running balance,
  //     letterheaded, with a per-term votehead annexure. ---
  const printStudentStatement = async (s) => {
    // Letterhead extras (logo/motto/principal) live in school_information.
    let info = {};
    try {
      const { data } = await supabase
        .from('school_information')
        .select('logo_url, motto, principal_name, website')
        .eq('school_id', schoolConfig.id)
        .maybeSingle();
      info = data || {};
    } catch { /* letterhead extras are optional */ }

    const bd = breakdownFor(s);
    const fmt = (n) => Math.round(Number(n) || 0).toLocaleString();
    const catBadge = categoryLabelFor(s);
    const streamName = streamsList.find(st => st.id === s.stream_id)?.name || '';

    // Chronological entries. Debits per term use the effective owed (so the
    // statement always reconciles with the balance shown everywhere), dated
    // by the term's first invoice or, when not yet invoiced, the term start.
    const TERM_START = { 1: `${year}-01-01`, 2: `${year}-05-01`, 3: `${year}-09-01` };
    const entries = [];
    [1, 2, 3].forEach(t => {
      const term = bd.terms[t];
      if (term.owed <= 0.005) return;
      const invs = invoices.filter(i => i.student_id === s.id && Number(i.term) === t && i.status !== 'cancelled');
      entries.push({
        date: invs.length ? invs[0].issue_date : TERM_START[t],
        desc: `Term ${t} fees${invs.length
          ? ` — Invoice ${invs.map(i => i.invoice_no).join(', ')}`
          : ' — per fee structure (not yet invoiced)'}`,
        debit: term.owed, credit: 0,
      });
    });
    payments.filter(p => p.student_id === s.id && p.status === 'active').forEach(p => {
      const rct = receiptByPayment[p.id];
      entries.push({
        date: p.paid_at,
        desc: `Payment — ${(p.method || 'cash').toUpperCase()}${p.reference ? ' ' + p.reference : ''}${rct ? ` · Receipt ${rct.receipt_no}` : ''}${p.payer_name ? ` · by ${p.payer_name}` : ''}`,
        debit: 0, credit: Number(p.amount),
      });
    });
    adjustments.filter(a => a.student_id === s.id && a.status === 'active').forEach(a => {
      entries.push({
        date: a.created_at,
        desc: `${a.kind.charAt(0).toUpperCase() + a.kind.slice(1).replace('_', ' ')} — ${a.reason}`,
        debit: 0, credit: Number(a.amount),
      });
    });
    bursaries.filter(b => b.student_id === s.id && b.status === 'active').forEach(b => {
      entries.push({
        date: b.created_at,
        desc: `Bursary — ${b.fee_sponsors?.name || 'Sponsor'}${b.reference ? ` (${b.reference})` : ''}`,
        debit: 0, credit: Number(b.amount),
      });
    });
    entries.sort((a, b) => new Date(a.date) - new Date(b.date));
    let running = 0;
    entries.forEach(e => { running += e.debit - e.credit; e.balance = running; });

    const txnRows = entries.map(e => `
      <tr>
        <td>${new Date(e.date).toLocaleDateString()}</td>
        <td>${e.desc}</td>
        <td class="num">${e.debit > 0.005 ? fmt(e.debit) : ''}</td>
        <td class="num">${e.credit > 0.005 ? fmt(e.credit) : ''}</td>
        <td class="num${e.balance < -0.005 ? ' cr' : ''}">${fmt(Math.abs(e.balance))}${e.balance < -0.005 ? ' CR' : ''}</td>
      </tr>`).join('');

    const annexure = [1, 2, 3].map(t => {
      const term = bd.terms[t];
      if (term.rows.length === 0) return '';
      return `
        <h4>Term ${t}${term.isReal ? '' : ' <span class="note">(per fee structure — not yet invoiced)</span>'}</h4>
        <table>
          <thead><tr><th>Votehead</th><th class="num">Owed</th><th class="num">Paid</th>${term.concession > 0.005 ? '<th class="num">Concession</th>' : ''}<th class="num">Balance</th></tr></thead>
          <tbody>
            ${term.rows.map(r => `<tr><td>${r.code} ${r.description}</td><td class="num">${fmt(r.owed)}</td><td class="num">${fmt(r.paid)}</td>${term.concession > 0.005 ? `<td class="num">${fmt(r.concession)}</td>` : ''}<td class="num">${fmt(r.balance)}</td></tr>`).join('')}
            <tr class="total"><td>Term ${t} total</td><td class="num">${fmt(term.owed)}</td><td class="num">${fmt(term.paid)}</td>${term.concession > 0.005 ? `<td class="num">${fmt(term.concession)}</td>` : ''}<td class="num">${fmt(term.balance)}</td></tr>
          </tbody>
        </table>`;
    }).join('');

    const bal = bd.year.balance;
    const contact1 = [schoolConfig?.address, [schoolConfig?.subCounty, schoolConfig?.county].filter(Boolean).join(', ')].filter(Boolean).join(' · ');
    const contact2 = [schoolConfig?.phone ? `Tel: ${schoolConfig.phone}` : '', schoolConfig?.email ? `Email: ${schoolConfig.email}` : '', info.website || ''].filter(Boolean).join(' · ');

    const w = window.open('', '_blank');
    if (!w) { alert('Allow pop-ups to print the statement.'); return; }
    w.document.write(`<!doctype html><html><head><title>Fee Statement — ${studentName(s)} — ${year}</title><style>
      body { font-family: Arial, sans-serif; font-size: 12px; color: #111; margin: 26px; }
      .letterhead { display: flex; align-items: center; gap: 18px; justify-content: center; }
      .letterhead img { width: 70px; height: 70px; object-fit: contain; }
      .lh-text { text-align: center; }
      .lh-text h2 { margin: 0; font-size: 19px; letter-spacing: 0.5px; text-transform: uppercase; }
      .lh-line { color: #333; font-size: 11px; margin-top: 2px; }
      .motto { font-style: italic; color: #555; font-size: 11px; margin-top: 3px; }
      .lh-rule { border: none; border-top: 3px double #333; margin: 10px 0 8px; }
      .doc-title { text-align: center; font-weight: bold; letter-spacing: 1.5px; margin: 0 0 14px; font-size: 13px; }
      .who { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 6px; padding: 8px 10px; background: #f7f7f7; border: 1px solid #ddd; border-radius: 6px; margin-bottom: 12px; font-size: 12px; }
      .sumrow { display: flex; gap: 8px; margin-bottom: 14px; }
      .sumcell { flex: 1; border: 1px solid #ccc; border-radius: 6px; padding: 7px 9px; text-align: center; }
      .sumcell .l { font-size: 9.5px; text-transform: uppercase; color: #666; letter-spacing: 0.5px; }
      .sumcell .v { font-family: 'Courier New', monospace; font-weight: bold; font-size: 14px; margin-top: 2px; }
      h3 { margin: 16px 0 5px; font-size: 13px; border-bottom: 2px solid #333; padding-bottom: 3px; }
      h4 { margin: 12px 0 4px; font-size: 12px; color: #1A5F9C; }
      .note { font-weight: normal; color: #777; font-size: 10px; }
      table { width: 100%; border-collapse: collapse; page-break-inside: avoid; }
      th, td { border: 1px solid #bbb; padding: 4px 7px; text-align: left; }
      th { background: #f0f0f0; font-size: 9.5px; text-transform: uppercase; }
      .num { text-align: right; font-family: 'Courier New', monospace; white-space: nowrap; }
      .cr { color: #1B6B3A; }
      .total td { font-weight: bold; background: #fafafa; }
      .closing { margin-top: 10px; padding: 9px 12px; border: 1.5px solid #333; border-radius: 6px; display: flex; justify-content: space-between; font-weight: bold; font-size: 13px; }
      .sig { margin-top: 26px; display: flex; justify-content: space-between; font-size: 11px; gap: 30px; }
      .sig div { flex: 1; border-top: 1px solid #333; padding-top: 4px; }
      .foot { margin-top: 14px; font-size: 9.5px; color: #777; text-align: center; }
      @media print { .noprint { display: none; } }
    </style></head><body>
      <div class="letterhead">
        ${info.logo_url ? `<img src="${info.logo_url}" alt="logo" />` : ''}
        <div class="lh-text">
          <h2>${schoolConfig?.schoolName || 'School'}</h2>
          ${contact1 ? `<div class="lh-line">${contact1}</div>` : ''}
          ${contact2 ? `<div class="lh-line">${contact2}</div>` : ''}
          ${info.motto ? `<div class="motto">“${info.motto}”</div>` : ''}
        </div>
      </div>
      <hr class="lh-rule" />
      <p class="doc-title">STUDENT FEE STATEMENT — ${year}</p>

      <div class="who">
        <span><strong>${studentName(s)}</strong> · ADM ${s.adm_no}</span>
        <span>${GRADE_CODE_TO_NAME[s.level_id] || s.level_id}${streamName ? ` · ${streamName}` : ''} · ${catBadge.name}</span>
        <span>Statement date: ${new Date().toLocaleDateString()}</span>
      </div>

      <div class="sumrow">
        <div class="sumcell"><div class="l">Billed</div><div class="v">${fmt(bd.year.owed)}</div></div>
        <div class="sumcell"><div class="l">Paid</div><div class="v">${fmt(bd.year.paid)}</div></div>
        ${bd.year.concession > 0.005 ? `<div class="sumcell"><div class="l">Bursaries & Discounts</div><div class="v">${fmt(bd.year.concession)}</div></div>` : ''}
        <div class="sumcell"><div class="l">${bal < -0.005 ? 'Overpaid' : 'Balance'}</div><div class="v">${fmt(Math.abs(bal))}</div></div>
      </div>

      <h3>Transactions</h3>
      <table>
        <thead><tr><th>Date</th><th>Particulars</th><th class="num">Charges (KES)</th><th class="num">Payments / Credits</th><th class="num">Balance</th></tr></thead>
        <tbody>${txnRows || '<tr><td colspan="5">No transactions recorded for this year.</td></tr>'}</tbody>
      </table>
      <div class="closing">
        <span>CLOSING BALANCE ${bal < -0.005 ? '(IN CREDIT)' : ''}</span>
        <span>KES ${fmt(Math.abs(bal))}${bal < -0.005 ? ' CR' : ''}</span>
      </div>

      <h3>Annexure — Votehead Breakdown</h3>
      ${annexure || '<p class="note">No charges for this year.</p>'}

      <div class="sig">
        <div>Prepared by (Finance Office)</div>
        ${info.principal_name ? `<div>${info.principal_name}, Principal</div>` : '<div>Principal</div>'}
        <div>Official Stamp</div>
      </div>
      <p class="foot">System-generated from ${schoolConfig?.schoolName || 'the school'}'s fee records via LogiQ-Taaluma · ${new Date().toLocaleString()} · Terms marked "not yet invoiced" are billed per the published fee structure.</p>
      <div class="noprint" style="text-align:center;margin-top:16px;">
        <button onclick="window.print()" style="padding:8px 24px;">Print / Save as PDF</button>
      </div>
    </body></html>`);
    w.document.close();
    w.focus();
  };

  // --- Invoices ---

  const filteredInvoices = useMemo(() => {
    const q = searchTerm.toLowerCase();
    return invoices.filter(inv => {
      if (invTermFilter !== "all" && String(inv.term) !== invTermFilter) return false;
      const s = studentById[inv.student_id];
      const name = s ? studentName(s) : "";
      return name.toLowerCase().includes(q)
        || (s?.adm_no || "").toLowerCase().includes(q)
        || (inv.invoice_no || "").toLowerCase().includes(q);
    });
  }, [invoices, invTermFilter, studentById, searchTerm]);

  const handleGenerateInvoices = async () => {
    setIsGenerating(true);
    setGenResult(null);
    try {
      const params = {
        p_school_id: schoolConfig.id,
        p_year: year,
        p_term: parseInt(genForm.term),
      };
      if (genForm.scope === "fee_level") params.p_fee_level = genForm.feeLevel;
      if (genForm.scope === "grade" || genForm.scope === "stream") params.p_level_id = GRADE_NAME_TO_CODE[genForm.grade];
      if (genForm.scope === "stream" && genForm.streamId) params.p_stream_id = genForm.streamId;
      if (genForm.dueDate) params.p_due_date = genForm.dueDate;

      const { data, error } = await supabase.rpc('generate_invoices', params);
      if (error) throw error;
      setGenResult(data);
      await loadAll();
    } catch (err) {
      alert('Invoice generation failed: ' + err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const openInvoice = async (inv) => {
    setInvoiceModal(inv);
    setInvoiceItems([]);
    setCustomCharge({ description: "", amount: "" });
    try {
      const { data, error } = await supabase
        .from('fee_invoice_items').select('*')
        .eq('invoice_id', inv.id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      setInvoiceItems(data || []);
    } catch (err) {
      console.error('Failed to load invoice items:', err);
    }
  };

  const handleCancelInvoice = async (inv) => {
    const reason = window.prompt(`Cancel invoice ${inv.invoice_no}?\n\nEnter the cancellation reason (required):`);
    if (reason === null) return;
    try {
      const { error } = await supabase.rpc('cancel_fee_invoice', { p_invoice_id: inv.id, p_reason: reason });
      if (error) throw error;
      setInvoiceModal(null);
      await loadAll();
    } catch (err) {
      alert('Failed to cancel invoice: ' + err.message);
    }
  };

  const handleAddCharge = async () => {
    const amount = parseFloat(customCharge.amount);
    if (!customCharge.description.trim()) { alert('Enter a description for the charge.'); return; }
    if (!amount || amount <= 0) { alert('Enter a valid amount.'); return; }
    setIsAddingCharge(true);
    try {
      const { error } = await supabase.rpc('add_invoice_item', {
        p_invoice_id: invoiceModal.id,
        p_description: customCharge.description.trim(),
        p_amount: amount,
      });
      if (error) throw error;
      setCustomCharge({ description: "", amount: "" });
      const updated = { ...invoiceModal, total: Number(invoiceModal.total) + amount };
      setInvoiceModal(updated);
      setInvoices(prev => prev.map(i => i.id === updated.id ? updated : i));
      await openInvoice(updated);
    } catch (err) {
      alert('Failed to add charge: ' + err.message);
    } finally {
      setIsAddingCharge(false);
    }
  };

  // --- Discounts & bursaries ---

  const handleAddSponsor = async () => {
    if (!newSponsor.name.trim()) { alert('Enter the sponsor name.'); return; }
    try {
      const { data, error } = await supabase.from('fee_sponsors').insert([{
        school_id: schoolConfig.id,
        name: newSponsor.name.trim(),
        type: newSponsor.type,
        contact: newSponsor.contact.trim() || null,
      }]).select().single();
      if (error) throw error;
      setSponsors(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setNewSponsor({ name: "", type: "cdf", contact: "" });
    } catch (err) {
      alert('Failed to add sponsor: ' + err.message);
    }
  };

  const handleAwardBursary = async () => {
    const amount = parseFloat(awardForm.amount);
    if (!awardForm.student_id) { alert('Pick the student.'); return; }
    if (!awardForm.sponsor_id) { alert('Pick the sponsor.'); return; }
    if (!amount || amount <= 0) { alert('Enter a valid amount.'); return; }
    setIsAwarding(true);
    try {
      const { data, error } = await supabase.rpc('award_fee_bursary', {
        p_school_id: schoolConfig.id,
        p_student_id: awardForm.student_id,
        p_sponsor_id: awardForm.sponsor_id,
        p_year: year,
        p_amount: amount,
        p_term: awardForm.term ? parseInt(awardForm.term) : null,
        p_reference: awardForm.reference.trim() || null,
      });
      if (error) throw error;
      await loadAll();
      setShowAwardModal(false);
      if (Number(data?.unapplied) > 0) {
        alert(`Bursary awarded. KES ${Number(data.unapplied).toLocaleString()} is not yet applied (no outstanding invoice) — it will settle automatically when invoices are generated.`);
      }
    } catch (err) {
      alert('Failed to award bursary: ' + err.message);
    } finally {
      setIsAwarding(false);
    }
  };

  const handleVoidBursary = async (b) => {
    const reason = window.prompt(`Void this bursary of KES ${Number(b.amount).toLocaleString()}?\n\nEnter the void reason (required):`);
    if (reason === null) return;
    try {
      const { error } = await supabase.rpc('void_fee_bursary', { p_bursary_id: b.id, p_reason: reason });
      if (error) throw error;
      await loadAll();
    } catch (err) {
      alert('Failed to void bursary: ' + err.message);
    }
  };

  const handleVoidAdjustment = async (a) => {
    const reason = window.prompt(`Void this ${a.kind} of KES ${Number(a.amount).toLocaleString()}?\n\nEnter the void reason (required):`);
    if (reason === null) return;
    try {
      const { error } = await supabase.rpc('void_fee_adjustment', { p_adjustment_id: a.id, p_reason: reason });
      if (error) throw error;
      await loadAll();
    } catch (err) {
      alert('Failed to void adjustment: ' + err.message);
    }
  };

  const handleApplyDiscount = async () => {
    const value = parseFloat(discountForm.value);
    if (!value || value <= 0) { alert('Enter a valid value.'); return; }
    if (!discountForm.reason.trim() || discountForm.reason.trim().length < 3) { alert('A reason is required.'); return; }
    setIsApplyingDiscount(true);
    try {
      const { error } = await supabase.rpc('apply_fee_adjustment', {
        p_invoice_id: invoiceModal.id,
        p_kind: discountForm.kind,
        p_calc: discountForm.calc,
        p_value: value,
        p_reason: discountForm.reason.trim(),
      });
      if (error) throw error;
      setDiscountForm({ kind: "discount", calc: "fixed", value: "", reason: "" });
      setInvoiceModal(null);
      await loadAll();
    } catch (err) {
      alert('Failed to apply: ' + err.message);
    } finally {
      setIsApplyingDiscount(false);
    }
  };

  const awardStudentMatches = useMemo(() => {
    const q = awardForm.studentQuery.toLowerCase();
    if (!q) return studentsList.slice(0, 50);
    return studentsList
      .filter(s => studentName(s).toLowerCase().includes(q) || (s.adm_no || "").toLowerCase().includes(q))
      .slice(0, 50);
  }, [studentsList, awardForm.studentQuery]);

  const tabStyle = (active) => ({
    padding: "10px 4px", fontSize: 14, fontWeight: 700,
    color: active ? "#1B6B3A" : "#8A8FA8",
    borderBottom: active ? "2px solid #1B6B3A" : "2px solid transparent",
    cursor: "pointer", transition: "all 0.2s", whiteSpace: "nowrap",
  });

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div
        style={{ display: "flex", gap: 20, marginBottom: 18, borderBottom: "1px solid #E8EAF0", overflowX: "auto", paddingBottom: 2, flexWrap: "nowrap" }}
        className="sidebar-scroll"
      >
        <div onClick={() => setActiveTab("balances")} style={tabStyle(activeTab === "balances")}>Fee Balances</div>
        <div onClick={() => setActiveTab("invoices")} style={tabStyle(activeTab === "invoices")}>Invoices</div>
        <div onClick={() => setActiveTab("transactions")} style={tabStyle(activeTab === "transactions")}>Payments</div>
        <div onClick={() => setActiveTab("concessions")} style={tabStyle(activeTab === "concessions")}>Discounts &amp; Bursaries</div>
        <div onClick={() => setActiveTab("student_charges")} style={tabStyle(activeTab === "student_charges")}>Student Charges</div>
        <div onClick={() => setActiveTab("categories")} style={tabStyle(activeTab === "categories")}>⭐ Fee Categories</div>
        <div onClick={() => setActiveTab("student_balances")} style={tabStyle(activeTab === "student_balances")}>💰 Student Balances</div>
      </div>

      <div className="grid-1" style={{ marginBottom: 16, display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 12, alignItems: "center" }}>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 13 }}>🔍</span>
            <input
              type="text"
              placeholder={activeTab === "balances" || activeTab === "student_charges" || activeTab === "categories" || activeTab === "student_balances" ? "Search student..." : activeTab === "invoices" ? "Search invoice or student..." : "Search payment..."}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ width: "100%", padding: "10px 12px 10px 32px", borderRadius: 8, border: "1px solid #E8EAF0", fontSize: 13, outline: "none", boxSizing: "border-box" }}
            />
          </div>

          {activeTab === "invoices" && (
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: "#8A8FA8", whiteSpace: "nowrap" }}>TERM:</span>
                <select
                  value={invTermFilter}
                  onChange={(e) => setInvTermFilter(e.target.value)}
                  style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #E8EAF0", fontSize: 13, background: "#fff", outline: "none" }}
                >
                  <option value="all">All terms</option>
                  <option value="1">Term 1</option>
                  <option value="2">Term 2</option>
                  <option value="3">Term 3</option>
                </select>
              </div>
              <button
                onClick={() => { setGenResult(null); setGenForm(f => ({ ...f, term: defaultTerm() })); setShowGenModal(true); }}
                style={{ padding: "9px 16px", background: "#1A5F9C", border: "none", borderRadius: 8, fontSize: 12.5, color: "#fff", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
              >⚡ Generate Invoices</button>
            </div>
          )}

          {(activeTab === "balances" || activeTab === "student_charges" || activeTab === "categories" || activeTab === "student_balances") && (
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: "#8A8FA8", whiteSpace: "nowrap" }}>LEVEL:</span>
                <select
                  value={selectedLevel}
                  onChange={(e) => { setSelectedLevel(e.target.value); setSelectedGrade(GRADES_BY_LEVEL[e.target.value][0]); }}
                  style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #E8EAF0", fontSize: 13, background: "#fff", outline: "none", minWidth: "140px" }}
                >
                  {Object.keys(GRADES_BY_LEVEL).map(lvl => <option key={lvl} value={lvl}>{lvl}</option>)}
                </select>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: "#8A8FA8", whiteSpace: "nowrap" }}>GRADE:</span>
                <select
                  value={selectedGrade}
                  onChange={(e) => setSelectedGrade(e.target.value)}
                  style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #E8EAF0", fontSize: 13, background: "#fff", outline: "none", minWidth: "120px" }}
                >
                  <option value="all">All {selectedLevel}</option>
                  {(GRADES_BY_LEVEL[selectedLevel] || []).map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              {streamsList.length > 0 && (
                // Streams are school-wide, so the same list applies to every
                // level/grade; hidden entirely for schools without streams.
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: "#8A8FA8", whiteSpace: "nowrap" }}>STREAM:</span>
                  <select
                    value={selectedStream}
                    onChange={(e) => setSelectedStream(e.target.value)}
                    style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #E8EAF0", fontSize: 13, background: "#fff", outline: "none", minWidth: "120px" }}
                  >
                    <option value="all">All streams</option>
                    {streamsList.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
                  </select>
                </div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: "#8A8FA8", whiteSpace: "nowrap" }}>TERM:</span>
                <select
                  value={termFilter}
                  onChange={(e) => setTermFilter(e.target.value)}
                  style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #E8EAF0", fontSize: 13, background: "#fff", outline: "none" }}
                >
                  <option value="all">Full year</option>
                  <option value="1">Term 1</option>
                  <option value="2">Term 2</option>
                  <option value="3">Term 3</option>
                </select>
              </div>
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: "#8A8FA8", whiteSpace: "nowrap" }}>YEAR:</span>
          <select
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value))}
            style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #E8EAF0", fontSize: 13, background: "#fff", outline: "none" }}
          >
            {[new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      <div className="table-container" style={{ background: "#fff", border: "1px solid #E8EAF0", borderRadius: 12, overflow: "hidden", flex: 1 }}>
        {isLoading ? (
          <div style={{ padding: 40, textAlign: "center", color: "#8A8FA8", fontSize: 13 }}>Loading…</div>
        ) : activeTab === "balances" ? (
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 13 }}>
            <thead style={{ background: "#FAFBFC", borderBottom: "1px solid #E8EAF0" }}>
              <tr>
                <th style={{ ...thStyle, cursor: "pointer", userSelect: "none" }} onClick={() => toggleSort('adm')} title="Sort by admission number">ADM No.{sortArrow('adm')}</th>
                <th style={{ ...thStyle, cursor: "pointer", userSelect: "none" }} onClick={() => toggleSort('name')} title="Sort by name">Student Name{sortArrow('name')}</th>
                <th className="hide-mobile" style={thStyle}>Category</th>
                <th className="hide-mobile" style={thStyle}>{termFilter === "all" ? "Billed" : `Term ${termFilter} Billed`}</th>
                <th className="hide-mobile" style={thStyle}>Paid</th>
                <th style={{ ...thStyle, cursor: "pointer", userSelect: "none" }} onClick={() => toggleSort('balance')} title="Sort by balance">{termFilter === "all" ? "Balance" : `Term ${termFilter} Balance`}{sortArrow('balance')}</th>
                <th className="hide-mobile" style={thStyle}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.length === 0 ? (
                <tr><td colSpan="7" style={{ textAlign: "center", padding: 30, color: "#8A8FA8" }}>No students match this filter.</td></tr>
              ) : filteredStudents.slice(0, 100).map((s, idx) => {
                const over = s.balance < 0;
                const catBadge = categoryLabelFor(s);
                return (
                <tr key={s.id} onClick={() => setStudentModal(s)}
                    style={{ borderBottom: "1px solid #F7F8FA", background: idx % 2 === 0 ? "#fff" : "#FAFBFC", cursor: "pointer" }}>
                  <td style={{ padding: "12px 18px", fontWeight: 600, color: "#1A5F9C" }}>{s.adm_no}</td>
                  <td style={{ padding: "12px 18px" }}>
                    <div style={{ fontWeight: 700, color: "#1A1A2E" }}>{studentName(s)} <span style={{ fontSize: 10.5, color: "#b8b2a6", fontWeight: 500 }}>· view breakdown</span></div>
                    {s.concession > 0 && (
                      <div style={{ fontSize: 10.5, color: "#6C3483", fontWeight: 600 }}>🎁 KES {s.concession.toLocaleString()} in bursaries/discounts</div>
                    )}
                    <div className="show-mobile" style={{ fontSize: 11, color: "#8A8FA8" }}>
                      {catBadge.icon} {catBadge.name} · Paid: {s.paid.toLocaleString()} / {s.billed.toLocaleString()}
                    </div>
                  </td>
                  <td className="hide-mobile" style={{ padding: "12px 18px" }}>
                    <span style={{ padding: "3px 10px", borderRadius: 999, fontSize: 10.5, fontWeight: 700, background: catBadge.bg, color: catBadge.fg, whiteSpace: "nowrap" }}>
                      {catBadge.icon} {catBadge.name}
                    </span>
                  </td>
                  <td className="hide-mobile" style={{ padding: "12px 18px" }}>KES {s.billed.toLocaleString()}</td>
                  <td className="hide-mobile" style={{ padding: "12px 18px", color: "#1B6B3A", fontWeight: 600 }}>KES {s.paid.toLocaleString()}</td>
                  <td style={{ padding: "12px 18px" }}>
                    {over ? (
                      <span style={{ fontWeight: 700, color: "#8A6A1F" }}>KES {Math.abs(s.balance).toLocaleString()} <span style={{ fontSize: 10, fontWeight: 800, background: "#FEF6E7", padding: "1px 6px", borderRadius: 999 }}>OVERPAID</span></span>
                    ) : (
                      <span style={{ fontWeight: 700, color: s.balance > 0 ? "#C0392B" : "#1B6B3A" }}>KES {s.balance.toLocaleString()}</span>
                    )}
                  </td>
                  <td className="hide-mobile" style={{ padding: "12px 18px" }}>
                    <button onClick={(e) => { e.stopPropagation(); openPayModal(s); }} style={{ padding: "5px 12px", background: "#1B6B3A", border: "none", borderRadius: 6, fontSize: 11, color: "#fff", fontWeight: 600, cursor: "pointer" }}>
                      + Payment
                    </button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        ) : activeTab === "categories" ? (
          <>
          {/* Toolbar: apply one category to the whole current filter */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "12px 18px", background: "#FAFBFC", borderBottom: "1px solid #E8EAF0" }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: "#4A4A6A" }}>Set everyone shown ({filteredStudents.length}) to:</span>
            <select
              value={setAllCatId}
              onChange={(e) => setSetAllCatId(e.target.value)}
              style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #E8EAF0", fontSize: 13, fontWeight: 600, background: "#fff", cursor: "pointer" }}
            >
              <option value="">— choose a fee structure —</option>
              {feeCats.filter(c => c.kind === 'special').map(c => (
                <option key={c.id} value={c.id}>⭐ {c.name} ({catScopeSuffix(c.id)})</option>
              ))}
              <option value="__clear__">↩ Default (boarder / day scholar)</option>
            </select>
            <button
              onClick={() => handleSetAllShown(filteredStudents)}
              disabled={!setAllCatId || isAssigning || !filteredStudents.length}
              style={{ padding: "8px 18px", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 700, color: "#fff", background: (!setAllCatId || isAssigning) ? "#8A8FA8" : "#1A5F9C", cursor: (!setAllCatId || isAssigning) ? "not-allowed" : "pointer" }}
            >{isAssigning ? "⌛ Applying…" : "Apply to all shown"}</button>
            {feeCats.filter(c => c.kind === 'special').length === 0 && (
              <span style={{ fontSize: 11.5, color: "#8A6A1F" }}>💡 No special fee structures yet — create a category and price it under Fee Structure first.</span>
            )}
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 13 }}>
            <thead style={{ background: "#FAFBFC", borderBottom: "1px solid #E8EAF0" }}>
              <tr>
                <th style={{ ...thStyle, cursor: "pointer", userSelect: "none" }} onClick={() => toggleSort('adm')} title="Sort by admission number">ADM No.{sortArrow('adm')}</th>
                <th style={{ ...thStyle, cursor: "pointer", userSelect: "none" }} onClick={() => toggleSort('name')} title="Sort by name">Student Name{sortArrow('name')}</th>
                <th className="hide-mobile" style={thStyle}>Class · Stream</th>
                <th style={thStyle}>Current Fee Structure</th>
                <th className="hide-mobile" style={thStyle}>Billed ({year})</th>
                <th style={thStyle}>Change To</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.length === 0 ? (
                <tr><td colSpan="6" style={{ textAlign: "center", padding: 30, color: "#8A8FA8" }}>No students match this filter.</td></tr>
              ) : filteredStudents.slice(0, 100).map((s, idx) => {
                const sfc = studentFeeCats.find(x => x.student_id === s.id && (x.t1 || x.t2 || x.t3));
                const sfcCat = sfc ? feeCats.find(c => c.id === sfc.category_id) : null;
                const legacyCat = !sfc && s.fee_category_id ? feeCats.find(c => c.id === s.fee_category_id) : null;
                const defBadge = categoryLabelFor(s);
                const streamName = streamsList.find(x => x.id === s.stream_id)?.name;
                return (
                  <tr key={s.id} style={{ borderBottom: "1px solid #F7F8FA", background: idx % 2 === 0 ? "#fff" : "#FAFBFC" }}>
                    <td style={{ padding: "12px 18px", fontWeight: 600, color: "#1A5F9C" }}>{s.adm_no}</td>
                    <td style={{ padding: "12px 18px", fontWeight: 700, color: "#1A1A2E" }}>{studentName(s)}</td>
                    <td className="hide-mobile" style={{ padding: "12px 18px", color: "#4A4A6A" }}>
                      {GRADE_CODE_TO_NAME[s.level_id] || s.level_id}{streamName ? ` · ${streamName}` : ''}
                    </td>
                    <td style={{ padding: "12px 18px" }}>
                      {sfcCat ? (
                        <span style={{ padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: "#F5EEF8", color: "#6C3483", whiteSpace: "nowrap" }}>
                          ⭐ {sfcCat.name} — {[sfc.t1 && 'T1', sfc.t2 && 'T2', sfc.t3 && 'T3'].filter(Boolean).join(' · ')}
                        </span>
                      ) : legacyCat ? (
                        <span style={{ padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: "#F5EEF8", color: "#6C3483", whiteSpace: "nowrap" }}>
                          ⭐ {legacyCat.name} <span style={{ fontWeight: 500 }}>(standing)</span>
                        </span>
                      ) : (
                        <span style={{ padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: defBadge.bg, color: defBadge.fg, whiteSpace: "nowrap" }}>
                          {defBadge.icon} {defBadge.name} <span style={{ fontWeight: 500 }}>(default)</span>
                        </span>
                      )}
                    </td>
                    <td className="hide-mobile" style={{ padding: "12px 18px", fontFamily: "monospace", fontWeight: 700, color: "#4A4A6A" }}>KES {s.billed.toLocaleString()}</td>
                    <td style={{ padding: "12px 18px" }}>
                      <select
                        value={sfc?.category_id || ""}
                        disabled={isAssigning}
                        onChange={(e) => assignStudentCategory(s, e.target.value || null)}
                        style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid #E8EAF0", fontSize: 12.5, fontWeight: 600, background: "#fff", cursor: "pointer", maxWidth: 240 }}
                      >
                        <option value="">Default (boarder / day)</option>
                        {feeCats.filter(c => c.kind === 'special').map(c => (
                          <option key={c.id} value={c.id}>⭐ {c.name} ({catScopeSuffix(c.id)})</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </>
        ) : activeTab === "student_balances" ? (
          <>
          {(() => {
            const activeVhs = Object.values(voteheadsById).filter(v => v.is_active !== false)
              .sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999));
            const vh = voteheadsById[balanceVh];
            const shown = filteredStudents;
            const enteredCount = shown.filter(s => Number(balanceInputs[s.id]) > 0).length;
            const enteredTotal = shown.reduce((sum, s) => sum + (Number(balanceInputs[s.id]) || 0), 0);
            const modeBtn = (m, label) => (
              <button onClick={() => setBalanceMode(m)} style={{ padding: "7px 12px", borderRadius: 8, border: balanceMode === m ? "1px solid #1A5F9C" : "1px solid #E8EAF0", background: balanceMode === m ? "#EAF2FA" : "#fff", color: balanceMode === m ? "#1A5F9C" : "#4A4A6A", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>{balanceMode === m ? "◉" : "○"} {label}</button>
            );
            return (
              <>
              <div style={{ padding: "10px 16px", background: "#FDF9F0", border: "1px solid #EAD9A8", borderRadius: 10, margin: "0 0 12px", fontSize: 12, color: "#8A6A1F", lineHeight: 1.5 }}>
                💰 For schools starting mid-year: enter each student's outstanding <strong>balance</strong> under one votehead instead of building the full fee structure — it becomes what they owe and pay against for the period. Enter a <strong style={{ color: "#1A5F9C" }}>negative</strong> figure for a student who has <strong style={{ color: "#1A5F9C" }}>prepaid</strong> (a credit brought forward).
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", padding: "12px 16px", background: "#FAFBFC", border: "1px solid #E8EAF0", borderRadius: 10, marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: "#8A8FA8" }}>VOTEHEAD:</span>
                  <select value={balanceVh} onChange={(e) => setBalanceVh(e.target.value)} style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #E8EAF0", fontSize: 13, fontWeight: 600, background: "#fff", cursor: "pointer" }}>
                    {activeVhs.length === 0 && <option value="">No voteheads — create one under Fee Structure</option>}
                    {activeVhs.map(v => <option key={v.id} value={v.id}>{v.code} — {v.description}</option>)}
                  </select>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: "#8A8FA8" }}>THESE BALANCES:</span>
                  {modeBtn('replace', 'Are the whole bill')}
                  {modeBtn('add', 'Add to fee structure')}
                </div>
                <div style={{ flex: 1 }} />
                <button onClick={downloadBalanceTemplate} title="Download the shown students as an Excel template to fill" style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #1A5F9C", background: "#fff", color: "#1A5F9C", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>⬇ Template</button>
                <button onClick={() => balanceFileRef.current?.click()} title="Upload an Excel/CSV of admission numbers + balances" style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #B4690E", background: "#fff", color: "#B4690E", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>⬆ Upload Excel</button>
                <input ref={balanceFileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleBalanceFile} style={{ display: "none" }} />
                <span style={{ fontSize: 12, color: "#8A8FA8" }}>{enteredCount} entered · <strong style={{ color: "#1A5F9C", fontFamily: "monospace" }}>KES {Math.round(enteredTotal).toLocaleString()}</strong></span>
                <button onClick={handleSaveBalances} disabled={isSavingBalances || !balanceVh} style={{ padding: "9px 20px", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 700, color: "#fff", background: isSavingBalances ? "#8A8FA8" : "#1B6B3A", cursor: isSavingBalances ? "wait" : "pointer" }}>{isSavingBalances ? "⌛ Saving…" : "💾 Save balances"}</button>
              </div>
              <div style={{ fontSize: 11.5, color: "#8A8FA8", padding: "0 4px 10px" }}>
                {balanceMode === 'replace'
                  ? `“Whole bill”: for every student below with a balance, the level fee structure is ignored — they owe only what you type here (under ${vh ? vh.code : 'the votehead'}).`
                  : `“Add to fee structure”: the amount below is billed on top of each student's normal fee structure.`} A negative figure is a prepayment/credit. Set a student to blank/0 to remove their balance.
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 13 }}>
                <thead style={{ background: "#FAFBFC", borderBottom: "1px solid #E8EAF0" }}>
                  <tr>
                    <th style={{ ...thStyle, cursor: "pointer", userSelect: "none" }} onClick={() => toggleSort('adm')} title="Sort by admission number">ADM No.{sortArrow('adm')}</th>
                    <th style={{ ...thStyle, cursor: "pointer", userSelect: "none" }} onClick={() => toggleSort('name')} title="Sort by name">Student Name{sortArrow('name')}</th>
                    <th className="hide-mobile" style={thStyle}>Class · Stream</th>
                    <th className="hide-mobile" style={thStyle}>Current Bill ({year})</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Balance (KES)</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.length === 0 ? (
                    <tr><td colSpan="5" style={{ textAlign: "center", padding: 30, color: "#8A8FA8" }}>No students match this filter.</td></tr>
                  ) : shown.slice(0, 200).map((s, idx) => {
                    const streamName = streamsList.find(x => x.id === s.stream_id)?.name;
                    return (
                      <tr key={s.id} style={{ borderBottom: "1px solid #F7F8FA", background: idx % 2 === 0 ? "#fff" : "#FAFBFC" }}>
                        <td style={{ padding: "10px 18px", fontWeight: 600, color: "#1A5F9C" }}>{s.adm_no}</td>
                        <td style={{ padding: "10px 18px", fontWeight: 700, color: "#1A1A2E" }}>{studentName(s)}</td>
                        <td className="hide-mobile" style={{ padding: "10px 18px", color: "#4A4A6A" }}>{GRADE_CODE_TO_NAME[s.level_id] || s.level_id}{streamName ? ` · ${streamName}` : ''}</td>
                        <td className="hide-mobile" style={{ padding: "10px 18px", fontFamily: "monospace", color: "#8A8FA8" }}>KES {s.billed.toLocaleString()}</td>
                        <td style={{ padding: "6px 18px", textAlign: "right" }}>
                          {(() => {
                            const v = Number(balanceInputs[s.id]);
                            const isCredit = balanceInputs[s.id] !== '' && balanceInputs[s.id] != null && isFinite(v) && v < 0;
                            return (
                              <input
                                type="number" placeholder="—"
                                value={balanceInputs[s.id] ?? ''}
                                onChange={(e) => setBalanceInputs(prev => ({ ...prev, [s.id]: e.target.value }))}
                                title={isCredit ? "Negative = prepayment / credit on account" : ""}
                                style={{ width: 130, padding: "8px 10px", textAlign: "right", border: `1px solid ${isCredit ? "#1A5F9C" : "#cddbe6"}`, borderRadius: 6, fontSize: 13, fontFamily: "monospace", outline: "none", color: isCredit ? "#1A5F9C" : "#2a2421", background: isCredit ? "#F4F9FE" : "#fff" }}
                              />
                            );
                          })()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </>
            );
          })()}
          </>
        ) : activeTab === "invoices" ? (
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 13 }}>
            <thead style={{ background: "#FAFBFC", borderBottom: "1px solid #E8EAF0" }}>
              <tr>
                <th style={thStyle}>Invoice No.</th>
                <th style={thStyle}>Student</th>
                <th className="hide-mobile" style={thStyle}>Term</th>
                <th className="hide-mobile" style={thStyle}>Issued</th>
                <th style={thStyle}>Total</th>
                <th style={thStyle}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.length === 0 ? (
                <tr><td colSpan="6" style={{ textAlign: "center", padding: 30, color: "#8A8FA8" }}>
                  No invoices yet for {year}. Use <strong>⚡ Generate Invoices</strong> to bill students from the published fee structure.
                </td></tr>
              ) : filteredInvoices.slice(0, 200).map((inv, idx) => {
                const s = studentById[inv.student_id];
                const st = INVOICE_STATUS_STYLE[inv.status] || INVOICE_STATUS_STYLE.issued;
                return (
                  <tr key={inv.id} onClick={() => openInvoice(inv)}
                      style={{ borderBottom: "1px solid #F7F8FA", background: idx % 2 === 0 ? "#fff" : "#FAFBFC", cursor: "pointer" }}>
                    <td style={{ padding: "12px 18px", fontWeight: 600, color: "#1A5F9C", fontFamily: "monospace", fontSize: 12 }}>{inv.invoice_no}</td>
                    <td style={{ padding: "12px 18px" }}>
                      <div style={{ fontWeight: 700, color: "#1A1A2E", textDecoration: inv.status === 'cancelled' ? 'line-through' : 'none' }}>{s ? studentName(s) : "—"}</div>
                      <div style={{ fontSize: 11, color: "#8A8FA8" }}>{s?.adm_no}</div>
                    </td>
                    <td className="hide-mobile" style={{ padding: "12px 18px", color: "#4A4A6A" }}>Term {inv.term}</td>
                    <td className="hide-mobile" style={{ padding: "12px 18px", color: "#4A4A6A" }}>{new Date(inv.issue_date).toLocaleDateString()}</td>
                    <td style={{ padding: "12px 18px", fontWeight: 700, color: "#1A1A2E" }}>KES {Number(inv.total).toLocaleString()}</td>
                    <td style={{ padding: "12px 18px" }}>
                      <span style={{ padding: "3px 10px", borderRadius: 999, fontSize: 10.5, fontWeight: 800, background: st.background, color: st.color }}>{st.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : activeTab === "student_charges" ? (
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 13 }}>
            <thead style={{ background: "#FAFBFC", borderBottom: "1px solid #E8EAF0" }}>
              <tr>
                <th style={{ ...thStyle, cursor: "pointer", userSelect: "none" }} onClick={() => toggleSort('adm')} title="Sort by admission number">ADM No.{sortArrow('adm')}</th>
                <th style={{ ...thStyle, cursor: "pointer", userSelect: "none" }} onClick={() => toggleSort('name')} title="Sort by name">Student Name{sortArrow('name')}</th>
                <th style={thStyle}>Category</th>
                <th style={thStyle}>Custom Charges</th>
                <th style={thStyle}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.length === 0 ? (
                <tr><td colSpan="5" style={{ textAlign: "center", padding: 30, color: "#8A8FA8" }}>No students match this filter.</td></tr>
              ) : filteredStudents.slice(0, 100).map((s, idx) => {
                const catBadge = categoryLabelFor(s);
                const charges = studentCharges.filter(c => c.student_id === s.id);
                return (
                  <tr key={s.id} onClick={() => openStudentCharges(s)}
                      style={{ borderBottom: "1px solid #F7F8FA", background: idx % 2 === 0 ? "#fff" : "#FAFBFC", cursor: "pointer" }}>
                    <td style={{ padding: "12px 18px", fontWeight: 600, color: "#1A5F9C" }}>{s.adm_no}</td>
                    <td style={{ padding: "12px 18px", fontWeight: 700, color: "#1A1A2E" }}>{studentName(s)}</td>
                    <td style={{ padding: "12px 18px" }}>
                      <span style={{ padding: "3px 10px", borderRadius: 999, fontSize: 10.5, fontWeight: 700, background: catBadge.bg, color: catBadge.fg, whiteSpace: "nowrap" }}>
                        {catBadge.icon} {catBadge.name}
                      </span>
                    </td>
                    <td style={{ padding: "12px 18px", color: "#4A4A6A", fontWeight: charges.length ? 700 : 400 }}>
                      {charges.length} active
                    </td>
                    <td style={{ padding: "12px 18px" }}>
                      <button style={{ background: "transparent", border: "1px solid #E8EAF0", borderRadius: 6, padding: "6px 12px", fontSize: 12, fontWeight: 600, color: "#1A1A2E", cursor: "pointer" }}>
                        Edit Charges
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : activeTab === "concessions" ? (
          <div style={{ padding: 20 }}>
            {/* Sponsors */}
            <div style={{ marginBottom: 22 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#8A8FA8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>Sponsors</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", padding: 14, background: "#F8FAFC", border: "1px dashed #D0D5DD", borderRadius: 10, marginBottom: 10 }}>
                <div style={{ flex: 2, minWidth: 160 }}>
                  <label style={modalLabel}>Sponsor name</label>
                  <input type="text" placeholder="e.g. NG-CDF Turbo" value={newSponsor.name}
                    onChange={(e) => setNewSponsor({ ...newSponsor, name: e.target.value })} style={modalInput} />
                </div>
                <div style={{ width: 140 }}>
                  <label style={modalLabel}>Type</label>
                  <select value={newSponsor.type} onChange={(e) => setNewSponsor({ ...newSponsor, type: e.target.value })} style={modalInput}>
                    <option value="cdf">CDF</option>
                    <option value="county">County</option>
                    <option value="ngo">NGO</option>
                    <option value="individual">Individual</option>
                    <option value="school">School</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <label style={modalLabel}>Contact (optional)</label>
                  <input type="text" placeholder="phone / email" value={newSponsor.contact}
                    onChange={(e) => setNewSponsor({ ...newSponsor, contact: e.target.value })} style={modalInput} />
                </div>
                <button onClick={handleAddSponsor}
                  style={{ padding: "10px 18px", background: "#1A5F9C", border: "none", borderRadius: 8, fontSize: 12.5, color: "#fff", fontWeight: 700, cursor: "pointer" }}>
                  + Add Sponsor
                </button>
              </div>
              {sponsors.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {sponsors.map(sp => (
                    <span key={sp.id} style={{ padding: "5px 12px", background: "#fff", border: "1px solid #E8EAF0", borderRadius: 999, fontSize: 12 }}>
                      <strong>{sp.name}</strong> <span style={{ color: "#8A8FA8", textTransform: "uppercase", fontSize: 10 }}>· {sp.type}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Bursary awards */}
            <div style={{ marginBottom: 22 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#8A8FA8", textTransform: "uppercase", letterSpacing: "0.05em" }}>Bursary Awards — {year}</div>
                <button onClick={() => { setAwardForm({ studentQuery: "", student_id: "", sponsor_id: sponsors[0]?.id || "", amount: "", term: "", reference: "" }); setShowAwardModal(true); }}
                  style={{ padding: "8px 14px", background: "#6C3483", border: "none", borderRadius: 8, fontSize: 12, color: "#fff", fontWeight: 700, cursor: "pointer" }}>
                  🎁 Award Bursary
                </button>
              </div>
              {bursaries.length === 0 ? (
                <div style={{ padding: 18, textAlign: "center", color: "#8A8FA8", fontSize: 12.5, background: "#FAFBFC", borderRadius: 10 }}>No bursaries awarded for {year} yet.</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                  <thead><tr style={{ borderBottom: "2px solid #E8EAF0" }}>
                    <th style={thStyle}>Date</th><th style={thStyle}>Student</th><th style={thStyle}>Sponsor</th>
                    <th style={thStyle}>Amount</th><th className="hide-mobile" style={thStyle}>Term / Ref</th><th style={thStyle}></th>
                  </tr></thead>
                  <tbody>
                    {bursaries.map(b => {
                      const s = studentById[b.student_id];
                      const voided = b.status === 'voided';
                      return (
                        <tr key={b.id} style={{ borderBottom: "1px solid #F0F2F5", opacity: voided ? 0.6 : 1 }}>
                          <td style={{ padding: "10px 14px", color: "#4A4A6A" }}>{new Date(b.created_at).toLocaleDateString()}</td>
                          <td style={{ padding: "10px 14px", fontWeight: 700 }}>{s ? studentName(s) : "—"} <span style={{ color: "#8A8FA8", fontWeight: 400 }}>{s?.adm_no}</span></td>
                          <td style={{ padding: "10px 14px" }}>{b.fee_sponsors?.name || "—"}</td>
                          <td style={{ padding: "10px 14px", fontWeight: 700, color: voided ? "#8A8FA8" : "#6C3483", textDecoration: voided ? "line-through" : "none" }}>KES {Number(b.amount).toLocaleString()}</td>
                          <td className="hide-mobile" style={{ padding: "10px 14px", color: "#4A4A6A" }}>{b.term ? `Term ${b.term}` : "Whole year"}{b.reference ? ` · ${b.reference}` : ""}</td>
                          <td style={{ padding: "10px 14px", textAlign: "right" }}>
                            {voided ? <span style={{ padding: "2px 8px", borderRadius: 999, fontSize: 9.5, fontWeight: 800, background: "#FDF0ED", color: "#C0392B" }}>VOID</span> : (
                              <button onClick={() => handleVoidBursary(b)} style={{ padding: "4px 10px", background: "#fff", border: "1px solid #C0392B", borderRadius: 6, fontSize: 11, color: "#C0392B", fontWeight: 700, cursor: "pointer" }}>Void</button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Adjustments */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#8A8FA8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
                Discounts, Waivers &amp; Credit Notes — {year}
                <span style={{ fontWeight: 500, textTransform: "none", marginLeft: 8, letterSpacing: 0 }}>(apply from an invoice: Invoices tab → open invoice)</span>
              </div>
              {adjustments.length === 0 ? (
                <div style={{ padding: 18, textAlign: "center", color: "#8A8FA8", fontSize: 12.5, background: "#FAFBFC", borderRadius: 10 }}>None yet for {year}.</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                  <thead><tr style={{ borderBottom: "2px solid #E8EAF0" }}>
                    <th style={thStyle}>Date</th><th style={thStyle}>Student</th><th style={thStyle}>Kind</th>
                    <th style={thStyle}>Amount</th><th className="hide-mobile" style={thStyle}>Reason</th><th style={thStyle}></th>
                  </tr></thead>
                  <tbody>
                    {adjustments.map(a => {
                      const s = studentById[a.student_id];
                      const voided = a.status === 'voided';
                      return (
                        <tr key={a.id} style={{ borderBottom: "1px solid #F0F2F5", opacity: voided ? 0.6 : 1 }}>
                          <td style={{ padding: "10px 14px", color: "#4A4A6A" }}>{new Date(a.created_at).toLocaleDateString()}</td>
                          <td style={{ padding: "10px 14px", fontWeight: 700 }}>{s ? studentName(s) : "—"} <span style={{ color: "#8A8FA8", fontWeight: 400 }}>{s?.adm_no}</span></td>
                          <td style={{ padding: "10px 14px", textTransform: "capitalize" }}>{a.kind.replace('_', ' ')}{a.calc === 'percentage' ? ` (${Number(a.value)}%)` : ""}</td>
                          <td style={{ padding: "10px 14px", fontWeight: 700, color: voided ? "#8A8FA8" : "#8A6A1F", textDecoration: voided ? "line-through" : "none" }}>KES {Number(a.amount).toLocaleString()}</td>
                          <td className="hide-mobile" style={{ padding: "10px 14px", color: "#4A4A6A" }}>{a.reason}</td>
                          <td style={{ padding: "10px 14px", textAlign: "right" }}>
                            {voided ? <span style={{ padding: "2px 8px", borderRadius: 999, fontSize: 9.5, fontWeight: 800, background: "#FDF0ED", color: "#C0392B" }}>VOID</span> : (
                              <button onClick={() => handleVoidAdjustment(a)} style={{ padding: "4px 10px", background: "#fff", border: "1px solid #C0392B", borderRadius: 6, fontSize: 11, color: "#C0392B", fontWeight: 700, cursor: "pointer" }}>Void</button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 13 }}>
            <thead style={{ background: "#FAFBFC", borderBottom: "1px solid #E8EAF0" }}>
              <tr>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Student</th>
                <th style={thStyle}>Amount</th>
                <th className="hide-mobile" style={thStyle}>Method</th>
                <th className="hide-mobile" style={thStyle}>Receipt</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredPayments.length === 0 ? (
                <tr><td colSpan="6" style={{ textAlign: "center", padding: 30, color: "#8A8FA8" }}>No payments recorded yet.</td></tr>
              ) : filteredPayments.map((p, idx) => {
                const s = studentById[p.student_id];
                const rct = receiptByPayment[p.id];
                const voided = p.status === 'voided';
                return (
                  <tr key={p.id} style={{ borderBottom: "1px solid #F7F8FA", background: idx % 2 === 0 ? "#fff" : "#FAFBFC", opacity: voided ? 0.65 : 1 }}>
                    <td style={{ padding: "12px 18px", color: "#4A4A6A" }}>{new Date(p.paid_at).toLocaleDateString()}</td>
                    <td style={{ padding: "12px 18px" }}>
                      <div style={{ fontWeight: 700, color: "#1A1A2E" }}>{s ? studentName(s) : "—"}</div>
                      <div style={{ fontSize: 11, color: "#8A8FA8" }}>{s?.adm_no}{p.term ? ` · Term ${p.term}` : ""}{p.payer_name ? ` · by ${p.payer_name}` : ""}</div>
                    </td>
                    <td style={{ padding: "12px 18px" }}>
                      <span style={{ fontWeight: 700, color: voided ? "#8A8FA8" : "#1B6B3A", textDecoration: voided ? "line-through" : "none" }}>
                        KES {Number(p.amount).toLocaleString()}
                      </span>
                      {voided && <span style={{ marginLeft: 8, padding: "2px 8px", borderRadius: 999, fontSize: 9.5, fontWeight: 800, background: "#FDF0ED", color: "#C0392B" }}>VOID</span>}
                    </td>
                    <td className="hide-mobile" style={{ padding: "12px 18px", color: "#4A4A6A", textTransform: "capitalize" }}>{p.method || "—"}{p.reference ? ` · ${p.reference}` : ""}</td>
                    <td className="hide-mobile" style={{ padding: "12px 18px", fontFamily: "monospace", fontSize: 12, color: "#1A5F9C" }}>{rct?.receipt_no || "—"}</td>
                    <td style={{ padding: "12px 18px", whiteSpace: "nowrap" }}>
                      <button onClick={() => handleViewReceipt(p)} title="View / print receipt"
                        style={{ padding: "5px 10px", background: "#fff", border: "1px solid #1A5F9C", borderRadius: 6, fontSize: 11, color: "#1A5F9C", fontWeight: 700, cursor: "pointer", marginRight: 6 }}>
                        🖨 Receipt
                      </button>
                      {!voided && (
                        <button onClick={() => handleVoidPayment(p)} title="Void this payment"
                          style={{ padding: "5px 10px", background: "#fff", border: "1px solid #C0392B", borderRadius: 6, fontSize: 11, color: "#C0392B", fontWeight: 700, cursor: "pointer" }}>
                          Void
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Generate Invoices Modal */}
      {showGenModal && (
        <div
          onClick={() => !isGenerating && setShowGenModal(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, padding: 24, width: "100%", maxWidth: 460, boxShadow: "0 12px 40px rgba(0,0,0,0.2)" }}>
            <h3 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 800, color: "#2a2421" }}>Generate Invoices — {year}</h3>
            <p style={{ margin: "0 0 14px", fontSize: 12.5, color: "#8A8FA8", lineHeight: 1.5 }}>
              Bills each targeted student from the <strong>published</strong> fee structure for their level.
              Boarder-only fees skip day scholars. Students already invoiced for the term are skipped.
            </p>

            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={modalLabel}>Term</label>
                <select value={genForm.term} onChange={(e) => setGenForm({ ...genForm, term: e.target.value })} style={modalInput}>
                  <option value="1">Term 1</option>
                  <option value="2">Term 2</option>
                  <option value="3">Term 3</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={modalLabel}>Due Date (optional)</label>
                <input type="date" value={genForm.dueDate} onChange={(e) => setGenForm({ ...genForm, dueDate: e.target.value })} style={modalInput} />
              </div>
            </div>

            <label style={modalLabel}>Who to invoice</label>
            <select value={genForm.scope} onChange={(e) => setGenForm({ ...genForm, scope: e.target.value })} style={modalInput}>
              <option value="school">Whole school</option>
              <option value="fee_level">One CBC level</option>
              <option value="grade">One grade</option>
              <option value="stream">One grade &amp; stream</option>
            </select>

            {genForm.scope === "fee_level" && (
              <>
                <label style={modalLabel}>CBC Level</label>
                <select value={genForm.feeLevel} onChange={(e) => setGenForm({ ...genForm, feeLevel: e.target.value })} style={modalInput}>
                  {feeLevelOptions.map(k => <option key={k} value={k}>{FEE_LEVEL_LABEL[k]}</option>)}
                </select>
              </>
            )}

            {(genForm.scope === "grade" || genForm.scope === "stream") && (
              <>
                <label style={modalLabel}>Grade</label>
                <select value={genForm.grade} onChange={(e) => setGenForm({ ...genForm, grade: e.target.value, streamId: "" })} style={modalInput}>
                  {scopedGradeNames.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </>
            )}

            {genForm.scope === "stream" && (
              <>
                <label style={modalLabel}>Stream</label>
                <select value={genForm.streamId} onChange={(e) => setGenForm({ ...genForm, streamId: e.target.value })} style={modalInput}>
                  <option value="">All streams in {genForm.grade}</option>
                  {streamsList.map(st => (
                    <option key={st.id} value={st.id}>{st.name}</option>
                  ))}
                </select>
              </>
            )}

            {genResult && (
              <div style={{ marginTop: 14, padding: "12px 14px", borderRadius: 10, background: "#E8F5EE", border: "1.5px solid #1B6B3A", fontSize: 13, color: "#1B6B3A", lineHeight: 1.6 }}>
                <div style={{ fontWeight: 800 }}>✓ Run complete</div>
                <div><strong>{genResult.created}</strong> invoice{genResult.created === 1 ? "" : "s"} created · KES {Number(genResult.total_billed || 0).toLocaleString()} billed</div>
                {genResult.skipped_existing > 0 && <div>{genResult.skipped_existing} skipped — already invoiced this term</div>}
                {genResult.skipped_no_structure > 0 && <div>{genResult.skipped_no_structure} skipped — no published fees for their level</div>}
              </div>
            )}

            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button onClick={() => setShowGenModal(false)} disabled={isGenerating} style={{ flex: 1, padding: 12, background: "#fff", border: "1px solid #e6dfd8", borderRadius: 10, fontWeight: 600, color: "#8a8fa8", cursor: "pointer" }}>
                {genResult ? "Close" : "Cancel"}
              </button>
              <button onClick={handleGenerateInvoices} disabled={isGenerating} style={{ flex: 1, padding: 12, background: isGenerating ? "#8a8fa8" : "#1A5F9C", border: "none", borderRadius: 10, fontWeight: 700, color: "#fff", cursor: isGenerating ? "wait" : "pointer" }}>
                {isGenerating ? "Generating…" : genResult ? "Run Again" : "Generate"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invoice Detail Modal */}
      {invoiceModal && (() => {
        const s = studentById[invoiceModal.student_id];
        const st = INVOICE_STATUS_STYLE[invoiceModal.status] || INVOICE_STATUS_STYLE.issued;
        const isCancelled = invoiceModal.status === 'cancelled';
        return (
          <div
            onClick={() => setInvoiceModal(null)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}
          >
            <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 520, maxHeight: "88vh", overflowY: "auto", boxShadow: "0 12px 40px rgba(0,0,0,0.2)" }}>
              <div style={{ padding: "20px 24px", borderBottom: "1px solid #E8EAF0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontFamily: "monospace", fontSize: 13, color: "#1A5F9C", fontWeight: 700 }}>{invoiceModal.invoice_no}</div>
                  <h3 style={{ margin: "4px 0 2px", fontSize: 18, fontWeight: 800, color: "#2a2421" }}>{s ? studentName(s) : "—"}</h3>
                  <div style={{ fontSize: 12, color: "#8A8FA8" }}>
                    {s?.adm_no} · Term {invoiceModal.term}, {invoiceModal.year}
                    {invoiceModal.due_date ? ` · due ${new Date(invoiceModal.due_date).toLocaleDateString()}` : ""}
                  </div>
                </div>
                <span style={{ padding: "4px 12px", borderRadius: 999, fontSize: 11, fontWeight: 800, background: st.background, color: st.color }}>{st.label}</span>
              </div>

              <div style={{ padding: "16px 24px" }}>
                {isCancelled && (
                  <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 10, background: "#FDF0ED", border: "1px solid #C0392B", fontSize: 12.5, color: "#C0392B" }}>
                    Cancelled{invoiceModal.cancelled_at ? ` on ${new Date(invoiceModal.cancelled_at).toLocaleDateString()}` : ""}: {invoiceModal.cancel_reason || "no reason recorded"}
                  </div>
                )}

                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid #E8EAF0" }}>
                      <th style={{ padding: "8px 4px", textAlign: "left", fontSize: 10.5, color: "#8A8FA8", fontWeight: 800 }}>ITEM</th>
                      <th style={{ padding: "8px 4px", textAlign: "right", fontSize: 10.5, color: "#8A8FA8", fontWeight: 800 }}>AMOUNT (KES)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoiceItems.length === 0 ? (
                      <tr><td colSpan="2" style={{ padding: 16, textAlign: "center", color: "#8A8FA8" }}>Loading items…</td></tr>
                    ) : invoiceItems.map(item => (
                      <tr key={item.id} style={{ borderBottom: "1px solid #F0F2F5" }}>
                        <td style={{ padding: "9px 4px", color: "#2a2421", fontWeight: 600 }}>
                          {item.description}
                          {item.is_custom && <span style={{ marginLeft: 8, padding: "1px 7px", borderRadius: 999, fontSize: 9.5, fontWeight: 800, background: "#F5EEF8", color: "#6C3483" }}>CUSTOM</span>}
                        </td>
                        <td style={{ padding: "9px 4px", textAlign: "right", fontFamily: "monospace", fontWeight: 600 }}>{Number(item.amount).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td style={{ padding: "10px 4px", fontWeight: 800, color: "#2a2421" }}>TOTAL</td>
                      <td style={{ padding: "10px 4px", textAlign: "right", fontFamily: "monospace", fontWeight: 800, fontSize: 14.5, color: "#1A5F9C" }}>{Number(invoiceModal.total).toLocaleString()}</td>
                    </tr>
                  </tfoot>
                </table>

                {!isCancelled && (
                  <div style={{ marginTop: 14, padding: 12, background: "#F8FAFC", border: "1px solid #E8EAF0", borderRadius: 10 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 800, color: "#4A4A6A", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Add custom charge</div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input type="text" placeholder='e.g. "Lost library book"' value={customCharge.description}
                        onChange={(e) => setCustomCharge({ ...customCharge, description: e.target.value })}
                        style={{ ...modalInput, flex: 2 }} />
                      <input type="number" placeholder="KES" value={customCharge.amount}
                        onChange={(e) => setCustomCharge({ ...customCharge, amount: e.target.value })}
                        style={{ ...modalInput, flex: 1 }} />
                      <button onClick={handleAddCharge} disabled={isAddingCharge}
                        style={{ padding: "0 16px", background: isAddingCharge ? "#8a8fa8" : "#2a2421", border: "none", borderRadius: 8, fontSize: 12, color: "#fff", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                        {isAddingCharge ? "…" : "+ Add"}
                      </button>
                    </div>
                  </div>
                )}

                {!isCancelled && (
                  <div style={{ marginTop: 10, padding: 12, background: "#FDF9F0", border: "1px solid #EAD9A8", borderRadius: 10 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 800, color: "#8A6A1F", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Apply discount / waiver</div>
                    <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                      <select value={discountForm.kind} onChange={(e) => setDiscountForm({ ...discountForm, kind: e.target.value })} style={{ ...modalInput, flex: 1 }}>
                        <option value="discount">Discount</option>
                        <option value="waiver">Waiver</option>
                        <option value="credit_note">Credit note</option>
                      </select>
                      <select value={discountForm.calc} onChange={(e) => setDiscountForm({ ...discountForm, calc: e.target.value })} style={{ ...modalInput, flex: 1 }}>
                        <option value="fixed">Fixed (KES)</option>
                        <option value="percentage">% of invoice</option>
                      </select>
                      <input type="number" placeholder={discountForm.calc === 'percentage' ? "%" : "KES"} value={discountForm.value}
                        onChange={(e) => setDiscountForm({ ...discountForm, value: e.target.value })}
                        style={{ ...modalInput, flex: 1 }} />
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input type="text" placeholder="Reason (required)" value={discountForm.reason}
                        onChange={(e) => setDiscountForm({ ...discountForm, reason: e.target.value })}
                        style={{ ...modalInput, flex: 2 }} />
                      <button onClick={handleApplyDiscount} disabled={isApplyingDiscount}
                        style={{ padding: "0 16px", background: isApplyingDiscount ? "#8a8fa8" : "#8A6A1F", border: "none", borderRadius: 8, fontSize: 12, color: "#fff", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                        {isApplyingDiscount ? "…" : "Apply"}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div style={{ padding: "14px 24px", background: "#f5f2eb", borderTop: "1px solid #E8EAF0", display: "flex", justifyContent: "space-between", gap: 10 }}>
                {!isCancelled ? (
                  <button onClick={() => handleCancelInvoice(invoiceModal)}
                    style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid #C0392B", background: "#fff", color: "#C0392B", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                    Cancel Invoice
                  </button>
                ) : <span />}
                <button onClick={() => setInvoiceModal(null)}
                  style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: "#1A5F9C", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  Done
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Excel balance import — column confirm + verification preview */}
      {importPanel && (
        <div onClick={cancelBalanceImport} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 12px 40px rgba(0,0,0,0.2)" }}>
            <div style={{ padding: "18px 22px", borderBottom: "1px solid #E8EAF0" }}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "#2a2421" }}>Import balances from Excel</h3>
              <div style={{ fontSize: 12, color: "#8A8FA8", marginTop: 3 }}>{importFileName} · {importRows.length} data row{importRows.length === 1 ? "" : "s"}</div>
            </div>
            <div style={{ padding: "18px 22px" }}>
              {importSheets.length > 1 && (
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 11, fontWeight: 800, color: "#8A8FA8", display: "block", marginBottom: 4 }}>SHEET</label>
                  <select value={importSheetIdx} onChange={(e) => applyImportSheet(importSheets, Number(e.target.value))} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #E8EAF0", fontSize: 13, background: "#fff", fontWeight: 600 }}>
                    {importSheets.map((s, i) => {
                      const hr = findHeaderRow(s.aoa);
                      const n = hr < 0 ? 0 : s.aoa.slice(hr + 1).filter(r => r.some(c => String(c).trim() !== '')).length;
                      return <option key={i} value={i}>{s.name} ({n} row{n === 1 ? '' : 's'})</option>;
                    })}
                  </select>
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 800, color: "#8A8FA8", display: "block", marginBottom: 4 }}>ADMISSION NO. COLUMN</label>
                  <select value={importAdmCol} onChange={(e) => setImportAdmCol(Number(e.target.value))} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #E8EAF0", fontSize: 13, background: "#fff" }}>
                    <option value={-1}>— none —</option>
                    {importHeaders.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 800, color: "#8A8FA8", display: "block", marginBottom: 4 }}>BALANCE COLUMN</label>
                  <select value={importBalCol} onChange={(e) => setImportBalCol(Number(e.target.value))} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #E8EAF0", fontSize: 13, background: "#fff" }}>
                    <option value={-1}>— none —</option>
                    {importHeaders.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                  </select>
                </div>
              </div>

              {(importAdmCol < 0 || importBalCol < 0) ? (
                <div style={{ padding: "12px 14px", background: "#FDF0ED", border: "1px solid #f2c2b6", borderRadius: 8, fontSize: 12.5, color: "#C0392B" }}>
                  Pick both the admission-number and balance columns to see the match preview.
                </div>
              ) : balanceImportPreview && (() => {
                const st = balanceImportPreview.stats;
                const line = (color, label, n) => (
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #F0F2F5", fontSize: 13 }}>
                    <span style={{ color: "#4A4A6A" }}>{label}</span><strong style={{ color, fontFamily: "monospace" }}>{n}</strong>
                  </div>
                );
                return (
                  <div>
                    {line("#1B6B3A", "✅ Matched — will fill", st.matched)}
                    {line("#8A6A1F", "⚠️ On screen, not in file — left blank", st.notInFile)}
                    {line("#8A6A1F", "⚠️ In file, not on this list — ignored", st.extraInFile)}
                    {line("#C0392B", "⚠️ Duplicate adm no. in file — skipped", st.dupes)}
                    {line("#C0392B", "⚠️ Invalid balance (blank/text/negative) — skipped", st.invalid)}
                    <div style={{ marginTop: 12, fontSize: 11.5, color: "#8A8FA8", lineHeight: 1.5 }}>
                      Applying fills the {st.matched} matched input{st.matched === 1 ? "" : "s"} (overwriting any current value). Nothing is saved until you press <strong>Save balances</strong>.
                    </div>
                  </div>
                );
              })()}
            </div>
            <div style={{ padding: "14px 22px", background: "#f5f2eb", borderTop: "1px solid #E8EAF0", display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button onClick={cancelBalanceImport} style={{ padding: "10px 18px", borderRadius: 8, border: "1px solid #e6dfd8", background: "#fff", color: "#8a8fa8", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Cancel</button>
              <button onClick={applyBalanceImport} disabled={!balanceImportPreview || balanceImportPreview.stats.matched === 0} style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: (!balanceImportPreview || balanceImportPreview.stats.matched === 0) ? "#8A8FA8" : "#1B6B3A", color: "#fff", fontSize: 13, fontWeight: 700, cursor: (!balanceImportPreview || balanceImportPreview.stats.matched === 0) ? "not-allowed" : "pointer" }}>
                Apply {balanceImportPreview ? `${balanceImportPreview.stats.matched} balance${balanceImportPreview.stats.matched === 1 ? "" : "s"}` : ""}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Record Payment Modal */}
      {payModalFor && (
        <div
          onClick={() => setPayModalFor(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, padding: 24, width: "100%", maxWidth: 420, maxHeight: "92vh", overflowY: "auto", boxShadow: "0 12px 40px rgba(0,0,0,0.2)" }}>
            <h3 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 800, color: "#2a2421" }}>Record Payment</h3>
            <p style={{ margin: "0 0 12px", fontSize: 13, color: "#8A8FA8" }}>
              {studentName(payModalFor)} · {payModalFor.adm_no} · {year} · {categoryLabelFor(payModalFor).icon} {categoryLabelFor(payModalFor).name}
            </p>

            {/* Term-aware position: cumulative through the selected term
                (arrears roll forward), or the full year when no term is set. */}
            {(() => {
              const bd = breakdownFor(payModalFor);
              const t = payForm.term ? parseInt(payForm.term) : null;
              let owed = 0, paid = 0, conc = 0;
              if (t) {
                [1, 2, 3].forEach(x => {
                  if (x <= t) { owed += bd.terms[x].owed; paid += bd.terms[x].paid; conc += bd.terms[x].concession; }
                });
              } else {
                owed = bd.year.owed; paid = bd.year.paid; conc = bd.year.concession;
              }
              const bal = owed - paid - conc;
              const chips = [
                ["Billed", owed, "#4A4A6A"],
                ["Paid", paid, "#1B6B3A"],
                [bal < -0.005 ? "Overpaid" : "Balance", Math.abs(bal), bal > 0.005 ? "#C0392B" : "#1B6B3A"],
              ];
              return (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", gap: 8 }}>
                    {chips.map(([lbl, val, col]) => (
                      <div key={lbl} style={{ flex: 1, padding: "8px 10px", background: "#F8FAFC", border: "1px solid #E8EAF0", borderRadius: 8, textAlign: "center" }}>
                        <div style={{ fontSize: 9.5, fontWeight: 800, color: "#8A8FA8", textTransform: "uppercase", letterSpacing: "0.04em" }}>{lbl}</div>
                        <div style={{ fontSize: 14, fontWeight: 800, fontFamily: "monospace", color: col, marginTop: 2 }}>
                          {Math.round(val).toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 10.5, color: "#8A8FA8", marginTop: 4, textAlign: "right" }}>
                    {t ? `Position up to Term ${t}` : "Full-year position"}
                    {conc > 0.005 ? ` · incl. KES ${Math.round(conc).toLocaleString()} bursaries/discounts` : ""}
                  </div>
                </div>
              );
            })()}

            <label style={modalLabel}>Amount (KES)</label>
            <input type="number" value={payForm.amount} autoFocus placeholder="0"
              onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} style={modalInput} />

            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={modalLabel}>Term</label>
                <select value={payForm.term} onChange={(e) => setPayForm({ ...payForm, term: e.target.value })} style={modalInput}>
                  <option value="">—</option>
                  <option value="1">Term 1</option>
                  <option value="2">Term 2</option>
                  <option value="3">Term 3</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={modalLabel}>Method</label>
                <select value={payForm.method} onChange={(e) => setPayForm({ ...payForm, method: e.target.value })} style={modalInput}>
                  <option value="mpesa">M-Pesa</option>
                  <option value="cash">Cash</option>
                  <option value="bank">Bank</option>
                  <option value="cheque">Cheque</option>
                </select>
              </div>
            </div>

            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={modalLabel}>Reference (optional)</label>
                <input type="text" value={payForm.reference} placeholder="e.g. M-Pesa code"
                  onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })} style={modalInput} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={modalLabel}>Paid by (optional)</label>
                <input type="text" value={payForm.payer_name} placeholder="e.g. parent's name"
                  onChange={(e) => setPayForm({ ...payForm, payer_name: e.target.value })} style={modalInput} />
              </div>
            </div>

            <label style={modalLabel}>Spread across voteheads by</label>
            <select value={payForm.allocMode} onChange={(e) => setPayForm({ ...payForm, allocMode: e.target.value })} style={modalInput}>
              <option value="">School default ({allocModeDefault === 'percentage' ? 'Percentage' : 'Priority'})</option>
              <option value="priority">Priority (votehead order)</option>
              <option value="percentage">Percentage (pro-rata)</option>
            </select>

            {/* Live distribution preview — every outstanding votehead, incl.
                the ones this amount does not reach (greyed). */}
            <div style={{ marginTop: 14, padding: 12, background: "#F8FAFC", border: "1px solid #E8EAF0", borderRadius: 10 }}>
              <div style={{ fontSize: 10.5, fontWeight: 800, color: "#4A4A6A", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
                Distribution preview
              </div>
              {(() => {
                const pv = buildPayPreview();
                if (pv.rows.length === 0) {
                  return (
                    <div style={{ fontSize: 12, color: "#8A8FA8", lineHeight: 1.5 }}>
                      🎉 All {year} charges (Terms 1–3) are fully covered — this payment will be held as
                      <strong> prepayment for next year</strong> and auto-apply when {year + 1} is billed.
                    </div>
                  );
                }
                return (
                  <>
                    {/* Constant-height list: scrolls internally so the modal's
                        buttons stay reachable however many voteheads exist. */}
                    <div style={{ maxHeight: 168, overflowY: "auto", border: "1px solid #F0F2F5", borderRadius: 6, background: "#fff" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr>
                          <th style={{ padding: "4px 6px", textAlign: "left", fontSize: 9.5, color: "#8A8FA8", fontWeight: 800, position: "sticky", top: 0, background: "#F8FAFC", borderBottom: "1.5px solid #E8EAF0" }}>VOTEHEAD</th>
                          <th style={{ padding: "4px 6px", textAlign: "right", fontSize: 9.5, color: "#8A8FA8", fontWeight: 800, position: "sticky", top: 0, background: "#F8FAFC", borderBottom: "1.5px solid #E8EAF0" }}>OWED</th>
                          <th style={{ padding: "4px 6px", textAlign: "right", fontSize: 9.5, color: "#8A8FA8", fontWeight: 800, position: "sticky", top: 0, background: "#F8FAFC", borderBottom: "1.5px solid #E8EAF0" }}>THIS PAYMENT</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pv.rows.map(r => {
                          const untouched = r.give <= 0.005;
                          return (
                            <tr key={r.id} style={{ borderBottom: "1px solid #F0F2F5", opacity: untouched ? 0.55 : 1 }}>
                              <td style={{ padding: "4px 6px", color: "#2a2421" }}>
                                {r.label} <span style={{ color: "#b8b2a6", fontSize: 10 }}>T{r.term}{r.isReal ? "" : " · est."}</span>
                              </td>
                              <td style={{ padding: "4px 6px", textAlign: "right", fontFamily: "monospace" }}>{Math.round(r.outstanding).toLocaleString()}</td>
                              <td style={{ padding: "4px 6px", textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: untouched ? "#8A8FA8" : "#1B6B3A" }}>
                                {untouched ? "—" : Math.round(r.give).toLocaleString()}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 11.5, flexWrap: "wrap", gap: 4 }}>
                      <span style={{ color: "#4A4A6A" }}>
                        Goes to charges: <strong style={{ fontFamily: "monospace", color: "#1B6B3A" }}>{Math.round(pv.allocated).toLocaleString()}</strong>
                      </span>
                      {pv.credit > 0.005 && (
                        <span style={{ color: "#8A6A1F", fontWeight: 700 }}>
                          Prepayment for {year + 1}: <span style={{ fontFamily: "monospace" }}>{Math.round(pv.credit).toLocaleString()}</span>
                        </span>
                      )}
                    </div>
                    {pv.hasEstimated && (
                      <div style={{ fontSize: 10, color: "#8A8FA8", marginTop: 6, lineHeight: 1.5 }}>
                        “est.” terms are billed from the fee structure but not yet invoiced — the money is held
                        against them and settles automatically the moment that term's invoices are generated.
                      </div>
                    )}
                  </>
                );
              })()}
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button onClick={() => setPayModalFor(null)} style={{ flex: 1, padding: 12, background: "#fff", border: "1px solid #e6dfd8", borderRadius: 10, fontWeight: 600, color: "#8a8fa8", cursor: "pointer" }}>Cancel</button>
              <button onClick={handleSavePayment} disabled={isSavingPayment} style={{ flex: 1, padding: 12, background: isSavingPayment ? "#8a8fa8" : "#1B6B3A", border: "none", borderRadius: 10, fontWeight: 700, color: "#fff", cursor: isSavingPayment ? "wait" : "pointer" }}>
                {isSavingPayment ? "Saving…" : "Save & Issue Receipt"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Award Bursary Modal */}
      {showAwardModal && (
        <div
          onClick={() => !isAwarding && setShowAwardModal(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, padding: 24, width: "100%", maxWidth: 440, boxShadow: "0 12px 40px rgba(0,0,0,0.2)" }}>
            <h3 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 800, color: "#2a2421" }}>🎁 Award Bursary — {year}</h3>
            <p style={{ margin: "0 0 14px", fontSize: 12.5, color: "#8A8FA8", lineHeight: 1.5 }}>
              The award reduces the student's payable balance and appears as a distinct line on their statement.
            </p>

            <label style={modalLabel}>Find student</label>
            <input type="text" placeholder="Search name or adm no…" value={awardForm.studentQuery}
              onChange={(e) => setAwardForm({ ...awardForm, studentQuery: e.target.value, student_id: "" })} style={modalInput} />

            <label style={modalLabel}>Student</label>
            <select value={awardForm.student_id} onChange={(e) => setAwardForm({ ...awardForm, student_id: e.target.value })} style={modalInput}>
              <option value="">-- pick student --</option>
              {awardStudentMatches.map(s => (
                <option key={s.id} value={s.id}>{studentName(s)} · {s.adm_no}</option>
              ))}
            </select>

            <label style={modalLabel}>Sponsor</label>
            <select value={awardForm.sponsor_id} onChange={(e) => setAwardForm({ ...awardForm, sponsor_id: e.target.value })} style={modalInput}>
              <option value="">-- pick sponsor --</option>
              {sponsors.map(sp => <option key={sp.id} value={sp.id}>{sp.name} ({sp.type})</option>)}
            </select>

            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={modalLabel}>Amount (KES)</label>
                <input type="number" placeholder="0" value={awardForm.amount}
                  onChange={(e) => setAwardForm({ ...awardForm, amount: e.target.value })} style={modalInput} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={modalLabel}>Term (optional)</label>
                <select value={awardForm.term} onChange={(e) => setAwardForm({ ...awardForm, term: e.target.value })} style={modalInput}>
                  <option value="">Whole year</option>
                  <option value="1">Term 1</option>
                  <option value="2">Term 2</option>
                  <option value="3">Term 3</option>
                </select>
              </div>
            </div>

            <label style={modalLabel}>Award reference (optional)</label>
            <input type="text" placeholder="e.g. cheque / letter no." value={awardForm.reference}
              onChange={(e) => setAwardForm({ ...awardForm, reference: e.target.value })} style={modalInput} />

            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button onClick={() => setShowAwardModal(false)} disabled={isAwarding} style={{ flex: 1, padding: 12, background: "#fff", border: "1px solid #e6dfd8", borderRadius: 10, fontWeight: 600, color: "#8a8fa8", cursor: "pointer" }}>Cancel</button>
              <button onClick={handleAwardBursary} disabled={isAwarding} style={{ flex: 1, padding: 12, background: isAwarding ? "#8a8fa8" : "#6C3483", border: "none", borderRadius: 10, fontWeight: 700, color: "#fff", cursor: isAwarding ? "wait" : "pointer" }}>
                {isAwarding ? "Awarding…" : "Award Bursary"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Student Fee Breakdown Modal — votehead × term matrix */}
      {studentModal && (() => {
        const bd = breakdownFor(studentModal);
        const termsToShow = termFilter === 'all' ? [1, 2, 3] : [Number(termFilter)];
        return (
          <div
            onClick={() => { if (!feeEdit) { setStudentModal(null); setShowPayList(false); } }}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}
          >
            <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 640, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 12px 40px rgba(0,0,0,0.2)" }}>
              <div style={{ padding: "20px 24px", borderBottom: "1px solid #E8EAF0", display: "flex", justifyContent: "space-between", alignItems: "flex-start", position: "sticky", top: 0, background: "#fff" }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#2a2421" }}>{studentName(studentModal)}</h3>
                  <div style={{ fontSize: 12, color: "#8A8FA8", marginTop: 2 }}>
                    {studentModal.adm_no} · {year} · {categoryLabelFor(studentModal).icon} {categoryLabelFor(studentModal).name}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 10.5, fontWeight: 800, color: "#8A8FA8", textTransform: "uppercase" }}>Year balance</div>
                  <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "monospace", color: bd.year.balance > 0 ? "#C0392B" : (bd.year.overpay > 0 ? "#8A6A1F" : "#1B6B3A") }}>
                    KES {Math.abs(bd.year.balance).toLocaleString()}
                  </div>
                  {bd.year.overpay > 0 && <div style={{ fontSize: 10, fontWeight: 800, color: "#8A6A1F" }}>OVERPAID</div>}
                </div>
              </div>

              <div style={{ padding: "8px 24px 20px" }}>
                {/* Year summary strip */}
                <div style={{ display: "flex", gap: 10, margin: "12px 0 6px", flexWrap: "wrap" }}>
                  {[["Billed", bd.year.owed, "#4A4A6A"], ["Paid", bd.year.paid, "#1B6B3A"], ["Concessions", bd.year.concession, "#6C3483"],
                    ...(bd.year.credit > 0 ? [["Credit b/f", bd.year.credit, "#1A5F9C"]] : [])].map(([lbl, val, col]) => (
                    <div key={lbl} style={{ flex: 1, minWidth: 120, padding: "8px 12px", background: "#F8FAFC", borderRadius: 8 }}>
                      <div style={{ fontSize: 10, fontWeight: 800, color: "#8A8FA8", textTransform: "uppercase" }}>{lbl}</div>
                      <div style={{ fontSize: 14, fontWeight: 800, fontFamily: "monospace", color: col }}>KES {Number(val).toLocaleString()}</div>
                    </div>
                  ))}
                </div>

                {feeEdit && (() => {
                  const locked = lockedTermsFor(studentModal);
                  const inRows = new Set(feeEditRows.map(r => r.votehead_id));
                  const addable = Object.values(voteheadsById)
                    .filter(v => v.is_active !== false && !inRows.has(v.id))
                    .sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999));
                  const cellStyle = { padding: "5px 6px", textAlign: "right" };
                  const inputStyle = { width: 78, padding: "6px 7px", textAlign: "right", border: "1px solid #cddbe6", borderRadius: 6, fontSize: 12.5, fontFamily: "monospace", outline: "none" };
                  const grand = feeEditRows.reduce((a, r) => a + (Number(r.t1) || 0) + (Number(r.t2) || 0) + (Number(r.t3) || 0), 0);
                  return (
                    <div style={{ marginTop: 16 }}>
                      <div style={{ padding: "8px 12px", background: "#EAF2FA", border: "1px solid #C4E1FA", borderRadius: 8, fontSize: 11.5, color: "#1A5F9C", marginBottom: 10, lineHeight: 1.5 }}>
                        ✏️ Editing fees for <strong>{studentName(studentModal)}</strong> only — other students are unaffected. Set any votehead's per-term amount; set it to <strong>0</strong> to waive it for this student. {locked.size > 0 && <>Terms already invoiced ({[...locked].sort().map(t => `Term ${t}`).join(', ')}) are 🔒 locked — reduce those via Discounts &amp; Bursaries.</>}
                      </div>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                        <thead>
                          <tr style={{ borderBottom: "2px solid #E8EAF0" }}>
                            <th style={{ padding: "6px 8px", textAlign: "left", fontSize: 10, color: "#8A8FA8", fontWeight: 800 }}>VOTEHEAD</th>
                            {[1, 2, 3].map(t => <th key={t} style={{ padding: "6px 6px", textAlign: "right", fontSize: 10, color: "#8A8FA8", fontWeight: 800 }}>TERM {t}{locked.has(t) ? " 🔒" : ""}</th>)}
                            <th style={{ width: 26 }} />
                          </tr>
                        </thead>
                        <tbody>
                          {feeEditRows.map(r => {
                            const vh = voteheadsById[r.votehead_id];
                            return (
                              <tr key={r.votehead_id} style={{ borderBottom: "1px solid #F0F2F5" }}>
                                <td style={{ padding: "7px 8px", color: "#2a2421" }}>
                                  <strong>{vh?.code || "—"}</strong> <span style={{ color: "#8A8FA8" }}>{vh?.description || ""}</span>
                                </td>
                                {[1, 2, 3].map(t => (
                                  <td key={t} style={cellStyle}>
                                    {locked.has(t) ? (
                                      <span style={{ fontFamily: "monospace", color: "#8A8FA8" }}>{(Number(r[`t${t}`]) || 0).toLocaleString()}</span>
                                    ) : (
                                      <input type="number" min="0" value={r[`t${t}`]} onChange={e => setFeeCell(r.votehead_id, `t${t}`, e.target.value)} style={inputStyle} />
                                    )}
                                  </td>
                                ))}
                                <td style={{ textAlign: "center" }}>
                                  <button onClick={() => removeFeeVotehead(r.votehead_id)} title="Remove this votehead for this student" style={{ background: "none", border: "none", cursor: "pointer", color: "#C0392B", fontSize: 14, opacity: 0.6 }}>🗑️</button>
                                </td>
                              </tr>
                            );
                          })}
                          {feeEditRows.length === 0 && (
                            <tr><td colSpan={5} style={{ padding: "12px 8px", color: "#8A8FA8", fontSize: 12 }}>No voteheads yet — add one below.</td></tr>
                          )}
                        </tbody>
                        <tfoot>
                          <tr style={{ borderTop: "2px solid #2a2421" }}>
                            <td style={{ padding: "8px", fontWeight: 800 }}>Year total (this student)</td>
                            <td colSpan={3} style={{ padding: "8px", textAlign: "right", fontFamily: "monospace", fontWeight: 800 }}>KES {grand.toLocaleString()}</td>
                            <td />
                          </tr>
                        </tfoot>
                      </table>
                      {addable.length > 0 && (
                        <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8 }}>
                          <select value={feeAddVh} onChange={e => addFeeVotehead(e.target.value)} style={{ flex: 1, padding: "8px 10px", border: "1px solid #cddbe6", borderRadius: 8, fontSize: 12.5, background: "#fff", cursor: "pointer" }}>
                            <option value="">＋ Add a votehead for this student…</option>
                            {addable.map(v => <option key={v.id} value={v.id}>{v.code} — {v.description}</option>)}
                          </select>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {!feeEdit && termsToShow.map(t => {
                  const term = bd.terms[t];
                  return (
                    <div key={t} style={{ marginTop: 16 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: "#2a2421" }}>Term {t}</div>
                        <span style={{ padding: "2px 9px", borderRadius: 999, fontSize: 9.5, fontWeight: 800, background: term.isReal ? "#EAF2FA" : "#FEF6E7", color: term.isReal ? "#1A5F9C" : "#8A6A1F" }}>
                          {term.isReal ? "REAL · invoiced" : "ESTIMATED"}
                        </span>
                      </div>
                      {term.rows.length === 0 ? (
                        <div style={{ padding: "12px 14px", background: "#FAFBFC", borderRadius: 8, fontSize: 12.5, color: "#8A8FA8" }}>No charges for this term.</div>
                      ) : (
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                          <thead>
                            <tr style={{ borderBottom: "2px solid #E8EAF0" }}>
                              <th style={{ padding: "6px 8px", textAlign: "left", fontSize: 10, color: "#8A8FA8", fontWeight: 800 }}>VOTEHEAD</th>
                              <th style={{ padding: "6px 8px", textAlign: "right", fontSize: 10, color: "#8A8FA8", fontWeight: 800 }}>OWED</th>
                              <th style={{ padding: "6px 8px", textAlign: "right", fontSize: 10, color: "#8A8FA8", fontWeight: 800 }}>PAID</th>
                              <th style={{ padding: "6px 8px", textAlign: "right", fontSize: 10, color: "#8A8FA8", fontWeight: 800 }}>BALANCE</th>
                            </tr>
                          </thead>
                          <tbody>
                            {term.rows.map(r => (
                              <tr key={r.vhId} style={{ borderBottom: "1px solid #F0F2F5" }}>
                                <td style={{ padding: "7px 8px", color: "#2a2421" }}>
                                  <strong>{r.code}</strong> <span style={{ color: "#8A8FA8" }}>{r.description}</span>
                                  {r.concession > 0 && <span style={{ marginLeft: 6, fontSize: 10, color: "#6C3483" }}>🎁 {r.concession.toLocaleString()}</span>}
                                </td>
                                <td style={{ padding: "7px 8px", textAlign: "right", fontFamily: "monospace" }}>{r.owed.toLocaleString()}</td>
                                <td style={{ padding: "7px 8px", textAlign: "right", fontFamily: "monospace", color: "#1B6B3A" }}>{Math.round(r.paid).toLocaleString()}</td>
                                <td style={{ padding: "7px 8px", textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: r.balance > 0.5 ? "#C0392B" : "#1B6B3A" }}>{Math.round(r.balance).toLocaleString()}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr style={{ borderTop: "2px solid #2a2421" }}>
                              <td style={{ padding: "8px", fontWeight: 800 }}>Term {t} total</td>
                              <td style={{ padding: "8px", textAlign: "right", fontFamily: "monospace", fontWeight: 800 }}>{term.owed.toLocaleString()}</td>
                              <td style={{ padding: "8px", textAlign: "right", fontFamily: "monospace", fontWeight: 800, color: "#1B6B3A" }}>{Math.round(term.paid).toLocaleString()}</td>
                              <td style={{ padding: "8px", textAlign: "right", fontFamily: "monospace", fontWeight: 800, color: term.balance > 0.5 ? "#C0392B" : "#1B6B3A" }}>{Math.round(term.balance).toLocaleString()}</td>
                            </tr>
                          </tfoot>
                        </table>
                      )}
                    </div>
                  );
                })}

                {!feeEdit && (
                  <div style={{ marginTop: 14, fontSize: 11, color: "#8A8FA8", lineHeight: 1.5 }}>
                    {termsToShow.some(t => !bd.terms[t].isReal)
                      ? `“Estimated” terms distribute this student's payments across voteheads using the ${allocModeDefault === 'percentage' ? 'percentage (pro-rata)' : 'priority'} method. Generate that term's invoices to lock in real allocations.`
                      : "All shown terms use real invoice allocations tied to receipts and the ledger."}
                  </div>
                )}

                {/* Collapsible: this student's payments, each reprintable. */}
                {!feeEdit && (() => {
                  const studentPays = payments
                    .filter(p => p.student_id === studentModal.id)
                    .sort((a, b) => new Date(b.paid_at) - new Date(a.paid_at));
                  return (
                    <div style={{ marginTop: 16, border: "1px solid #E8EAF0", borderRadius: 10, overflow: "hidden" }}>
                      <button
                        onClick={() => setShowPayList(v => !v)}
                        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "#F8FAFC", border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 800, color: "#2a2421" }}
                      >
                        <span>💳 Payments &amp; Receipts <span style={{ color: "#8A8FA8", fontWeight: 700 }}>({studentPays.length})</span></span>
                        <span style={{ color: "#8A8FA8", fontSize: 12, transform: showPayList ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>▸</span>
                      </button>
                      {showPayList && (
                        studentPays.length === 0 ? (
                          <div style={{ padding: "12px 14px", fontSize: 12, color: "#8A8FA8" }}>No payments recorded yet.</div>
                        ) : (
                          <div>
                            {studentPays.map((p, idx) => {
                              const rct = receiptByPayment[p.id];
                              const voided = p.status === 'voided';
                              return (
                                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", borderTop: "1px solid #F0F2F5", background: idx % 2 ? "#FAFBFC" : "#fff", opacity: voided ? 0.65 : 1 }}>
                                  <div style={{ width: 84, fontSize: 11.5, color: "#4A4A6A", flexShrink: 0 }}>{new Date(p.paid_at).toLocaleDateString()}</div>
                                  <div style={{ width: 96, flexShrink: 0 }}>
                                    <span style={{ fontWeight: 700, fontFamily: "monospace", fontSize: 12.5, color: voided ? "#8A8FA8" : "#1B6B3A", textDecoration: voided ? "line-through" : "none" }}>KES {Number(p.amount).toLocaleString()}</span>
                                  </div>
                                  <div style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: "#8A8FA8", textTransform: "capitalize", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {p.method || "cash"}{p.reference ? ` · ${p.reference}` : ""}{p.term ? ` · T${p.term}` : ""}
                                    {rct?.receipt_no && <span style={{ marginLeft: 6, fontFamily: "monospace", color: "#1A5F9C", textTransform: "none" }}>{rct.receipt_no}</span>}
                                    {voided && <span style={{ marginLeft: 6, padding: "1px 7px", borderRadius: 999, fontSize: 9, fontWeight: 800, background: "#FDF0ED", color: "#C0392B" }}>VOID</span>}
                                  </div>
                                  <button onClick={() => handleViewReceipt(p)} title="View / reprint receipt"
                                    style={{ padding: "5px 10px", background: "#fff", border: "1px solid #1A5F9C", borderRadius: 6, fontSize: 11, color: "#1A5F9C", fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
                                    🖨 Receipt
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )
                      )}
                    </div>
                  );
                })()}
              </div>

              <div style={{ padding: "14px 24px", background: "#f5f2eb", borderTop: "1px solid #E8EAF0", display: "flex", justifyContent: "space-between", gap: 10, position: "sticky", bottom: 0 }}>
                {feeEdit ? (
                  <>
                    <button onClick={cancelFeeEdit}
                      style={{ padding: "10px 18px", borderRadius: 8, border: "1px solid #e6dfd8", background: "#fff", color: "#8a8fa8", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                      Cancel
                    </button>
                    <button onClick={handleSaveFeeEdit} disabled={isSavingFees}
                      style={{ padding: "10px 22px", borderRadius: 8, border: "none", background: isSavingFees ? "#8a8fa8" : "#1B6B3A", color: "#fff", fontSize: 13, fontWeight: 700, cursor: isSavingFees ? "wait" : "pointer" }}>
                      {isSavingFees ? "Saving…" : "💾 Save fees"}
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => printStudentStatement(studentModal)}
                      title="Print the full yearly statement — transactions, running balance, votehead annexure"
                      style={{ padding: "10px 18px", borderRadius: 8, border: "1px solid #1A5F9C", background: "#fff", color: "#1A5F9C", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                      🧾 Statement (PDF)
                    </button>
                    <div style={{ display: "flex", gap: 10 }}>
                      <button onClick={() => startFeeEdit(studentModal)}
                        title="Adjust this student's per-votehead fees (this student only)"
                        style={{ padding: "10px 18px", borderRadius: 8, border: "1px solid #B4690E", background: "#fff", color: "#B4690E", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                        ✏️ Edit fees
                      </button>
                      <button onClick={() => { const s = studentModal; setStudentModal(null); setShowPayList(false); openPayModal(s); }}
                        style={{ padding: "10px 18px", borderRadius: 8, border: "none", background: "#1B6B3A", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                        + Record Payment
                      </button>
                      <button onClick={() => { setStudentModal(null); setShowPayList(false); cancelFeeEdit(); }}
                        style={{ padding: "10px 20px", borderRadius: 8, border: "1px solid #e6dfd8", background: "#fff", color: "#8a8fa8", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                        Close
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Student Charges Modal — personal votehead pricing with live bill impact */}
      {studentChargeModal && (() => {
        const student = studentChargeModal;
        const catBadge = categoryLabelFor(student);
        const availableVoteheads = Object.values(voteheadsById)
          .filter(v => v.is_active !== false)
          .sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999) || (a.display_order ?? 0) - (b.display_order ?? 0));

        // The student's CLASS sheet (shared + per-term category, scope-filtered)
        // WITHOUT personal charges — the baseline these rows override or add to.
        const baseByVh = baseRowsFor(student);
        const baseTotal = [...baseByVh.values()].reduce((s, b) => s + b.t1 + b.t2 + b.t3, 0);

        // Live final bill: baseline, minus overridden base rows, plus form rows.
        const num = (v) => Number(v) || 0;
        const rowTotal = (r) => num(r.t1) + num(r.t2) + num(r.t3);
        let finalTotal = baseTotal;
        chargeFormRows.forEach(r => {
          if (!r.votehead_id) return;
          const base = baseByVh.get(r.votehead_id);
          finalTotal += rowTotal(r) - (base ? base.t1 + base.t2 + base.t3 : 0);
        });
        const chosen = new Set(chargeFormRows.map(r => r.votehead_id).filter(Boolean));
        const termSum = (k) => chargeFormRows.reduce((s, r) => s + num(r[k]), 0);
        const cellTh = { padding: "8px 6px", textAlign: "left", fontSize: 10, color: "#8A8FA8", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "2px solid #E8EAF0" };
        const amtInput = { ...modalInput, textAlign: "right", fontFamily: "monospace", padding: "9px 10px" };

        return (
          <div
            onClick={() => !isSavingCharge && setStudentChargeModal(null)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}
          >
            <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", width: 820, maxWidth: "100%", borderRadius: 16, overflow: "hidden", display: "flex", flexDirection: "column", maxHeight: "90vh", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.2)" }}>
              {/* Header */}
              <div style={{ padding: "18px 24px", borderBottom: "1px solid #E8EAF0", background: "#FAFBFC", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: 10.5, fontWeight: 800, color: "#1A5F9C", textTransform: "uppercase", letterSpacing: "0.08em" }}>Personal Charges · {year}</div>
                  <h3 style={{ margin: "3px 0 2px", fontSize: 18, fontWeight: 800, color: "#1A1A2E" }}>{studentName(student)}</h3>
                  <div style={{ fontSize: 12, color: "#8A8FA8", display: "flex", alignItems: "center", gap: 8 }}>
                    ADM {student.adm_no}
                    <span style={{ padding: "2px 9px", borderRadius: 999, fontSize: 10, fontWeight: 700, background: catBadge.bg, color: catBadge.fg }}>{catBadge.icon} {catBadge.name}</span>
                  </div>
                </div>
                <button onClick={() => setStudentChargeModal(null)} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#8A8FA8", lineHeight: 1 }}>×</button>
              </div>

              {/* Live bill impact */}
              <div style={{ display: "flex", gap: 10, padding: "14px 24px 0" }}>
                {[["Class bill", baseTotal, "#4A4A6A"],
                  ["Personal adjustment", finalTotal - baseTotal, finalTotal - baseTotal >= 0 ? "#8A6A1F" : "#1B6B3A"],
                  ["Final bill", finalTotal, "#1A5F9C"]].map(([lbl, val, col], i) => (
                  <div key={lbl} style={{ flex: 1, padding: "9px 12px", background: i === 2 ? "#F4F9FE" : "#F8FAFC", border: i === 2 ? "1.5px solid #1A5F9C" : "1px solid #E8EAF0", borderRadius: 10, textAlign: "center" }}>
                    <div style={{ fontSize: 9.5, fontWeight: 800, color: "#8A8FA8", textTransform: "uppercase", letterSpacing: "0.04em" }}>{lbl}</div>
                    <div style={{ fontSize: 15, fontWeight: 800, fontFamily: "monospace", color: col, marginTop: 2 }}>
                      {lbl === "Personal adjustment" && val > 0 ? "+" : ""}{Math.round(val).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>

              {/* Charge rows */}
              <div style={{ padding: "16px 24px", overflowY: "auto", flex: 1 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th style={{ ...cellTh, width: "34%" }}>Votehead</th>
                      <th style={{ ...cellTh, textAlign: "right" }}>Term 1</th>
                      <th style={{ ...cellTh, textAlign: "right" }}>Term 2</th>
                      <th style={{ ...cellTh, textAlign: "right" }}>Term 3</th>
                      <th style={{ ...cellTh, textAlign: "right", width: 90 }}>Total</th>
                      <th style={{ ...cellTh, width: 36 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {chargeFormRows.length === 0 && (
                      <tr><td colSpan="6" style={{ padding: "26px 10px", textAlign: "center", color: "#8A8FA8", fontSize: 12.5, lineHeight: 1.6 }}>
                        <div style={{ fontSize: 22, marginBottom: 4 }}>🎯</div>
                        No personal charges yet — e.g. add <strong>Transport</strong> with this student's route amount per term.<br />
                        A charge <strong>overrides</strong> the class price for that votehead, or <strong>adds on top</strong> if the class doesn't bill it.
                      </td></tr>
                    )}
                    {chargeFormRows.map((r, i) => {
                      const base = r.votehead_id ? baseByVh.get(r.votehead_id) : null;
                      return (
                        <React.Fragment key={i}>
                          <tr>
                            <td style={{ padding: "10px 6px 2px 0" }}>
                              <select value={r.votehead_id} onChange={e => {
                                const newRows = [...chargeFormRows];
                                newRows[i].votehead_id = e.target.value;
                                setChargeFormRows(newRows);
                              }} style={{ ...modalInput, fontWeight: 600 }}>
                                <option value="">— Select votehead —</option>
                                {availableVoteheads
                                  .filter(v => v.id === r.votehead_id || !chosen.has(v.id))
                                  .map(v => <option key={v.id} value={v.id}>{v.code} — {v.description}</option>)}
                              </select>
                              {r.votehead_id && (
                                <div style={{ marginTop: 4 }}>
                                  {base ? (
                                    <span style={{ padding: "1px 8px", borderRadius: 999, fontSize: 9.5, fontWeight: 700, background: "#FDF9F0", color: "#8A6A1F", border: "1px solid #EAD9A8" }}>
                                      ⤴ overrides class price ({(base.t1 + base.t2 + base.t3).toLocaleString()}/yr)
                                    </span>
                                  ) : (
                                    <span style={{ padding: "1px 8px", borderRadius: 999, fontSize: 9.5, fontWeight: 700, background: "#E8F5EE", color: "#1B6B3A" }}>
                                      ＋ adds on top of class bill
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>
                            {["t1", "t2", "t3"].map(k => (
                              <td key={k} style={{ padding: "10px 4px 2px", verticalAlign: "top" }}>
                                <input type="number" min="0" placeholder="0" value={r[k]}
                                  onChange={e => { const newRows = [...chargeFormRows]; newRows[i][k] = e.target.value; setChargeFormRows(newRows); }}
                                  style={amtInput} />
                              </td>
                            ))}
                            <td style={{ padding: "10px 6px 2px", textAlign: "right", fontFamily: "monospace", fontWeight: 800, color: "#D4AF37", verticalAlign: "top", fontSize: 13.5 }}>
                              <div style={{ paddingTop: 9 }}>{Math.round(rowTotal(r)).toLocaleString()}</div>
                            </td>
                            <td style={{ padding: "10px 0 2px", textAlign: "center", verticalAlign: "top" }}>
                              <button title="Remove this charge" onClick={() => setChargeFormRows(chargeFormRows.filter((_, idx) => idx !== i))}
                                style={{ background: "none", border: "none", color: "#C0392B", cursor: "pointer", fontSize: 15, paddingTop: 9, opacity: 0.7 }}>🗑️</button>
                            </td>
                          </tr>
                          <tr style={{ borderBottom: "1px solid #F0F2F5" }}>
                            <td colSpan="6" style={{ padding: "0 0 10px" }}>
                              <input type="text" value={r.notes} placeholder='Note (optional) — e.g. "Kapsabet route"'
                                onChange={e => { const newRows = [...chargeFormRows]; newRows[i].notes = e.target.value; setChargeFormRows(newRows); }}
                                style={{ ...modalInput, fontSize: 12, padding: "6px 10px", background: "#FCFBF9" }} />
                            </td>
                          </tr>
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                  {chargeFormRows.length > 0 && (
                    <tfoot>
                      <tr style={{ borderTop: "2px solid #2a2421" }}>
                        <td style={{ padding: "9px 6px", fontWeight: 800, fontSize: 12 }}>PERSONAL CHARGES TOTAL</td>
                        {["t1", "t2", "t3"].map(k => (
                          <td key={k} style={{ padding: "9px 4px", textAlign: "right", fontFamily: "monospace", fontWeight: 700 }}>{Math.round(termSum(k)).toLocaleString()}</td>
                        ))}
                        <td style={{ padding: "9px 6px", textAlign: "right", fontFamily: "monospace", fontWeight: 800, color: "#1A5F9C", fontSize: 13.5 }}>
                          {Math.round(termSum("t1") + termSum("t2") + termSum("t3")).toLocaleString()}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  )}
                </table>

                <button onClick={() => setChargeFormRows([...chargeFormRows, { votehead_id: '', t1: '', t2: '', t3: '', notes: '' }])}
                  style={{ background: "#FAFBFC", border: "1.5px dashed #c9c2b8", borderRadius: 10, padding: "11px", width: "100%", cursor: "pointer", color: "#4A4A6A", fontSize: 13, fontWeight: 700, marginTop: 12 }}>
                  ＋ Add Votehead Charge
                </button>
              </div>

              {/* Footer */}
              <div style={{ padding: "14px 24px", borderTop: "1px solid #E8EAF0", background: "#FAFBFC", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <div style={{ fontSize: 12, color: "#8A8FA8" }}>
                  Changes apply to balances immediately{finalTotal !== baseTotal ? <> — final bill <strong style={{ color: "#1A5F9C", fontFamily: "monospace" }}>KES {Math.round(finalTotal).toLocaleString()}</strong></> : ""}.
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => setStudentChargeModal(null)} style={{ padding: "10px 18px", border: "1px solid #D0D5DD", borderRadius: 8, background: "#fff", color: "#4A4A6A", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Cancel</button>
                  <button onClick={handleSaveStudentCharges} disabled={isSavingCharge} style={{ padding: "10px 22px", border: "none", borderRadius: 8, background: isSavingCharge ? "#8a8fa8" : "#1B6B3A", color: "#fff", fontWeight: 700, fontSize: 13, cursor: isSavingCharge ? "wait" : "pointer" }}>
                    {isSavingCharge ? 'Saving…' : 'Save Charges'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Receipt Modal (after save, or reprint from payments list) */}
      {receiptView && (
        <div
          onClick={() => setReceiptView(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1001, padding: 20 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 400, maxHeight: "88vh", overflowY: "auto", boxShadow: "0 12px 40px rgba(0,0,0,0.2)", position: "relative" }}>
            {receiptView.isVoid && (
              <div style={{ position: "absolute", top: "40%", left: "10%", fontSize: 46, color: "rgba(192,57,43,0.25)", transform: "rotate(-24deg)", fontWeight: 900, letterSpacing: 8, pointerEvents: "none" }}>VOID</div>
            )}
            <div style={{ padding: "18px 22px", textAlign: "center", borderBottom: "1px dashed #c9c2b8" }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#2a2421" }}>{schoolConfig?.schoolName}</div>
              <div style={{ fontSize: 11, color: "#8A8FA8", marginTop: 2 }}>OFFICIAL FEE RECEIPT</div>
              <div style={{ fontFamily: "monospace", fontSize: 13, color: "#1A5F9C", fontWeight: 700, marginTop: 6 }}>{receiptView.receiptNo}</div>
            </div>
            <div style={{ padding: "14px 22px", fontSize: 13 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <tbody>
                  <tr><td style={rcptLabel}>Date</td><td style={rcptVal}>{new Date(receiptView.paidAt).toLocaleString()}</td></tr>
                  <tr><td style={rcptLabel}>Student</td><td style={rcptVal}>{receiptView.student ? studentName(receiptView.student) : "—"}</td></tr>
                  <tr><td style={rcptLabel}>Adm No</td><td style={rcptVal}>{receiptView.student?.adm_no || "—"}</td></tr>
                  {receiptView.payerName && <tr><td style={rcptLabel}>Paid by</td><td style={rcptVal}>{receiptView.payerName}</td></tr>}
                  <tr><td style={rcptLabel}>Method</td><td style={{ ...rcptVal, textTransform: "uppercase" }}>{receiptView.method || "—"}{receiptView.reference ? ` · ${receiptView.reference}` : ""}</td></tr>
                </tbody>
              </table>

              <div style={{ borderTop: "1px dashed #c9c2b8", margin: "12px 0 8px" }} />
              <div style={{ fontSize: 10.5, fontWeight: 800, color: "#8A8FA8", marginBottom: 6 }}>SETTLED AGAINST</div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                <tbody>
                  {(receiptView.allocations || []).length === 0 && (receiptView.virtualAllocations || []).length === 0 ? (
                    <tr><td style={{ padding: "4px 0", color: "#8A8FA8", fontStyle: "italic" }}>Held as credit — nothing outstanding at time of payment.</td></tr>
                  ) : (
                    <>
                      {(receiptView.allocations || []).map((a, i) => (
                        <tr key={`real-${i}`}>
                          <td style={{ padding: "3px 0", color: "#2a2421" }}>{a.description} {a.invoice_no && <span style={{ color: "#8A8FA8", fontSize: 10.5 }}>({a.invoice_no})</span>}</td>
                          <td style={{ padding: "3px 0", textAlign: "right", fontFamily: "monospace", fontWeight: 600 }}>{Number(a.amount).toLocaleString()}</td>
                        </tr>
                      ))}
                      {(receiptView.virtualAllocations || []).map((a, i) => (
                        <tr key={`virt-${i}`}>
                          <td style={{ padding: "3px 0", color: "#2a2421" }}>{a.description} <span style={{ color: "#8A6A1F", fontSize: 10.5 }}>(Term {a.term} — to be invoiced)</span></td>
                          <td style={{ padding: "3px 0", textAlign: "right", fontFamily: "monospace", fontWeight: 600 }}>{Math.round(Number(a.amount)).toLocaleString()}</td>
                        </tr>
                      ))}
                    </>
                  )}
                  {(receiptView.virtualAllocations !== undefined
                    ? receiptView.prepayNext > 0.005
                    : receiptView.credit > 0) && (
                    <tr>
                      <td style={{ padding: "3px 0", color: "#1A5F9C", fontWeight: 600 }}>
                        {receiptView.virtualAllocations !== undefined ? `Prepayment for ${year + 1}` : 'Credit carried forward'}
                      </td>
                      <td style={{ padding: "3px 0", textAlign: "right", fontFamily: "monospace", fontWeight: 600, color: "#1A5F9C" }}>
                        {Math.round(receiptView.virtualAllocations !== undefined ? receiptView.prepayNext : receiptView.credit).toLocaleString()}
                      </td>
                    </tr>
                  )}
                  <tr>
                    <td style={{ padding: "8px 0 0", fontWeight: 800, borderTop: "1px solid #2a2421" }}>TOTAL PAID</td>
                    <td style={{ padding: "8px 0 0", textAlign: "right", fontFamily: "monospace", fontWeight: 800, fontSize: 14, borderTop: "1px solid #2a2421" }}>KES {receiptView.amount.toLocaleString()}</td>
                  </tr>
                </tbody>
              </table>
              <div style={{ fontSize: 11, fontStyle: "italic", color: "#4A4A6A", marginTop: 8 }}>
                {amountInWords(receiptView.amount)}
              </div>
              {receiptView.student && (
                <div style={{ marginTop: 10, padding: "8px 12px", background: "#F8FAFC", borderRadius: 8, fontSize: 12.5, display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#4A4A6A" }}>Balance ({year})</span>
                  <strong style={{ fontFamily: "monospace" }}>KES {balanceFor(receiptView.student).toLocaleString()}</strong>
                </div>
              )}
            </div>
            <div style={{ padding: "12px 22px 18px", display: "flex", gap: 10 }}>
              <button onClick={() => setReceiptView(null)} style={{ flex: 1, padding: 11, background: "#fff", border: "1px solid #e6dfd8", borderRadius: 10, fontWeight: 600, color: "#8a8fa8", cursor: "pointer" }}>Close</button>
              <button onClick={printReceipt} style={{ flex: 1, padding: 11, background: "#1A5F9C", border: "none", borderRadius: 10, fontWeight: 700, color: "#fff", cursor: "pointer" }}>🖨 Print</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const rcptLabel = { padding: "3px 0", color: "#8A8FA8", fontSize: 12, width: 90 };
const rcptVal = { padding: "3px 0", color: "#2a2421", fontWeight: 600, textAlign: "right" };

const thStyle = { padding: "12px 18px", fontWeight: 700, color: "#8A8FA8", fontSize: 11, textTransform: "uppercase" };
const modalLabel = { display: "block", fontSize: 12, fontWeight: 700, color: "#4A4A6A", margin: "12px 0 6px", textTransform: "uppercase", letterSpacing: "0.04em" };
const modalInput = { width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #e6dfd8", fontSize: 14, outline: "none", boxSizing: "border-box", background: "#fafafa" };

export default Fees;

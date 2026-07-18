import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { LEVELS, GRADE_NAME_TO_CODE, GRADE_CODE_TO_NAME, gradesByLevelForSchool } from '../lib/schoolLevels';

// Labels/order come from the shared level registry so Form 3/Form 4 (8-4-4)
// filter and label correctly alongside the CBC grades.
const GRADE_LABEL = GRADE_CODE_TO_NAME;
const GRADE_ORDER = Object.values(LEVELS).flat().map(n => GRADE_NAME_TO_CODE[n]);

const kes = (n) => Math.round(Number(n) || 0).toLocaleString();
const todayISO = () => new Date().toISOString().slice(0, 10);

const allocActive = (a) =>
  a.fee_payments?.status === 'active'
  || a.fee_adjustments?.status === 'active'
  || a.fee_bursary_awards?.status === 'active';
const allocIsCash = (a) => !!a.payment_id;

// --- Export helpers -------------------------------------------------

function downloadCsv(filename, headers, rows) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [headers, ...rows].map(r => r.map(esc).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function printTable(schoolName, title, headers, rows) {
  const w = window.open('', '_blank');
  if (!w) { alert('Allow pop-ups to print reports.'); return; }
  const head = headers.map(h => `<th>${h}</th>`).join('');
  const body = rows.map(r => `<tr>${r.map((c, i) => `<td class="${i > 0 && /^[\d,.-]+$/.test(String(c)) ? 'num' : ''}">${c ?? ''}</td>`).join('')}</tr>`).join('');
  w.document.write(`<!doctype html><html><head><title>${title}</title><style>
    body { font-family: Arial, sans-serif; font-size: 12px; color: #111; margin: 24px; }
    h2 { margin: 0 0 2px; } .sub { color: #555; margin: 0 0 14px; font-size: 11px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #bbb; padding: 5px 8px; text-align: left; }
    th { background: #f0f0f0; font-size: 10.5px; text-transform: uppercase; }
    .num { text-align: right; font-family: 'Courier New', monospace; }
    @media print { .noprint { display: none; } }
  </style></head><body>
    <h2>${schoolName || 'School'}</h2>
    <p class="sub">${title} · generated ${new Date().toLocaleString()} · LogiQ-Taaluma</p>
    <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
    <div class="noprint" style="margin-top:16px;text-align:center;">
      <button onclick="window.print()" style="padding:8px 22px;">Print</button>
    </div>
  </body></html>`);
  w.document.close();
  w.focus();
}

// --------------------------------------------------------------------

const FinanceReports = ({ schoolConfig }) => {
  const [year, setYear] = useState(new Date().getFullYear());
  const [report, setReport] = useState('summary');
  const appliedWorkingYear = React.useRef(false);

  // Honour the school's working year from Finance Settings (once); the
  // on-screen year selector takes over afterwards.
  useEffect(() => {
    if (!schoolConfig?.id || appliedWorkingYear.current) return;
    appliedWorkingYear.current = true;
    (async () => {
      const { data } = await supabase
        .from('fee_settings').select('working_year')
        .eq('school_id', schoolConfig.id).maybeSingle();
      if (data?.working_year) setYear(data.working_year);
    })();
  }, [schoolConfig?.id]);
  const [isLoading, setIsLoading] = useState(true);

  const [students, setStudents] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [items, setItems] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [payments, setPayments] = useState([]);
  const [voteheads, setVoteheads] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [adjustments, setAdjustments] = useState([]);  // discounts / waivers
  const [bursaries, setBursaries] = useState([]);       // sponsor bursary awards
  const [receiptByPayment, setReceiptByPayment] = useState({}); // payment_id -> receipt

  // Report-local filters: Level → Grade/Form → Term (term where money is
  // term-scoped), shared across the student-scoped reports.
  const [filterLevel, setFilterLevel] = useState('all');
  const [arrearsGrade, setArrearsGrade] = useState('all');
  const [filterTerm, setFilterTerm] = useState('all');
  const [arrearsMin, setArrearsMin] = useState('');
  const [dailyFrom, setDailyFrom] = useState(todayISO());
  const [dailyTo, setDailyTo] = useState(todayISO());

  // Only the levels this school teaches; grade list narrows to the level.
  const gradesByLevel = useMemo(() => gradesByLevelForSchool(schoolConfig?.schoolType), [schoolConfig?.schoolType]);
  const gradeOptions = useMemo(() => {
    const names = filterLevel === 'all' ? Object.values(gradesByLevel).flat() : (gradesByLevel[filterLevel] || []);
    return names.map(n => GRADE_NAME_TO_CODE[n]);
  }, [gradesByLevel, filterLevel]);

  useEffect(() => {
    if (!schoolConfig?.id) return;
    const load = async () => {
      setIsLoading(true);
      try {
        const [studs, inv, its, alloc, pays, vhs, stf, adjs, burs, rcts] = await Promise.all([
          supabase.from('students').select('id, adm_no, first_name, last_name, level_id, stream_id, boarding_status, parent_name, parent_phone, streams(name)')
            .eq('school_id', schoolConfig.id),
          supabase.from('fee_invoices').select('id, student_id, term, total, status, invoice_no')
            .eq('school_id', schoolConfig.id).eq('year', year),
          supabase.from('fee_invoice_items')
            .select('id, votehead_id, amount, invoice_id, fee_invoices!inner(year, status, term)')
            .eq('school_id', schoolConfig.id).eq('fee_invoices.year', year),
          supabase.from('fee_payment_allocations')
            .select('amount, invoice_id, invoice_item_id, payment_id, adjustment_id, bursary_id, fee_invoices!inner(year, term), fee_payments(status), fee_adjustments(status), fee_bursary_awards(status)')
            .eq('school_id', schoolConfig.id).eq('fee_invoices.year', year),
          supabase.from('fee_payments')
            .select('id, student_id, amount, method, reference, paid_at, status, recorded_by')
            .eq('school_id', schoolConfig.id).eq('year', year)
            .order('paid_at', { ascending: false }),
          supabase.from('voteheads').select('id, code, description')
            .eq('school_id', schoolConfig.id),
          supabase.from('staff').select('auth_user_id, full_name')
            .eq('school_id', schoolConfig.id).not('auth_user_id', 'is', null),
          supabase.from('fee_adjustments').select('id, student_id, amount, kind, reason, status')
            .eq('school_id', schoolConfig.id).eq('year', year),
          supabase.from('fee_bursary_awards').select('id, student_id, amount, reference, status, term, fee_sponsors(name, type)')
            .eq('school_id', schoolConfig.id).eq('year', year),
          // Receipts joined from the payments side come back as an empty array
          // (one-to-many), so load them separately and key by payment_id.
          supabase.from('fee_receipts').select('payment_id, receipt_no, is_void')
            .eq('school_id', schoolConfig.id),
        ]);
        setStudents(studs.data || []);
        setInvoices((inv.data || []).filter(i => i.status !== 'cancelled'));
        setItems((its.data || []).filter(i => i.fee_invoices?.status !== 'cancelled'));
        setAllocations(alloc.data || []);
        setPayments(pays.data || []);
        setVoteheads(vhs.data || []);
        setStaffList(stf.data || []);
        setAdjustments(adjs.data || []);
        setBursaries(burs.data || []);
        setReceiptByPayment(Object.fromEntries((rcts.data || []).map(r => [r.payment_id, r])));
      } catch (err) {
        console.error('Reports load failed:', err);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [schoolConfig?.id, year]);

  const studentById = useMemo(() => Object.fromEntries(students.map(s => [s.id, s])), [students]);
  const invById = useMemo(() => Object.fromEntries(invoices.map(i => [i.id, i])), [invoices]);
  const staffByAuth = useMemo(() => Object.fromEntries(staffList.map(s => [s.auth_user_id, s.full_name])), [staffList]);
  const activeAllocs = useMemo(() => allocations.filter(allocActive), [allocations]);
  const sName = (s) => s ? `${s.first_name || ''} ${s.last_name || ''}`.trim() : '—';

  // --- 1. Collection Summary (per term + per grade) -----------------
  const summary = useMemo(() => {
    const mk = () => ({ expected: 0, cash: 0, concession: 0 });
    const terms = { 1: mk(), 2: mk(), 3: mk() };
    const grades = {};
    invoices.forEach(i => {
      terms[i.term].expected += Number(i.total);
      const g = studentById[i.student_id]?.level_id || '?';
      (grades[g] = grades[g] || mk()).expected += Number(i.total);
    });
    activeAllocs.forEach(a => {
      const inv = invById[a.invoice_id];
      if (!inv) return;
      const key = allocIsCash(a) ? 'cash' : 'concession';
      terms[inv.term][key] += Number(a.amount);
      const g = studentById[inv.student_id]?.level_id || '?';
      (grades[g] = grades[g] || mk())[key] += Number(a.amount);
    });
    const gradeRows = Object.entries(grades)
      .sort(([a], [b]) => GRADE_ORDER.indexOf(a) - GRADE_ORDER.indexOf(b))
      .map(([g, v]) => ({ grade: GRADE_LABEL[g] || g, ...v, outstanding: v.expected - v.cash - v.concession }));
    return { terms, gradeRows };
  }, [invoices, activeAllocs, invById, studentById]);

  // --- 2. Arrears — derived below from the shared per-student splits so the
  // Level/Grade/Term filters apply identically everywhere. (See `arrears`.)

  // --- 3. Daily collections ------------------------------------------
  const daily = useMemo(() => {
    const from = new Date(dailyFrom + 'T00:00:00');
    const to = new Date(dailyTo + 'T23:59:59');
    const rows = payments.filter(p => {
      const d = new Date(p.paid_at);
      return d >= from && d <= to;
    });
    const byMethod = {};
    rows.forEach(p => {
      if (p.status !== 'active') return;
      const m = (p.method || 'other').toLowerCase();
      byMethod[m] = (byMethod[m] || 0) + Number(p.amount);
    });
    const total = Object.values(byMethod).reduce((s, v) => s + v, 0);
    return { rows, byMethod, total };
  }, [payments, dailyFrom, dailyTo]);

  // --- 4. Votehead collections (term-aware) ----------------------------
  const voteheadReport = useMemo(() => {
    const vh = {};
    const termOk = (t) => filterTerm === 'all' || Number(t) === Number(filterTerm);
    const itemVotehead = Object.fromEntries(items.map(i => [i.id, i.votehead_id]));
    items.forEach(i => {
      if (!termOk(i.fee_invoices?.term)) return;
      const k = i.votehead_id || 'custom';
      (vh[k] = vh[k] || { expected: 0, cash: 0, concession: 0 }).expected += Number(i.amount);
    });
    activeAllocs.forEach(a => {
      if (!termOk(a.fee_invoices?.term)) return;
      const k = itemVotehead[a.invoice_item_id] || 'custom';
      if (!vh[k]) vh[k] = { expected: 0, cash: 0, concession: 0 };
      vh[k][allocIsCash(a) ? 'cash' : 'concession'] += Number(a.amount);
    });
    const label = (k) => {
      if (k === 'custom') return 'Custom charges';
      const v = voteheads.find(x => x.id === k);
      return v ? `${v.code} — ${v.description}` : 'Unknown';
    };
    return Object.entries(vh)
      .map(([k, v]) => ({ label: label(k), ...v, outstanding: v.expected - v.cash - v.concession }))
      .sort((a, b) => b.expected - a.expected);
  }, [items, activeAllocs, voteheads, filterTerm]);

  // --- Shared per-student expected/settled, split by term ------------
  // Settled nets cash AND concessions (both are invoice allocations).
  const perStudent = useMemo(() => {
    const exp = {}, set = {};
    invoices.forEach(i => {
      (exp[i.student_id] = exp[i.student_id] || { 1: 0, 2: 0, 3: 0 })[i.term] += Number(i.total);
    });
    activeAllocs.forEach(a => {
      const inv = invById[a.invoice_id]; if (!inv) return;
      (set[inv.student_id] = set[inv.student_id] || { 1: 0, 2: 0, 3: 0 })[inv.term] += Number(a.amount);
    });
    return Object.keys(exp).map(sid => {
      const e = exp[sid], s = set[sid] || { 1: 0, 2: 0, 3: 0 };
      const expTotal = e[1] + e[2] + e[3], setTotal = s[1] + s[2] + s[3];
      return {
        student: studentById[sid], sid, e, s,
        expTotal, setTotal,
        t1: Math.max(0, e[1] - s[1]), t2: Math.max(0, e[2] - s[2]), t3: Math.max(0, e[3] - s[3]),
        outstanding: expTotal - setTotal, // negative = credit
      };
    });
  }, [invoices, activeAllocs, invById, studentById]);

  // Term view: when a term is selected, invoiced/settled/outstanding narrow
  // to that term only (Aged Balances keeps all three columns regardless).
  const perStudentScoped = useMemo(() => {
    if (filterTerm === 'all') return perStudent;
    const t = Number(filterTerm);
    return perStudent.map(r => ({
      ...r,
      expTotal: r.e[t], setTotal: r.s[t],
      outstanding: r.e[t] - r.s[t],
    }));
  }, [perStudent, filterTerm]);

  const lastPayBySid = useMemo(() => {
    const m = {};
    payments.forEach(p => {
      if (p.status !== 'active') return;
      const d = new Date(p.paid_at).getTime();
      if (!m[p.student_id] || d > m[p.student_id]) m[p.student_id] = d;
    });
    return m;
  }, [payments]);

  const gradeOk = (r) => {
    const lid = r.student?.level_id;
    if (filterLevel !== 'all' && !gradeOptions.includes(lid)) return false;
    return arrearsGrade === 'all' || lid === arrearsGrade;
  };
  const minAmt = parseFloat(arrearsMin) || 0.005;

  // --- 5. Aged fee balances (arrears split by term) ------------------
  const aged = useMemo(() =>
    perStudent.filter(r => r.outstanding >= minAmt).filter(gradeOk)
      .sort((a, b) => b.outstanding - a.outstanding),
    [perStudent, filterLevel, gradeOptions, arrearsGrade, arrearsMin]);

  // --- 2. Arrears (level/grade/term-aware) ----------------------------
  const arrears = useMemo(() =>
    perStudentScoped.filter(r => r.outstanding >= minAmt).filter(gradeOk)
      .map(r => ({ student: r.student, expected: r.expTotal, settled: r.setTotal, outstanding: r.outstanding }))
      .sort((a, b) => b.outstanding - a.outstanding),
    [perStudentScoped, filterLevel, gradeOptions, arrearsGrade, arrearsMin]);

  // --- 6. Defaulters & reminder list ---------------------------------
  const defaulters = useMemo(() =>
    perStudentScoped.filter(r => r.outstanding >= minAmt).filter(gradeOk)
      .sort((a, b) => b.outstanding - a.outstanding),
    [perStudentScoped, filterLevel, gradeOptions, arrearsGrade, arrearsMin]);

  // --- 7. Overpayments / credit balances -----------------------------
  const overpayments = useMemo(() =>
    perStudentScoped.filter(r => r.outstanding <= -0.005).filter(gradeOk)
      .map(r => ({ ...r, credit: -r.outstanding }))
      .sort((a, b) => b.credit - a.credit),
    [perStudentScoped, filterLevel, gradeOptions, arrearsGrade]);

  // --- 8. Fee clearance (fully paid) ---------------------------------
  const cleared = useMemo(() =>
    perStudentScoped.filter(r => r.expTotal > 0 && r.outstanding <= 0.005).filter(gradeOk)
      .sort((a, b) => sName(a.student).localeCompare(sName(b.student))),
    [perStudentScoped, filterLevel, gradeOptions, arrearsGrade]);

  // --- 9. Receipts register / cash book ------------------------------
  const receiptsRegister = useMemo(() => {
    const rows = [...payments].sort((a, b) => new Date(a.paid_at) - new Date(b.paid_at));
    let running = 0;
    return rows.map(p => {
      const active = p.status === 'active';
      if (active) running += Number(p.amount);
      return { p, running, active };
    });
  }, [payments]);

  // --- 10. Cashier summary (collections by user) ---------------------
  const cashierSummary = useMemo(() => {
    const m = {};
    payments.forEach(p => {
      if (p.status !== 'active') return;
      const key = p.recorded_by || 'unknown';
      const c = (m[key] = m[key] || { name: staffByAuth[p.recorded_by] || 'Admin', count: 0, total: 0 });
      c.count += 1; c.total += Number(p.amount);
    });
    return Object.values(m).sort((a, b) => b.total - a.total);
  }, [payments, staffByAuth]);

  // --- 11. Concessions register + sponsor utilization ----------------
  const concessions = useMemo(() => {
    const rows = [];
    adjustments.filter(a => a.status === 'active').forEach(a => rows.push({
      type: a.kind === 'waiver' ? 'Waiver' : 'Discount',
      student: studentById[a.student_id], source: '—',
      detail: a.reason || '', amount: Number(a.amount), term: a.term,
    }));
    bursaries.filter(b => b.status === 'active').forEach(b => rows.push({
      type: 'Bursary', student: studentById[b.student_id],
      source: b.fee_sponsors?.name || 'Sponsor',
      detail: b.reference || '', amount: Number(b.amount), term: b.term,
    }));
    rows.sort((a, b) => b.amount - a.amount);
    const bySponsor = {};
    bursaries.filter(b => b.status === 'active').forEach(b => {
      const k = b.fee_sponsors?.name || 'Unnamed sponsor';
      (bySponsor[k] = bySponsor[k] || { count: 0, total: 0 });
      bySponsor[k].count += 1; bySponsor[k].total += Number(b.amount);
    });
    const sponsorRows = Object.entries(bySponsor).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.total - a.total);
    const totals = {
      discount: rows.filter(r => r.type === 'Discount').reduce((s, r) => s + r.amount, 0),
      waiver: rows.filter(r => r.type === 'Waiver').reduce((s, r) => s + r.amount, 0),
      bursary: rows.filter(r => r.type === 'Bursary').reduce((s, r) => s + r.amount, 0),
    };
    return { rows, sponsorRows, totals };
  }, [adjustments, bursaries, studentById]);

  // Shared Level → Grade/Form → Term selectors (used by the student reports).
  const levelSel = (
    <select value={filterLevel} onChange={(e) => { setFilterLevel(e.target.value); setArrearsGrade('all'); }} style={filterSel}>
      <option value="all">All levels</option>
      {Object.keys(gradesByLevel).map(l => <option key={l} value={l}>{l}</option>)}
    </select>
  );
  const gradeSel = (
    <select value={arrearsGrade} onChange={(e) => setArrearsGrade(e.target.value)} style={filterSel}>
      <option value="all">All grades</option>
      {gradeOptions.map(g => <option key={g} value={g}>{GRADE_LABEL[g]}</option>)}
    </select>
  );
  const termSel = (
    <select value={filterTerm} onChange={(e) => setFilterTerm(e.target.value)} style={filterSel}>
      <option value="all">Full year</option>
      {[1, 2, 3].map(t => <option key={t} value={t}>Term {t}</option>)}
    </select>
  );
  const termTag = filterTerm !== 'all' ? ` — Term ${filterTerm}` : '';

  // --- Export wiring ---------------------------------------------------
  const exportCurrent = (mode) => {
    let title, headers, rows;
    if (report === 'summary') {
      title = `Fee Collection Summary — ${year}`;
      headers = ['Scope', 'Expected (KES)', 'Cash Collected', 'Concessions', 'Outstanding'];
      rows = [
        ...[1, 2, 3].map(t => {
          const v = summary.terms[t];
          return [`Term ${t}`, kes(v.expected), kes(v.cash), kes(v.concession), kes(v.expected - v.cash - v.concession)];
        }),
        ...summary.gradeRows.map(r => [r.grade, kes(r.expected), kes(r.cash), kes(r.concession), kes(r.outstanding)]),
      ];
    } else if (report === 'arrears') {
      title = `Arrears Report — ${year}${termTag}`;
      headers = ['Adm No', 'Student', 'Grade', 'Stream', 'Invoiced (KES)', 'Settled', 'Outstanding'];
      rows = arrears.map(r => [
        r.student?.adm_no || '', sName(r.student), GRADE_LABEL[r.student?.level_id] || '',
        r.student?.streams?.name || '', kes(r.expected), kes(r.settled), kes(r.outstanding),
      ]);
    } else if (report === 'daily') {
      title = `Daily Collections ${dailyFrom}${dailyTo !== dailyFrom ? ` to ${dailyTo}` : ''}`;
      headers = ['Date', 'Receipt', 'Student', 'Amount (KES)', 'Method', 'Reference', 'Recorded By', 'Status'];
      rows = daily.rows.map(p => [
        new Date(p.paid_at).toLocaleString(), receiptByPayment[p.id]?.receipt_no || '', sName(studentById[p.student_id]),
        kes(p.amount), (p.method || '').toUpperCase(), p.reference || '',
        staffByAuth[p.recorded_by] || 'Admin', p.status === 'voided' ? 'VOID' : 'OK',
      ]);
    } else if (report === 'voteheads') {
      title = `Votehead Collections — ${year}${termTag}`;
      headers = ['Votehead', 'Expected (KES)', 'Cash Collected', 'Concessions', 'Outstanding'];
      rows = voteheadReport.map(r => [r.label, kes(r.expected), kes(r.cash), kes(r.concession), kes(r.outstanding)]);
    } else if (report === 'aged') {
      title = `Aged Fee Balances — ${year}`;
      headers = ['Adm No', 'Student', 'Grade', 'Stream', 'Term 1 Due', 'Term 2 Due', 'Term 3 Due', 'Total Due'];
      rows = aged.map(r => [
        r.student?.adm_no || '', sName(r.student), GRADE_LABEL[r.student?.level_id] || '',
        r.student?.streams?.name || '', kes(r.t1), kes(r.t2), kes(r.t3), kes(r.outstanding),
      ]);
    } else if (report === 'defaulters') {
      title = `Defaulters & Reminder List — ${year}${termTag}`;
      headers = ['Adm No', 'Student', 'Grade', 'Stream', 'Parent/Guardian', 'Phone', 'Balance (KES)', 'Last Payment'];
      rows = defaulters.map(r => [
        r.student?.adm_no || '', sName(r.student), GRADE_LABEL[r.student?.level_id] || '',
        r.student?.streams?.name || '', r.student?.parent_name || '', r.student?.parent_phone || '',
        kes(r.outstanding), lastPayBySid[r.sid] ? new Date(lastPayBySid[r.sid]).toLocaleDateString() : 'Never',
      ]);
    } else if (report === 'overpayments') {
      title = `Overpayments / Credit Balances — ${year}${termTag}`;
      headers = ['Adm No', 'Student', 'Grade', 'Invoiced (KES)', 'Settled', 'Credit'];
      rows = overpayments.map(r => [
        r.student?.adm_no || '', sName(r.student), GRADE_LABEL[r.student?.level_id] || '',
        kes(r.expTotal), kes(r.setTotal), kes(r.credit),
      ]);
    } else if (report === 'clearance') {
      title = `Fee Clearance (fully paid) — ${year}${termTag}`;
      headers = ['Adm No', 'Student', 'Grade', 'Stream', 'Invoiced (KES)', 'Settled'];
      rows = cleared.map(r => [
        r.student?.adm_no || '', sName(r.student), GRADE_LABEL[r.student?.level_id] || '',
        r.student?.streams?.name || '', kes(r.expTotal), kes(r.setTotal),
      ]);
    } else if (report === 'receipts') {
      title = `Receipts Register / Cash Book — ${year}`;
      headers = ['Receipt No', 'Date', 'Student', 'Amount (KES)', 'Method', 'Recorded By', 'Status', 'Running Total'];
      rows = receiptsRegister.map(({ p, running, active }) => [
        receiptByPayment[p.id]?.receipt_no || '—', new Date(p.paid_at).toLocaleString(), sName(studentById[p.student_id]),
        kes(p.amount), (p.method || '').toUpperCase(), staffByAuth[p.recorded_by] || 'Admin',
        active ? 'OK' : 'VOID', active ? kes(running) : '',
      ]);
    } else if (report === 'cashier') {
      title = `Cashier Summary — ${year}`;
      headers = ['Cashier', 'Receipts', 'Total Collected (KES)'];
      rows = cashierSummary.map(c => [c.name, String(c.count), kes(c.total)]);
    } else if (report === 'concessions') {
      title = `Concessions Register — ${year}`;
      headers = ['Type', 'Student', 'Sponsor', 'Detail / Reason', 'Term', 'Amount (KES)'];
      rows = concessions.rows.map(r => [
        r.type, sName(r.student), r.source, r.detail, r.term ? `T${r.term}` : 'All', kes(r.amount),
      ]);
    } else {
      title = `Report — ${year}`; headers = []; rows = [];
    }
    if (mode === 'csv') downloadCsv(`${title.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}.csv`, headers, rows);
    else printTable(schoolConfig?.schoolName, title, headers, rows);
  };

  const reportTabs = [
    { id: 'summary', label: '📊 Collection Summary' },
    { id: 'aged', label: '📈 Aged Balances' },
    { id: 'arrears', label: '⏳ Arrears' },
    { id: 'defaulters', label: '📣 Defaulters & Reminders' },
    { id: 'overpayments', label: '💰 Overpayments' },
    { id: 'clearance', label: '✅ Fee Clearance' },
    { id: 'daily', label: '📅 Daily Collections' },
    { id: 'receipts', label: '🧾 Receipts Register' },
    { id: 'cashier', label: '👤 Cashier Summary' },
    { id: 'voteheads', label: '🧮 Votehead Collections' },
    { id: 'concessions', label: '🎁 Concessions Register' },
  ];

  return (
    <div style={{ paddingBottom: 40 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#2a2421' }}>Finance Reports</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#8A8FA8' }}>Read-only computations over invoices, settlements and the ledger.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={year} onChange={(e) => setYear(parseInt(e.target.value))}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #E8EAF0', fontSize: 13, background: '#fff' }}>
            {[new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={() => exportCurrent('csv')} style={btnStyle('#1B6B3A')}>⬇ CSV</button>
          <button onClick={() => exportCurrent('print')} style={btnStyle('#1A5F9C')}>🖨 Print</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {reportTabs.map(t => (
          <button key={t.id} onClick={() => setReport(t.id)} style={{
            padding: '8px 14px', borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
            border: report === t.id ? '1.5px solid #1A5F9C' : '1px solid #E8EAF0',
            background: report === t.id ? '#EAF2FA' : '#fff',
            color: report === t.id ? '#1A5F9C' : '#4A4A6A',
          }}>{t.label}</button>
        ))}
      </div>

      <div style={{ background: '#fff', border: '1px solid #E8EAF0', borderRadius: 12, overflow: 'hidden' }}>
        {isLoading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#8A8FA8', fontSize: 13 }}>Loading…</div>
        ) : report === 'summary' ? (
          <div style={{ padding: 18 }}>
            <table style={tableStyle}>
              <thead><tr>
                <th style={thStyle}>Term</th><th style={thNum}>Expected</th><th style={thNum}>Cash Collected</th>
                <th style={thNum}>Concessions</th><th style={thNum}>Outstanding</th><th style={thNum}>Rate</th>
              </tr></thead>
              <tbody>
                {[1, 2, 3].map(t => {
                  const v = summary.terms[t];
                  const out = v.expected - v.cash - v.concession;
                  const rate = v.expected > 0 ? Math.round(((v.cash + v.concession) / v.expected) * 100) : 0;
                  return (
                    <tr key={t} style={{ borderBottom: '1px solid #F0F2F5' }}>
                      <td style={tdStyle}><strong>Term {t}</strong></td>
                      <td style={tdNum}>{kes(v.expected)}</td>
                      <td style={{ ...tdNum, color: '#1B6B3A' }}>{kes(v.cash)}</td>
                      <td style={{ ...tdNum, color: '#6C3483' }}>{kes(v.concession)}</td>
                      <td style={{ ...tdNum, color: '#C0392B' }}>{kes(out)}</td>
                      <td style={tdNum}>{v.expected > 0 ? `${rate}%` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#8A8FA8', textTransform: 'uppercase', margin: '20px 0 8px' }}>By grade (all terms)</div>
            <table style={tableStyle}>
              <thead><tr>
                <th style={thStyle}>Grade</th><th style={thNum}>Expected</th><th style={thNum}>Cash</th>
                <th style={thNum}>Concessions</th><th style={thNum}>Outstanding</th>
              </tr></thead>
              <tbody>
                {summary.gradeRows.map(r => (
                  <tr key={r.grade} style={{ borderBottom: '1px solid #F0F2F5' }}>
                    <td style={tdStyle}>{r.grade}</td>
                    <td style={tdNum}>{kes(r.expected)}</td>
                    <td style={{ ...tdNum, color: '#1B6B3A' }}>{kes(r.cash)}</td>
                    <td style={{ ...tdNum, color: '#6C3483' }}>{kes(r.concession)}</td>
                    <td style={{ ...tdNum, color: '#C0392B' }}>{kes(r.outstanding)}</td>
                  </tr>
                ))}
                {summary.gradeRows.length === 0 && <tr><td colSpan="5" style={{ ...tdStyle, textAlign: 'center', color: '#8A8FA8' }}>No invoices for {year} yet — generate them in Fees Management.</td></tr>}
              </tbody>
            </table>
          </div>
        ) : report === 'arrears' ? (
          <div style={{ padding: 18 }}>
            <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              {levelSel}
              {gradeSel}
              {termSel}
              <input type="number" placeholder="Min balance (KES)" value={arrearsMin}
                onChange={(e) => setArrearsMin(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #E8EAF0', fontSize: 13, width: 150 }} />
              <span style={{ fontSize: 12.5, color: '#8A8FA8' }}>
                {arrears.length} student{arrears.length === 1 ? '' : 's'} · total outstanding{' '}
                <strong style={{ color: '#C0392B' }}>KES {kes(arrears.reduce((s, r) => s + r.outstanding, 0))}</strong>
              </span>
            </div>
            <table style={tableStyle}>
              <thead><tr>
                <th style={thStyle}>Adm No</th><th style={thStyle}>Student</th><th style={thStyle}>Grade</th>
                <th style={thNum}>Invoiced</th><th style={thNum}>Settled</th><th style={thNum}>Outstanding</th>
              </tr></thead>
              <tbody>
                {arrears.slice(0, 300).map(r => (
                  <tr key={r.student?.id || Math.random()} style={{ borderBottom: '1px solid #F0F2F5' }}>
                    <td style={{ ...tdStyle, color: '#1A5F9C', fontWeight: 600 }}>{r.student?.adm_no}</td>
                    <td style={{ ...tdStyle, fontWeight: 700 }}>{sName(r.student)}</td>
                    <td style={tdStyle}>{GRADE_LABEL[r.student?.level_id] || '—'}{r.student?.streams?.name ? ` · ${r.student.streams.name}` : ''}</td>
                    <td style={tdNum}>{kes(r.expected)}</td>
                    <td style={{ ...tdNum, color: '#1B6B3A' }}>{kes(r.settled)}</td>
                    <td style={{ ...tdNum, color: '#C0392B', fontWeight: 700 }}>{kes(r.outstanding)}</td>
                  </tr>
                ))}
                {arrears.length === 0 && <tr><td colSpan="6" style={{ ...tdStyle, textAlign: 'center', color: '#8A8FA8' }}>No outstanding balances match. 🎉</td></tr>}
              </tbody>
            </table>
          </div>
        ) : report === 'daily' ? (
          <div style={{ padding: 18 }}>
            <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              <input type="date" value={dailyFrom} onChange={(e) => setDailyFrom(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #E8EAF0', fontSize: 13 }} />
              <span style={{ color: '#8A8FA8' }}>→</span>
              <input type="date" value={dailyTo} onChange={(e) => setDailyTo(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #E8EAF0', fontSize: 13 }} />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {Object.entries(daily.byMethod).map(([m, v]) => (
                  <span key={m} style={{ padding: '5px 12px', background: '#F8FAFC', borderRadius: 999, fontSize: 12 }}>
                    <span style={{ textTransform: 'uppercase', color: '#8A8FA8', fontWeight: 700, fontSize: 10 }}>{m}</span>{' '}
                    <strong style={{ fontFamily: 'monospace' }}>{kes(v)}</strong>
                  </span>
                ))}
                <span style={{ padding: '5px 12px', background: '#E8F5EE', borderRadius: 999, fontSize: 12, color: '#1B6B3A' }}>
                  TOTAL <strong style={{ fontFamily: 'monospace' }}>KES {kes(daily.total)}</strong>
                </span>
              </div>
            </div>
            <table style={tableStyle}>
              <thead><tr>
                <th style={thStyle}>Time</th><th style={thStyle}>Receipt</th><th style={thStyle}>Student</th>
                <th style={thNum}>Amount</th><th style={thStyle}>Method</th><th style={thStyle}>Recorded By</th>
              </tr></thead>
              <tbody>
                {daily.rows.map(p => {
                  const voided = p.status === 'voided';
                  return (
                    <tr key={p.id} style={{ borderBottom: '1px solid #F0F2F5', opacity: voided ? 0.55 : 1 }}>
                      <td style={tdStyle}>{new Date(p.paid_at).toLocaleString()}</td>
                      <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 11.5, color: '#1A5F9C' }}>{receiptByPayment[p.id]?.receipt_no || '—'}</td>
                      <td style={{ ...tdStyle, fontWeight: 700 }}>{sName(studentById[p.student_id])}</td>
                      <td style={{ ...tdNum, color: voided ? '#8A8FA8' : '#1B6B3A', textDecoration: voided ? 'line-through' : 'none' }}>
                        {kes(p.amount)}{voided && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 800, color: '#C0392B' }}>VOID</span>}
                      </td>
                      <td style={{ ...tdStyle, textTransform: 'capitalize' }}>{p.method || '—'}{p.reference ? ` · ${p.reference}` : ''}</td>
                      <td style={tdStyle}>{staffByAuth[p.recorded_by] || 'Admin'}</td>
                    </tr>
                  );
                })}
                {daily.rows.length === 0 && <tr><td colSpan="6" style={{ ...tdStyle, textAlign: 'center', color: '#8A8FA8' }}>No payments in this period.</td></tr>}
              </tbody>
            </table>
          </div>
        ) : report === 'aged' ? (
          <div style={{ padding: 18 }}>
            <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              {levelSel}
              {gradeSel}
              <input type="number" placeholder="Min balance (KES)" value={arrearsMin} onChange={(e) => setArrearsMin(e.target.value)} style={{ ...filterSel, width: 150 }} />
              <span style={{ fontSize: 12.5, color: '#8A8FA8' }}>{aged.length} owing · total <strong style={{ color: '#C0392B' }}>KES {kes(aged.reduce((s, r) => s + r.outstanding, 0))}</strong></span>
            </div>
            <table style={tableStyle}>
              <thead><tr>
                <th style={thStyle}>Adm No</th><th style={thStyle}>Student</th><th style={thStyle}>Grade</th>
                <th style={thNum}>Term 1</th><th style={thNum}>Term 2</th><th style={thNum}>Term 3</th><th style={thNum}>Total Due</th>
              </tr></thead>
              <tbody>
                {aged.slice(0, 400).map(r => (
                  <tr key={r.sid} style={{ borderBottom: '1px solid #F0F2F5' }}>
                    <td style={{ ...tdStyle, color: '#1A5F9C', fontWeight: 600 }}>{r.student?.adm_no}</td>
                    <td style={{ ...tdStyle, fontWeight: 700 }}>{sName(r.student)}</td>
                    <td style={tdStyle}>{GRADE_LABEL[r.student?.level_id] || '—'}{r.student?.streams?.name ? ` · ${r.student.streams.name}` : ''}</td>
                    <td style={{ ...tdNum, color: r.t1 > 0 ? '#C0392B' : '#C9C9C9' }}>{r.t1 ? kes(r.t1) : '—'}</td>
                    <td style={{ ...tdNum, color: r.t2 > 0 ? '#C0392B' : '#C9C9C9' }}>{r.t2 ? kes(r.t2) : '—'}</td>
                    <td style={{ ...tdNum, color: r.t3 > 0 ? '#C0392B' : '#C9C9C9' }}>{r.t3 ? kes(r.t3) : '—'}</td>
                    <td style={{ ...tdNum, fontWeight: 700, color: '#C0392B' }}>{kes(r.outstanding)}</td>
                  </tr>
                ))}
                {aged.length === 0 && <tr><td colSpan="7" style={{ ...tdStyle, textAlign: 'center', color: '#8A8FA8' }}>No outstanding balances. 🎉</td></tr>}
              </tbody>
            </table>
          </div>
        ) : report === 'defaulters' ? (
          <div style={{ padding: 18 }}>
            <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              {levelSel}
              {gradeSel}
              <input type="number" placeholder="Min balance (KES)" value={arrearsMin} onChange={(e) => setArrearsMin(e.target.value)} style={{ ...filterSel, width: 150 }} />
              {termSel}
              <span style={{ fontSize: 12.5, color: '#8A8FA8' }}>{defaulters.length} to follow up · export for SMS / calls</span>
            </div>
            <table style={tableStyle}>
              <thead><tr>
                <th style={thStyle}>Adm No</th><th style={thStyle}>Student</th><th style={thStyle}>Class</th>
                <th style={thStyle}>Parent / Guardian</th><th style={thStyle}>Phone</th><th style={thNum}>Balance</th><th style={thStyle}>Last Paid</th>
              </tr></thead>
              <tbody>
                {defaulters.slice(0, 400).map(r => (
                  <tr key={r.sid} style={{ borderBottom: '1px solid #F0F2F5' }}>
                    <td style={{ ...tdStyle, color: '#1A5F9C', fontWeight: 600 }}>{r.student?.adm_no}</td>
                    <td style={{ ...tdStyle, fontWeight: 700 }}>{sName(r.student)}</td>
                    <td style={tdStyle}>{GRADE_LABEL[r.student?.level_id] || '—'}{r.student?.streams?.name ? ` · ${r.student.streams.name}` : ''}</td>
                    <td style={tdStyle}>{r.student?.parent_name || '—'}</td>
                    <td style={{ ...tdStyle, fontFamily: 'monospace', color: '#1A5F9C' }}>{r.student?.parent_phone || '—'}</td>
                    <td style={{ ...tdNum, fontWeight: 700, color: '#C0392B' }}>{kes(r.outstanding)}</td>
                    <td style={{ ...tdStyle, color: lastPayBySid[r.sid] ? '#4A4A6A' : '#C0392B' }}>{lastPayBySid[r.sid] ? new Date(lastPayBySid[r.sid]).toLocaleDateString() : 'Never'}</td>
                  </tr>
                ))}
                {defaulters.length === 0 && <tr><td colSpan="7" style={{ ...tdStyle, textAlign: 'center', color: '#8A8FA8' }}>No defaulters. 🎉</td></tr>}
              </tbody>
            </table>
          </div>
        ) : report === 'overpayments' ? (
          <div style={{ padding: 18 }}>
            <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              {levelSel}
              {gradeSel}
              {termSel}
              <span style={{ fontSize: 12.5, color: '#8A8FA8' }}>{overpayments.length} in credit · total <strong style={{ color: '#8A6A1F' }}>KES {kes(overpayments.reduce((s, r) => s + r.credit, 0))}</strong></span>
            </div>
            <table style={tableStyle}>
              <thead><tr>
                <th style={thStyle}>Adm No</th><th style={thStyle}>Student</th><th style={thStyle}>Class</th>
                <th style={thNum}>Invoiced</th><th style={thNum}>Settled</th><th style={thNum}>Credit</th>
              </tr></thead>
              <tbody>
                {overpayments.map(r => (
                  <tr key={r.sid} style={{ borderBottom: '1px solid #F0F2F5' }}>
                    <td style={{ ...tdStyle, color: '#1A5F9C', fontWeight: 600 }}>{r.student?.adm_no}</td>
                    <td style={{ ...tdStyle, fontWeight: 700 }}>{sName(r.student)}</td>
                    <td style={tdStyle}>{GRADE_LABEL[r.student?.level_id] || '—'}{r.student?.streams?.name ? ` · ${r.student.streams.name}` : ''}</td>
                    <td style={tdNum}>{kes(r.expTotal)}</td>
                    <td style={{ ...tdNum, color: '#1B6B3A' }}>{kes(r.setTotal)}</td>
                    <td style={{ ...tdNum, fontWeight: 700, color: '#8A6A1F' }}>{kes(r.credit)}</td>
                  </tr>
                ))}
                {overpayments.length === 0 && <tr><td colSpan="6" style={{ ...tdStyle, textAlign: 'center', color: '#8A8FA8' }}>No credit balances.</td></tr>}
              </tbody>
            </table>
          </div>
        ) : report === 'clearance' ? (
          <div style={{ padding: 18 }}>
            <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              {levelSel}
              {gradeSel}
              {termSel}
              <span style={{ fontSize: 12.5, color: '#8A8FA8' }}>{cleared.length} fully paid ✅{filterTerm !== 'all' ? ` for Term ${filterTerm}` : ''}</span>
            </div>
            <table style={tableStyle}>
              <thead><tr>
                <th style={thStyle}>Adm No</th><th style={thStyle}>Student</th><th style={thStyle}>Class</th>
                <th style={thNum}>Invoiced</th><th style={thNum}>Settled</th>
              </tr></thead>
              <tbody>
                {cleared.slice(0, 400).map(r => (
                  <tr key={r.sid} style={{ borderBottom: '1px solid #F0F2F5' }}>
                    <td style={{ ...tdStyle, color: '#1A5F9C', fontWeight: 600 }}>{r.student?.adm_no}</td>
                    <td style={{ ...tdStyle, fontWeight: 700 }}>{sName(r.student)}</td>
                    <td style={tdStyle}>{GRADE_LABEL[r.student?.level_id] || '—'}{r.student?.streams?.name ? ` · ${r.student.streams.name}` : ''}</td>
                    <td style={tdNum}>{kes(r.expTotal)}</td>
                    <td style={{ ...tdNum, color: '#1B6B3A' }}>{kes(r.setTotal)}</td>
                  </tr>
                ))}
                {cleared.length === 0 && <tr><td colSpan="5" style={{ ...tdStyle, textAlign: 'center', color: '#8A8FA8' }}>No fully-paid students yet.</td></tr>}
              </tbody>
            </table>
          </div>
        ) : report === 'receipts' ? (
          <div style={{ padding: 18 }}>
            <div style={{ fontSize: 12.5, color: '#8A8FA8', marginBottom: 12 }}>
              {receiptsRegister.filter(x => x.active).length} active receipt(s) · running total{' '}
              <strong style={{ color: '#1B6B3A' }}>KES {kes(receiptsRegister.filter(x => x.active).reduce((s, x) => s + Number(x.p.amount), 0))}</strong>
            </div>
            <table style={tableStyle}>
              <thead><tr>
                <th style={thStyle}>Receipt No</th><th style={thStyle}>Date</th><th style={thStyle}>Student</th>
                <th style={thNum}>Amount</th><th style={thStyle}>Method</th><th style={thStyle}>Recorded By</th><th style={thNum}>Running Total</th>
              </tr></thead>
              <tbody>
                {receiptsRegister.slice(0, 500).map(({ p, running, active }) => (
                  <tr key={p.id} style={{ borderBottom: '1px solid #F0F2F5', opacity: active ? 1 : 0.55 }}>
                    <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 11.5, color: '#1A5F9C' }}>{receiptByPayment[p.id]?.receipt_no || '—'}</td>
                    <td style={tdStyle}>{new Date(p.paid_at).toLocaleDateString()}</td>
                    <td style={{ ...tdStyle, fontWeight: 700 }}>{sName(studentById[p.student_id])}</td>
                    <td style={{ ...tdNum, color: active ? '#1B6B3A' : '#8A8FA8', textDecoration: active ? 'none' : 'line-through' }}>{kes(p.amount)}{!active && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 800, color: '#C0392B' }}>VOID</span>}</td>
                    <td style={{ ...tdStyle, textTransform: 'capitalize' }}>{p.method || '—'}</td>
                    <td style={tdStyle}>{staffByAuth[p.recorded_by] || 'Admin'}</td>
                    <td style={{ ...tdNum, fontWeight: 600 }}>{active ? kes(running) : '—'}</td>
                  </tr>
                ))}
                {receiptsRegister.length === 0 && <tr><td colSpan="7" style={{ ...tdStyle, textAlign: 'center', color: '#8A8FA8' }}>No receipts for {year} yet.</td></tr>}
              </tbody>
            </table>
          </div>
        ) : report === 'cashier' ? (
          <div style={{ padding: 18 }}>
            <table style={tableStyle}>
              <thead><tr>
                <th style={thStyle}>Cashier</th><th style={thNum}>Receipts</th><th style={thNum}>Total Collected</th>
              </tr></thead>
              <tbody>
                {cashierSummary.map(c => (
                  <tr key={c.name} style={{ borderBottom: '1px solid #F0F2F5' }}>
                    <td style={{ ...tdStyle, fontWeight: 700 }}>{c.name}</td>
                    <td style={tdNum}>{c.count}</td>
                    <td style={{ ...tdNum, color: '#1B6B3A', fontWeight: 700 }}>{kes(c.total)}</td>
                  </tr>
                ))}
                {cashierSummary.length === 0 && <tr><td colSpan="3" style={{ ...tdStyle, textAlign: 'center', color: '#8A8FA8' }}>No collections for {year} yet.</td></tr>}
              </tbody>
              {cashierSummary.length > 0 && (
                <tfoot><tr style={{ borderTop: '2px solid #2a2421' }}>
                  <td style={{ ...tdStyle, fontWeight: 800 }}>All cashiers</td>
                  <td style={{ ...tdNum, fontWeight: 800 }}>{cashierSummary.reduce((s, c) => s + c.count, 0)}</td>
                  <td style={{ ...tdNum, fontWeight: 800, color: '#1B6B3A' }}>{kes(cashierSummary.reduce((s, c) => s + c.total, 0))}</td>
                </tr></tfoot>
              )}
            </table>
          </div>
        ) : report === 'concessions' ? (
          <div style={{ padding: 18 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              {[['Discounts', concessions.totals.discount, '#1A5F9C'], ['Waivers', concessions.totals.waiver, '#6C3483'], ['Bursaries', concessions.totals.bursary, '#1B6B3A']].map(([lbl, val, col]) => (
                <span key={lbl} style={{ padding: '6px 14px', background: '#F8FAFC', borderRadius: 999, fontSize: 12 }}>
                  <span style={{ color: '#8A8FA8', fontWeight: 700 }}>{lbl}</span>{' '}<strong style={{ fontFamily: 'monospace', color: col }}>KES {kes(val)}</strong>
                </span>
              ))}
            </div>
            <table style={tableStyle}>
              <thead><tr>
                <th style={thStyle}>Type</th><th style={thStyle}>Student</th><th style={thStyle}>Sponsor</th>
                <th style={thStyle}>Detail / Reason</th><th style={thStyle}>Term</th><th style={thNum}>Amount</th>
              </tr></thead>
              <tbody>
                {concessions.rows.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #F0F2F5' }}>
                    <td style={tdStyle}><span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 10.5, fontWeight: 800, background: r.type === 'Bursary' ? '#E8F5EE' : r.type === 'Waiver' ? '#F3EAF8' : '#EAF2FA', color: r.type === 'Bursary' ? '#1B6B3A' : r.type === 'Waiver' ? '#6C3483' : '#1A5F9C' }}>{r.type}</span></td>
                    <td style={{ ...tdStyle, fontWeight: 700 }}>{sName(r.student)}</td>
                    <td style={tdStyle}>{r.source}</td>
                    <td style={{ ...tdStyle, color: '#8A8FA8' }}>{r.detail || '—'}</td>
                    <td style={tdStyle}>{r.term ? `T${r.term}` : 'All'}</td>
                    <td style={{ ...tdNum, fontWeight: 700, color: '#6C3483' }}>{kes(r.amount)}</td>
                  </tr>
                ))}
                {concessions.rows.length === 0 && <tr><td colSpan="6" style={{ ...tdStyle, textAlign: 'center', color: '#8A8FA8' }}>No concessions recorded for {year}.</td></tr>}
              </tbody>
            </table>
            {concessions.sponsorRows.length > 0 && (
              <>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#8A8FA8', textTransform: 'uppercase', margin: '20px 0 8px' }}>Bursary utilization by sponsor</div>
                <table style={tableStyle}>
                  <thead><tr><th style={thStyle}>Sponsor</th><th style={thNum}>Awards</th><th style={thNum}>Total</th></tr></thead>
                  <tbody>
                    {concessions.sponsorRows.map(s => (
                      <tr key={s.name} style={{ borderBottom: '1px solid #F0F2F5' }}>
                        <td style={{ ...tdStyle, fontWeight: 700 }}>{s.name}</td>
                        <td style={tdNum}>{s.count}</td>
                        <td style={{ ...tdNum, fontWeight: 700, color: '#1B6B3A' }}>{kes(s.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        ) : (
          <div style={{ padding: 18 }}>
            <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center' }}>
              {termSel}
              {filterTerm !== 'all' && <span style={{ fontSize: 12.5, color: '#8A8FA8' }}>Showing Term {filterTerm} invoice lines only</span>}
            </div>
            <table style={tableStyle}>
              <thead><tr>
                <th style={thStyle}>Votehead</th><th style={thNum}>Expected</th><th style={thNum}>Cash Collected</th>
                <th style={thNum}>Concessions</th><th style={thNum}>Outstanding</th><th style={thNum}>Rate</th>
              </tr></thead>
              <tbody>
                {voteheadReport.map(r => {
                  const rate = r.expected > 0 ? Math.round(((r.cash + r.concession) / r.expected) * 100) : 0;
                  return (
                    <tr key={r.label} style={{ borderBottom: '1px solid #F0F2F5' }}>
                      <td style={{ ...tdStyle, fontWeight: 700 }}>{r.label}</td>
                      <td style={tdNum}>{kes(r.expected)}</td>
                      <td style={{ ...tdNum, color: '#1B6B3A' }}>{kes(r.cash)}</td>
                      <td style={{ ...tdNum, color: '#6C3483' }}>{kes(r.concession)}</td>
                      <td style={{ ...tdNum, color: '#C0392B' }}>{kes(r.outstanding)}</td>
                      <td style={tdNum}>{r.expected > 0 ? `${rate}%` : '—'}</td>
                    </tr>
                  );
                })}
                {voteheadReport.length === 0 && <tr><td colSpan="6" style={{ ...tdStyle, textAlign: 'center', color: '#8A8FA8' }}>No invoice lines for {year} yet.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

const btnStyle = (bg) => ({ padding: '8px 14px', background: bg, border: 'none', borderRadius: 8, fontSize: 12.5, color: '#fff', fontWeight: 700, cursor: 'pointer' });
const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const thStyle = { padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#8A8FA8', fontSize: 10.5, textTransform: 'uppercase', borderBottom: '2px solid #E8EAF0' };
const thNum = { ...thStyle, textAlign: 'right' };
const tdStyle = { padding: '10px 12px', color: '#2a2421' };
const tdNum = { ...tdStyle, textAlign: 'right', fontFamily: 'monospace' };
const filterSel = { padding: '8px 12px', borderRadius: 8, border: '1px solid #E8EAF0', fontSize: 13, background: '#fff' };

export default FinanceReports;

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';

const GRADE_LABEL = {
  pp1: 'PP1', pp2: 'PP2',
  g1: 'Grade 1', g2: 'Grade 2', g3: 'Grade 3', g4: 'Grade 4', g5: 'Grade 5', g6: 'Grade 6',
  g7: 'Grade 7', g8: 'Grade 8', g9: 'Grade 9', g10: 'Grade 10', g11: 'Grade 11', g12: 'Grade 12',
};
const GRADE_ORDER = Object.keys(GRADE_LABEL);

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
    <p class="sub">${title} · generated ${new Date().toLocaleString()} · EduConnect KE</p>
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

  // Report-local filters
  const [arrearsGrade, setArrearsGrade] = useState('all');
  const [arrearsMin, setArrearsMin] = useState('');
  const [dailyFrom, setDailyFrom] = useState(todayISO());
  const [dailyTo, setDailyTo] = useState(todayISO());

  useEffect(() => {
    if (!schoolConfig?.id) return;
    const load = async () => {
      setIsLoading(true);
      try {
        const [studs, inv, its, alloc, pays, vhs, stf] = await Promise.all([
          supabase.from('students').select('id, adm_no, first_name, last_name, level_id, stream_id, streams(name)')
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
            .select('id, student_id, amount, method, reference, paid_at, status, recorded_by, fee_receipts(receipt_no, is_void)')
            .eq('school_id', schoolConfig.id).eq('year', year)
            .order('paid_at', { ascending: false }),
          supabase.from('voteheads').select('id, code, description')
            .eq('school_id', schoolConfig.id),
          supabase.from('staff').select('auth_user_id, full_name')
            .eq('school_id', schoolConfig.id).not('auth_user_id', 'is', null),
        ]);
        setStudents(studs.data || []);
        setInvoices((inv.data || []).filter(i => i.status !== 'cancelled'));
        setItems((its.data || []).filter(i => i.fee_invoices?.status !== 'cancelled'));
        setAllocations(alloc.data || []);
        setPayments(pays.data || []);
        setVoteheads(vhs.data || []);
        setStaffList(stf.data || []);
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

  // --- 2. Arrears ----------------------------------------------------
  const arrears = useMemo(() => {
    const expected = {}, settled = {};
    invoices.forEach(i => { expected[i.student_id] = (expected[i.student_id] || 0) + Number(i.total); });
    activeAllocs.forEach(a => {
      const inv = invById[a.invoice_id];
      if (!inv) return;
      settled[inv.student_id] = (settled[inv.student_id] || 0) + Number(a.amount);
    });
    const min = parseFloat(arrearsMin) || 0.005;
    return Object.entries(expected)
      .map(([sid, exp]) => {
        const s = studentById[sid];
        return { student: s, expected: exp, settled: settled[sid] || 0, outstanding: exp - (settled[sid] || 0) };
      })
      .filter(r => r.outstanding >= min)
      .filter(r => arrearsGrade === 'all' || r.student?.level_id === arrearsGrade)
      .sort((a, b) => b.outstanding - a.outstanding);
  }, [invoices, activeAllocs, invById, studentById, arrearsGrade, arrearsMin]);

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

  // --- 4. Votehead collections ----------------------------------------
  const voteheadReport = useMemo(() => {
    const vh = {};
    const itemVotehead = Object.fromEntries(items.map(i => [i.id, i.votehead_id]));
    items.forEach(i => {
      const k = i.votehead_id || 'custom';
      (vh[k] = vh[k] || { expected: 0, cash: 0, concession: 0 }).expected += Number(i.amount);
    });
    activeAllocs.forEach(a => {
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
  }, [items, activeAllocs, voteheads]);

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
      title = `Arrears Report — ${year}`;
      headers = ['Adm No', 'Student', 'Grade', 'Stream', 'Invoiced (KES)', 'Settled', 'Outstanding'];
      rows = arrears.map(r => [
        r.student?.adm_no || '', sName(r.student), GRADE_LABEL[r.student?.level_id] || '',
        r.student?.streams?.name || '', kes(r.expected), kes(r.settled), kes(r.outstanding),
      ]);
    } else if (report === 'daily') {
      title = `Daily Collections ${dailyFrom}${dailyTo !== dailyFrom ? ` to ${dailyTo}` : ''}`;
      headers = ['Date', 'Receipt', 'Student', 'Amount (KES)', 'Method', 'Reference', 'Recorded By', 'Status'];
      rows = daily.rows.map(p => [
        new Date(p.paid_at).toLocaleString(), p.fee_receipts?.receipt_no || '', sName(studentById[p.student_id]),
        kes(p.amount), (p.method || '').toUpperCase(), p.reference || '',
        staffByAuth[p.recorded_by] || 'Admin', p.status === 'voided' ? 'VOID' : 'OK',
      ]);
    } else {
      title = `Votehead Collections — ${year}`;
      headers = ['Votehead', 'Expected (KES)', 'Cash Collected', 'Concessions', 'Outstanding'];
      rows = voteheadReport.map(r => [r.label, kes(r.expected), kes(r.cash), kes(r.concession), kes(r.outstanding)]);
    }
    if (mode === 'csv') downloadCsv(`${title.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}.csv`, headers, rows);
    else printTable(schoolConfig?.schoolName, title, headers, rows);
  };

  const reportTabs = [
    { id: 'summary', label: '📊 Collection Summary' },
    { id: 'arrears', label: '⏳ Arrears' },
    { id: 'daily', label: '📅 Daily Collections' },
    { id: 'voteheads', label: '🧮 Votehead Collections' },
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
              <select value={arrearsGrade} onChange={(e) => setArrearsGrade(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #E8EAF0', fontSize: 13, background: '#fff' }}>
                <option value="all">All grades</option>
                {GRADE_ORDER.map(g => <option key={g} value={g}>{GRADE_LABEL[g]}</option>)}
              </select>
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
                      <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 11.5, color: '#1A5F9C' }}>{p.fee_receipts?.receipt_no || '—'}</td>
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
        ) : (
          <div style={{ padding: 18 }}>
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

export default FinanceReports;

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

// Payroll (Final Accounts Phase D1) — admin + bursar only (RLS enforces the same).
//   · Employees: pay profiles on top of the existing staff list (basic +
//     allowances, KRA/NSSF/SHIF numbers, payout details)
//   · Run Payroll: generate a month's draft (statutory maths runs in Postgres
//     from the effective-dated rates table), review, approve.
//   Approval freezes the figures and posts the payroll journal to the GL.
//   Payslip prints, statutory remittances and P9s arrive in Phase D2.

const fmt = (n) => Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const STATUS_META = {
  draft:    { label: 'DRAFT',    color: '#8A8FA8', bg: '#F1F0F5' },
  approved: { label: 'APPROVED', color: '#1A5F9C', bg: '#F4F9FE' },
  paid:     { label: 'PAID',     color: '#1B6B3A', bg: '#E8F5EE' },
};

function openPrintDoc(title, bodyHtml) {
  const w = window.open('', '_blank');
  if (!w) { alert('Allow pop-ups to print.'); return; }
  w.document.write(`<!doctype html><html><head><title>${title}</title><style>
    body { font-family: Arial, sans-serif; font-size: 12.5px; color: #111; margin: 32px; }
    h2 { margin: 0; } .sub { color: #555; margin: 2px 0 18px; font-size: 11px; }
    .tag { float: right; text-align: right; font-family: 'Courier New', monospace; font-weight: bold; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0 16px; }
    th, td { border: 1px solid #bbb; padding: 5px 8px; text-align: left; }
    th { background: #f0f0f0; font-size: 10.5px; text-transform: uppercase; }
    .num { text-align: right; font-family: 'Courier New', monospace; }
    .meta td { border: none; padding: 3px 0; }
    .meta .k { color: #555; width: 140px; }
    .conf { color: #C0392B; font-size: 10px; font-weight: bold; letter-spacing: 0.08em; }
    @media print { .noprint { display: none; } }
  </style></head><body>${bodyHtml}
    <div class="noprint" style="margin-top:24px;text-align:center;">
      <button onclick="window.print()" style="padding:8px 22px;">Print</button>
    </div>
  </body></html>`);
  w.document.close();
  w.focus();
}

function printPayslip(schoolConfig, run, slip, lines) {
  const monthLabel = `${MONTHS[run.month - 1]} ${run.year}`;
  const section = (kind, title) => {
    const rows = lines.filter(l => l.kind === kind);
    if (!rows.length) return '';
    return `<tr><td colspan="2" style="background:#f7f7f7;font-weight:bold;font-size:10.5px;text-transform:uppercase">${title}</td></tr>`
      + rows.map(l => `<tr><td>${l.label}</td><td class="num">${fmt(l.amount)}</td></tr>`).join('');
  };
  openPrintDoc(`Payslip ${slip.staff_name} ${monthLabel}`, `
    <div class="tag">PAYSLIP<br/>${monthLabel}<br/><span class="conf">CONFIDENTIAL</span></div>
    <h2>${schoolConfig?.school_name || 'School'}</h2>
    <p class="sub">Generated ${new Date().toLocaleString()} · LogiQ-Taaluma</p>
    <table class="meta">
      <tr><td class="k">Employee</td><td><strong>${slip.staff_name}</strong></td></tr>
      <tr><td class="k">KRA PIN</td><td>${slip.kra_pin || '—'}</td></tr>
      <tr><td class="k">Period</td><td>${monthLabel}</td></tr>
    </table>
    <table>
      ${section('earning', 'Earnings')}
      <tr><td style="font-weight:bold">Gross pay</td><td class="num" style="font-weight:bold">${fmt(slip.gross_pay)}</td></tr>
      ${section('deduction', 'Deductions')}
      <tr><td style="font-weight:bold">Total deductions</td><td class="num" style="font-weight:bold">${fmt(Number(slip.gross_pay) - Number(slip.net_pay))}</td></tr>
      <tr><td style="font-weight:bold;font-size:14px">NET PAY</td><td class="num" style="font-weight:bold;font-size:14px">KES ${fmt(slip.net_pay)}</td></tr>
      ${section('employer', 'Employer contributions (not deducted from pay)')}
    </table>`);
}

function printMusterRoll(schoolConfig, run, slips) {
  const monthLabel = `${MONTHS[run.month - 1]} ${run.year}`;
  const t = slips.reduce((a, p) => ({
    gross: a.gross + Number(p.gross_pay), nssf: a.nssf + Number(p.nssf_employee),
    shif: a.shif + Number(p.shif), hl: a.hl + Number(p.housing_levy_employee),
    paye: a.paye + Number(p.paye), net: a.net + Number(p.net_pay),
  }), { gross: 0, nssf: 0, shif: 0, hl: 0, paye: 0, net: 0 });
  const rows = slips.map((p, i) =>
    `<tr><td>${i + 1}</td><td>${p.staff_name}</td><td>${p.kra_pin || ''}</td>
     <td class="num">${fmt(p.gross_pay)}</td><td class="num">${fmt(p.nssf_employee)}</td>
     <td class="num">${fmt(p.shif)}</td><td class="num">${fmt(p.housing_levy_employee)}</td>
     <td class="num">${fmt(p.paye)}</td><td class="num">${fmt(p.net_pay)}</td><td></td></tr>`).join('');
  openPrintDoc(`Payroll register ${monthLabel}`, `
    <div class="tag">PAYROLL REGISTER<br/>${monthLabel}<br/><span class="conf">CONFIDENTIAL</span></div>
    <h2>${schoolConfig?.school_name || 'School'}</h2>
    <p class="sub">Muster roll · ${slips.length} employees · generated ${new Date().toLocaleString()} · LogiQ-Taaluma</p>
    <table>
      <thead><tr><th>#</th><th>Employee</th><th>KRA PIN</th><th style="text-align:right">Gross</th>
      <th style="text-align:right">NSSF</th><th style="text-align:right">SHIF</th><th style="text-align:right">Levy</th>
      <th style="text-align:right">PAYE</th><th style="text-align:right">Net pay</th><th>Sign</th></tr></thead>
      <tbody>${rows}
      <tr><td colspan="3" style="font-weight:bold">TOTALS</td>
      <td class="num" style="font-weight:bold">${fmt(t.gross)}</td><td class="num" style="font-weight:bold">${fmt(t.nssf)}</td>
      <td class="num" style="font-weight:bold">${fmt(t.shif)}</td><td class="num" style="font-weight:bold">${fmt(t.hl)}</td>
      <td class="num" style="font-weight:bold">${fmt(t.paye)}</td><td class="num" style="font-weight:bold">${fmt(t.net)}</td><td></td></tr>
      </tbody></table>
    <div style="display:flex;gap:30px;margin-top:40px;">
      <div style="flex:1;border-top:1px solid #333;padding-top:5px;font-size:11px;">Prepared by (name, sign, date)</div>
      <div style="flex:1;border-top:1px solid #333;padding-top:5px;font-size:11px;">Approved by (name, sign, date)</div>
    </div>`);
}

function printP9(schoolConfig, p9) {
  const t = (p9.months || []).reduce((a, m) => ({
    gross: a.gross + Number(m.gross), pension: a.pension + Number(m.pension),
    taxable: a.taxable + Number(m.taxable), charged: a.charged + Number(m.tax_charged),
    relief: a.relief + Number(m.relief), paye: a.paye + Number(m.paye),
  }), { gross: 0, pension: 0, taxable: 0, charged: 0, relief: 0, paye: 0 });
  const rows = (p9.months || []).map(m =>
    `<tr><td>${MONTHS[m.month - 1]}</td><td class="num">${fmt(m.basic)}</td><td class="num">${fmt(m.benefits)}</td>
     <td class="num">${fmt(m.gross)}</td><td class="num">${fmt(m.pension)}</td><td class="num">${fmt(m.taxable)}</td>
     <td class="num">${fmt(m.tax_charged)}</td><td class="num">${fmt(m.relief)}</td><td class="num">${fmt(m.paye)}</td></tr>`).join('');
  openPrintDoc(`P9 ${p9.staff_name} ${p9.year}`, `
    <div class="tag">TAX DEDUCTION CARD (P9)<br/>YEAR ${p9.year}</div>
    <h2>${schoolConfig?.school_name || 'School'}</h2>
    <p class="sub">Employer's certificate of pay and tax · generated ${new Date().toLocaleString()} · LogiQ-Taaluma</p>
    <table class="meta">
      <tr><td class="k">Employee</td><td><strong>${p9.staff_name}</strong></td></tr>
      <tr><td class="k">Employee KRA PIN</td><td>${p9.kra_pin || '—'}</td></tr>
    </table>
    <table>
      <thead><tr><th>Month</th><th style="text-align:right">Basic</th><th style="text-align:right">Benefits</th>
      <th style="text-align:right">Gross</th><th style="text-align:right">Pension (NSSF)</th>
      <th style="text-align:right">Taxable pay</th><th style="text-align:right">Tax charged</th>
      <th style="text-align:right">Relief</th><th style="text-align:right">PAYE deducted</th></tr></thead>
      <tbody>${rows}
      <tr><td style="font-weight:bold">TOTALS</td><td></td><td></td>
      <td class="num" style="font-weight:bold">${fmt(t.gross)}</td><td class="num" style="font-weight:bold">${fmt(t.pension)}</td>
      <td class="num" style="font-weight:bold">${fmt(t.taxable)}</td><td class="num" style="font-weight:bold">${fmt(t.charged)}</td>
      <td class="num" style="font-weight:bold">${fmt(t.relief)}</td><td class="num" style="font-weight:bold">${fmt(t.paye)}</td></tr>
      </tbody></table>
    <p style="font-size:10.5px;color:#555">To be given to the employee for their annual ITR filing. Figures are drawn from approved payroll runs only.</p>`);
}

const emptyProfile = {
  basic_salary: '', house_allowance: '', transport_allowance: '', other_allowances: '',
  kra_pin: '', nssf_no: '', shif_no: '', bank_name: '', bank_account_no: '', mpesa_no: '',
  pay_grade: '', is_active: true,
};

const Payroll = ({ schoolConfig }) => {
  const now = new Date();
  const [tab, setTab] = useState('employees');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const [staffList, setStaffList] = useState([]);
  const [profiles, setProfiles] = useState({});      // staff_id → profile
  const [profForm, setProfForm] = useState(null);    // {staff, ...profile fields}

  const [runs, setRuns] = useState([]);
  const [runYear, setRunYear] = useState(now.getFullYear());
  const [runMonth, setRunMonth] = useState(now.getMonth() + 1);
  const [activeRun, setActiveRun] = useState(null);  // payroll_runs row
  const [slips, setSlips] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [payAccount, setPayAccount] = useState('');

  // Statutory remittances
  const [statYear, setStatYear] = useState(now.getFullYear());
  const [statMonth, setStatMonth] = useState(now.getMonth() + 1);
  const [statSummary, setStatSummary] = useState(null);
  const [statPayments, setStatPayments] = useState([]);
  const [statForm, setStatForm] = useState(null);    // {kind, label, amount, ...}

  // P9
  const [p9StaffId, setP9StaffId] = useState('');
  const [p9Year, setP9Year] = useState(now.getFullYear());
  const [p9Data, setP9Data] = useState(null);

  const load = useCallback(async () => {
    if (!schoolConfig?.id) return;
    setErr('');
    const [stf, prof, rns, banks, stat] = await Promise.all([
      supabase.from('staff').select('id, full_name, app_role')
        .eq('school_id', schoolConfig.id).order('full_name'),
      supabase.from('staff_payroll_profiles').select('*').eq('school_id', schoolConfig.id),
      supabase.from('payroll_runs').select('*').eq('school_id', schoolConfig.id)
        .order('year', { ascending: false }).order('month', { ascending: false }).limit(36),
      supabase.from('bank_accounts').select('id, name, kind')
        .eq('school_id', schoolConfig.id).eq('is_active', true),
      supabase.from('statutory_payments').select('*, bank_accounts(name)')
        .eq('school_id', schoolConfig.id).order('paid_at', { ascending: false }).limit(100),
    ]);
    if (stf.error) { setErr(stf.error.message); return; }
    if (prof.error) { setErr(prof.error.message); return; }   // RLS: not payroll staff
    setStaffList(stf.data || []);
    const map = {};
    (prof.data || []).forEach(p => { map[p.staff_id] = p; });
    setProfiles(map);
    setRuns(rns.data || []);
    setBankAccounts(banks.data || []);
    if (!payAccount && banks.data?.length) {
      setPayAccount((banks.data.find(b => b.kind === 'bank') || banks.data[0]).id);
    }
    setStatPayments(stat.data || []);
  }, [schoolConfig?.id, payAccount]);

  useEffect(() => { load(); }, [load]);

  const loadSlips = useCallback(async (run) => {
    setActiveRun(run);
    if (!run) { setSlips([]); return; }
    const { data, error } = await supabase.from('payslips')
      .select('*').eq('run_id', run.id).order('staff_name');
    if (error) { setErr(error.message); return; }
    setSlips(data || []);
  }, []);

  // ---------------- Employees ----------------

  const openProfile = (s) => {
    const p = profiles[s.id] || {};
    setProfForm({
      staff: s,
      ...emptyProfile,
      ...Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v === null ? '' : v])),
    });
    setErr('');
  };

  const saveProfile = async () => {
    const f = profForm;
    setBusy(true);
    setErr('');
    const row = {
      school_id: schoolConfig.id,
      staff_id: f.staff.id,
      basic_salary: parseFloat(f.basic_salary) || 0,
      house_allowance: parseFloat(f.house_allowance) || 0,
      transport_allowance: parseFloat(f.transport_allowance) || 0,
      other_allowances: parseFloat(f.other_allowances) || 0,
      kra_pin: f.kra_pin || null,
      nssf_no: f.nssf_no || null,
      shif_no: f.shif_no || null,
      bank_name: f.bank_name || null,
      bank_account_no: f.bank_account_no || null,
      mpesa_no: f.mpesa_no || null,
      pay_grade: f.pay_grade || null,
      is_active: !!f.is_active,
    };
    const { error } = await supabase.from('staff_payroll_profiles')
      .upsert(row, { onConflict: 'staff_id' });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setProfForm(null);
    load();
  };

  // ---------------- Run payroll ----------------

  const generateRun = async () => {
    setBusy(true);
    setErr('');
    const { data, error } = await supabase.rpc('generate_payroll_run', {
      p_school_id: schoolConfig.id, p_year: runYear, p_month: runMonth,
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    await load();
    const { data: run } = await supabase.from('payroll_runs')
      .select('*').eq('id', data.run_id).single();
    loadSlips(run);
    setErr(data.payslips === 0 ? 'Run created but no payslips — no active pay profiles with amounts. Set them up under Employees.' : '');
  };

  const approveRun = async () => {
    const totalNet = slips.reduce((s, p) => s + Number(p.net_pay), 0);
    if (!window.confirm(`Approve payroll for ${MONTHS[activeRun.month - 1]} ${activeRun.year}?\n\n${slips.length} employees · net pay KES ${fmt(totalNet)}.\n\nFigures freeze and the salaries journal posts to the ledger. This cannot be undone.`)) return;
    setBusy(true);
    setErr('');
    const { error } = await supabase.rpc('approve_payroll_run', { p_school_id: schoolConfig.id, p_run_id: activeRun.id });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    await load();
    const { data: run } = await supabase.from('payroll_runs').select('*').eq('id', activeRun.id).single();
    loadSlips(run);
  };

  const deleteRun = async () => {
    if (!window.confirm(`Discard this draft run for ${MONTHS[activeRun.month - 1]} ${activeRun.year}?`)) return;
    setBusy(true);
    const { error } = await supabase.rpc('delete_payroll_run', { p_school_id: schoolConfig.id, p_run_id: activeRun.id });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    loadSlips(null);
    load();
  };

  const markPaid = async () => {
    const accName = bankAccounts.find(a => a.id === payAccount)?.name || '';
    const totalNet = slips.reduce((s, p) => s + Number(p.net_pay), 0);
    if (!window.confirm(`Mark ${MONTHS[activeRun.month - 1]} ${activeRun.year} salaries as PAID from ${accName}?\n\nKES ${fmt(totalNet)} posts out of that account. This cannot be undone.`)) return;
    setBusy(true);
    setErr('');
    const { error } = await supabase.rpc('pay_payroll_run', {
      p_school_id: schoolConfig.id, p_run_id: activeRun.id, p_bank_account_id: payAccount,
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    await load();
    const { data: run } = await supabase.from('payroll_runs').select('*').eq('id', activeRun.id).single();
    loadSlips(run);
  };

  const printSlip = async (slip) => {
    const { data } = await supabase.from('payslip_lines')
      .select('kind, label, amount, sort_order').eq('payslip_id', slip.id).order('sort_order');
    printPayslip(schoolConfig, activeRun, slip, data || []);
  };

  // ---------------- Statutory ----------------

  const loadStatutory = useCallback(async () => {
    if (!schoolConfig?.id) return;
    const { data, error } = await supabase.rpc('get_statutory_summary', {
      p_school_id: schoolConfig.id, p_year: statYear, p_month: statMonth,
    });
    if (error) { setErr(error.message); return; }
    setStatSummary(Array.isArray(data) ? data : []);
  }, [schoolConfig?.id, statYear, statMonth]);

  useEffect(() => { if (tab === 'statutory') loadStatutory(); }, [tab, loadStatutory]);

  const recordStatutory = async () => {
    const f = statForm;
    if (!(parseFloat(f.amount) > 0)) { setErr('Enter an amount greater than zero.'); return; }
    setBusy(true);
    setErr('');
    const { error } = await supabase.rpc('pay_statutory', {
      p_school_id: schoolConfig.id, p_kind: f.kind,
      p_bank_account_id: f.bank_account_id, p_amount: parseFloat(f.amount),
      p_paid_at: f.paid_at || null,
      p_period_year: statYear, p_period_month: statMonth,
      p_reference: f.reference || null, p_memo: null,
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setStatForm(null);
    load();
    loadStatutory();
  };

  const voidStatutory = async (sp) => {
    const reason = window.prompt(`Void this ${sp.kind.replace('_', ' ')} remittance of KES ${fmt(sp.amount)}? Give a reason:`);
    if (reason === null) return;
    if (!reason.trim()) { setErr('A reason is required.'); return; }
    setBusy(true);
    const { error } = await supabase.rpc('void_statutory_payment', { p_school_id: schoolConfig.id, p_id: sp.id, p_reason: reason.trim() });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    load();
    loadStatutory();
  };

  // ---------------- P9 ----------------

  const runP9 = async () => {
    if (!p9StaffId) { setErr('Pick an employee.'); return; }
    setErr('');
    const { data, error } = await supabase.rpc('get_p9', {
      p_school_id: schoolConfig.id, p_staff_id: p9StaffId, p_year: p9Year,
    });
    if (error) { setErr(error.message); return; }
    setP9Data(data);
  };

  // ---------------- Rendering ----------------

  const card = { background: '#fff', border: '1px solid #E8EAF0', borderRadius: 12, padding: 20, marginBottom: 16 };
  const lbl = { display: 'block', fontSize: 10, fontWeight: 800, color: '#8a8fa8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' };
  const input = { padding: '8px 10px', borderRadius: 8, border: '1px solid #e6dfd8', fontSize: 13, color: '#2a2421', background: '#fff', boxSizing: 'border-box', width: '100%' };
  const btn = (bg, color, disabled) => ({ padding: '9px 16px', background: disabled ? '#8a8fa8' : bg, border: 'none', borderRadius: 8, fontSize: 13, color, fontWeight: 700, cursor: disabled ? 'default' : 'pointer' });
  const smallBtn = (bg, color) => ({ padding: '5px 10px', background: bg, border: 'none', borderRadius: 6, fontSize: 11.5, color, fontWeight: 700, cursor: busy ? 'default' : 'pointer' });
  const th = { padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 800, color: '#8a8fa8', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #E8EAF0', whiteSpace: 'nowrap' };
  const td = { padding: '8px 10px', borderTop: '1px solid #F1F0F5', fontSize: 12.5, color: '#2a2421' };
  const tdNum = { ...td, textAlign: 'right', fontFamily: 'monospace', whiteSpace: 'nowrap' };
  const badge = (s) => {
    const m = STATUS_META[s] || STATUS_META.draft;
    return <span style={{ fontSize: 9.5, fontWeight: 800, color: m.color, background: m.bg, padding: '2px 8px', borderRadius: 999 }}>{m.label}</span>;
  };

  const grossOf = (p) => (parseFloat(p.basic_salary) || 0) + (parseFloat(p.house_allowance) || 0)
    + (parseFloat(p.transport_allowance) || 0) + (parseFloat(p.other_allowances) || 0);

  const totals = slips.reduce((t, p) => ({
    gross: t.gross + Number(p.gross_pay), nssf: t.nssf + Number(p.nssf_employee),
    shif: t.shif + Number(p.shif), hl: t.hl + Number(p.housing_levy_employee),
    paye: t.paye + Number(p.paye), net: t.net + Number(p.net_pay),
    er: t.er + Number(p.nssf_employer) + Number(p.housing_levy_employer),
  }), { gross: 0, nssf: 0, shif: 0, hl: 0, paye: 0, net: 0, er: 0 });

  return (
    <div style={{ paddingBottom: 40, maxWidth: 1150 }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#2a2421' }}>Payroll</h2>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: '#8A8FA8' }}>
          Confidential — visible to the school admin and bursar only. Statutory rates (PAYE, NSSF, SHIF, Housing Levy) are computed automatically.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid #E8EAF0' }}>
        {[['employees', 'Employees'], ['run', 'Run Payroll'], ['statutory', 'Statutory'], ['p9', 'P9 Cards']].map(([id, label]) => (
          <button key={id} onClick={() => { setTab(id); setErr(''); }}
            style={{ padding: '8px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: tab === id ? '#1A5F9C' : '#8A8FA8', borderBottom: tab === id ? '2px solid #1A5F9C' : '2px solid transparent', marginBottom: -1 }}>
            {label}
          </button>
        ))}
      </div>

      {err && (
        <div style={{ ...card, background: '#FCEEEC', border: '1px solid #F3C9C3', color: '#C0392B', fontSize: 12.5, fontWeight: 600 }}>{err}</div>
      )}

      {/* ================= EMPLOYEES ================= */}
      {tab === 'employees' && (
        <>
          {profForm && (
            <div style={card}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#2a2421', marginBottom: 14 }}>
                Pay profile — {profForm.staff.full_name}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
                <div><label style={lbl}>Basic salary (KES/mo)</label><input style={{ ...input, fontFamily: 'monospace', textAlign: 'right' }} type="number" min="0" value={profForm.basic_salary} onChange={e => setProfForm({ ...profForm, basic_salary: e.target.value })} /></div>
                <div><label style={lbl}>House allowance</label><input style={{ ...input, fontFamily: 'monospace', textAlign: 'right' }} type="number" min="0" value={profForm.house_allowance} onChange={e => setProfForm({ ...profForm, house_allowance: e.target.value })} /></div>
                <div><label style={lbl}>Transport allowance</label><input style={{ ...input, fontFamily: 'monospace', textAlign: 'right' }} type="number" min="0" value={profForm.transport_allowance} onChange={e => setProfForm({ ...profForm, transport_allowance: e.target.value })} /></div>
                <div><label style={lbl}>Other allowances</label><input style={{ ...input, fontFamily: 'monospace', textAlign: 'right' }} type="number" min="0" value={profForm.other_allowances} onChange={e => setProfForm({ ...profForm, other_allowances: e.target.value })} /></div>
                <div><label style={lbl}>KRA PIN</label><input style={input} value={profForm.kra_pin} onChange={e => setProfForm({ ...profForm, kra_pin: e.target.value })} /></div>
                <div><label style={lbl}>NSSF no</label><input style={input} value={profForm.nssf_no} onChange={e => setProfForm({ ...profForm, nssf_no: e.target.value })} /></div>
                <div><label style={lbl}>SHIF no</label><input style={input} value={profForm.shif_no} onChange={e => setProfForm({ ...profForm, shif_no: e.target.value })} /></div>
                <div><label style={lbl}>Pay grade</label><input style={input} value={profForm.pay_grade} onChange={e => setProfForm({ ...profForm, pay_grade: e.target.value })} /></div>
                <div><label style={lbl}>Bank</label><input style={input} value={profForm.bank_name} onChange={e => setProfForm({ ...profForm, bank_name: e.target.value })} /></div>
                <div><label style={lbl}>Bank account no</label><input style={input} value={profForm.bank_account_no} onChange={e => setProfForm({ ...profForm, bank_account_no: e.target.value })} /></div>
                <div><label style={lbl}>M-PESA no</label><input style={input} value={profForm.mpesa_no} onChange={e => setProfForm({ ...profForm, mpesa_no: e.target.value })} /></div>
                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <label style={{ fontSize: 12.5, color: '#4A4A6A', cursor: 'pointer', fontWeight: 600 }}>
                    <input type="checkbox" checked={!!profForm.is_active} onChange={e => setProfForm({ ...profForm, is_active: e.target.checked })} style={{ marginRight: 6 }} />
                    On payroll
                  </label>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <button onClick={saveProfile} disabled={busy} style={btn('#1A5F9C', '#fff', busy)}>{busy ? 'Saving…' : 'Save profile'}</button>
                <button onClick={() => setProfForm(null)} disabled={busy} style={btn('#F1F0F5', '#4A4A6A', busy)}>Cancel</button>
              </div>
            </div>
          )}

          <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr style={{ background: '#F8FAFC' }}>
                  <th style={th}>Staff member</th><th style={th}>Role</th>
                  <th style={{ ...th, textAlign: 'right' }}>Basic</th>
                  <th style={{ ...th, textAlign: 'right' }}>Allowances</th>
                  <th style={{ ...th, textAlign: 'right' }}>Gross (KES/mo)</th>
                  <th style={th}>KRA PIN</th><th style={th}>Status</th><th style={th}></th>
                </tr></thead>
                <tbody>
                  {staffList.map(s => {
                    const p = profiles[s.id];
                    const allow = p ? (Number(p.house_allowance) + Number(p.transport_allowance) + Number(p.other_allowances)) : 0;
                    return (
                      <tr key={s.id} style={{ opacity: p && !p.is_active ? 0.5 : 1 }}>
                        <td style={{ ...td, fontWeight: 700 }}>{s.full_name}</td>
                        <td style={td}>{s.app_role || 'teacher'}</td>
                        <td style={tdNum}>{p ? fmt(p.basic_salary) : '—'}</td>
                        <td style={tdNum}>{p ? fmt(allow) : '—'}</td>
                        <td style={{ ...tdNum, fontWeight: 700 }}>{p ? fmt(grossOf(p)) : '—'}</td>
                        <td style={td}>{p?.kra_pin || '—'}</td>
                        <td style={td}>{p ? (p.is_active ? <span style={{ color: '#1B6B3A', fontWeight: 700, fontSize: 11.5 }}>On payroll</span> : <span style={{ color: '#8A8FA8', fontSize: 11.5 }}>Off payroll</span>) : <span style={{ color: '#B4690E', fontSize: 11.5 }}>No profile</span>}</td>
                        <td style={{ ...td, textAlign: 'right' }}>
                          <button onClick={() => openProfile(s)} disabled={busy} style={smallBtn('#F4F9FE', '#1A5F9C')}>{p ? 'Edit' : 'Set up'}</button>
                        </td>
                      </tr>
                    );
                  })}
                  {!staffList.length && <tr><td colSpan={8} style={{ ...td, textAlign: 'center', color: '#8A8FA8', padding: 20 }}>No staff records yet — add staff under People first.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ================= RUN PAYROLL ================= */}
      {tab === 'run' && (
        <>
          <div style={{ ...card, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <label style={lbl}>Month</label>
              <select style={{ ...input, width: 150, cursor: 'pointer' }} value={runMonth} onChange={e => setRunMonth(parseInt(e.target.value))}>
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Year</label>
              <select style={{ ...input, width: 110, cursor: 'pointer' }} value={runYear} onChange={e => setRunYear(parseInt(e.target.value))}>
                {[runYear - 1, runYear, runYear + 1].filter((v, i, a) => a.indexOf(v) === i).map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <button onClick={generateRun} disabled={busy} style={btn('#1A5F9C', '#fff', busy)}>
              {busy ? 'Working…' : 'Generate / recompute draft'}
            </button>
            <div style={{ flex: 1 }} />
            {runs.length > 0 && (
              <div>
                <label style={lbl}>Open a run</label>
                <select style={{ ...input, width: 210, cursor: 'pointer' }} value={activeRun?.id || ''}
                  onChange={e => loadSlips(runs.find(r => r.id === e.target.value) || null)}>
                  <option value="">Select…</option>
                  {runs.map(r => <option key={r.id} value={r.id}>{MONTHS[r.month - 1]} {r.year} — {r.status}</option>)}
                </select>
              </div>
            )}
          </div>

          {activeRun && (
            <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #E8EAF0', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: '#2a2421' }}>
                  {MONTHS[activeRun.month - 1]} {activeRun.year}
                </span>
                {badge(activeRun.status)}
                <span style={{ fontSize: 12, color: '#8A8FA8' }}>{slips.length} employees</span>
                <div style={{ flex: 1 }} />
                {slips.length > 0 && (
                  <button onClick={() => printMusterRoll(schoolConfig, activeRun, slips)} disabled={busy} style={btn('#F4F9FE', '#1A5F9C', busy)}>🖨 Muster roll</button>
                )}
                {activeRun.status === 'draft' && (
                  <>
                    <button onClick={approveRun} disabled={busy || !slips.length} style={btn('#1B6B3A', '#fff', busy || !slips.length)}>✓ Approve & post to ledger</button>
                    <button onClick={deleteRun} disabled={busy} style={btn('#FCEEEC', '#C0392B', busy)}>Discard draft</button>
                  </>
                )}
                {activeRun.status === 'approved' && (
                  <>
                    <select style={{ ...input, width: 180, cursor: 'pointer' }} value={payAccount} onChange={e => setPayAccount(e.target.value)}>
                      {bankAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                    <button onClick={markPaid} disabled={busy || !payAccount} style={btn('#1B6B3A', '#fff', busy || !payAccount)}>💸 Mark salaries paid</button>
                  </>
                )}
                {activeRun.status === 'paid' && activeRun.paid_at && (
                  <span style={{ fontSize: 11.5, color: '#1B6B3A', fontWeight: 700 }}>Paid {new Date(activeRun.paid_at).toLocaleDateString()}</span>
                )}
                {activeRun.status !== 'draft' && activeRun.approved_at && (
                  <span style={{ fontSize: 11.5, color: '#8A8FA8' }}>Approved {new Date(activeRun.approved_at).toLocaleString()}</span>
                )}
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr style={{ background: '#F8FAFC' }}>
                    <th style={th}>Employee</th>
                    {['Basic', 'Allowances', 'Gross', 'NSSF', 'SHIF', 'Housing', 'PAYE', 'Net pay'].map(h => (
                      <th key={h} style={{ ...th, textAlign: 'right' }}>{h}</th>
                    ))}
                    <th style={th}></th>
                  </tr></thead>
                  <tbody>
                    {slips.map(p => (
                      <tr key={p.id}>
                        <td style={{ ...td, fontWeight: 600, whiteSpace: 'nowrap' }}>{p.staff_name}</td>
                        <td style={tdNum}>{fmt(p.basic_salary)}</td>
                        <td style={tdNum}>{fmt(Number(p.house_allowance) + Number(p.transport_allowance) + Number(p.other_allowances))}</td>
                        <td style={{ ...tdNum, fontWeight: 700 }}>{fmt(p.gross_pay)}</td>
                        <td style={tdNum}>{fmt(p.nssf_employee)}</td>
                        <td style={tdNum}>{fmt(p.shif)}</td>
                        <td style={tdNum}>{fmt(p.housing_levy_employee)}</td>
                        <td style={tdNum}>{fmt(p.paye)}</td>
                        <td style={{ ...tdNum, fontWeight: 800, color: '#1B6B3A' }}>{fmt(p.net_pay)}</td>
                        <td style={{ ...td, textAlign: 'right' }}>
                          <button onClick={() => printSlip(p)} disabled={busy} style={smallBtn('#F4F9FE', '#1A5F9C')}>🖨</button>
                        </td>
                      </tr>
                    ))}
                    {slips.length > 0 && (
                      <tr style={{ background: '#FDFBF7', borderTop: '1px solid #E8EAF0' }}>
                        <td style={{ ...td, fontWeight: 800 }}>TOTAL</td>
                        <td style={tdNum} />
                        <td style={tdNum} />
                        <td style={{ ...tdNum, fontWeight: 800 }}>{fmt(totals.gross)}</td>
                        <td style={{ ...tdNum, fontWeight: 800 }}>{fmt(totals.nssf)}</td>
                        <td style={{ ...tdNum, fontWeight: 800 }}>{fmt(totals.shif)}</td>
                        <td style={{ ...tdNum, fontWeight: 800 }}>{fmt(totals.hl)}</td>
                        <td style={{ ...tdNum, fontWeight: 800 }}>{fmt(totals.paye)}</td>
                        <td style={{ ...tdNum, fontWeight: 800, color: '#1B6B3A' }}>{fmt(totals.net)}</td>
                        <td style={td} />
                      </tr>
                    )}
                    {!slips.length && (
                      <tr><td colSpan={10} style={{ ...td, textAlign: 'center', color: '#8A8FA8', padding: 20 }}>
                        No payslips in this run — set up pay profiles under Employees, then regenerate.
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              {slips.length > 0 && (
                <div style={{ padding: '10px 20px', borderTop: '1px solid #F1F0F5', fontSize: 11.5, color: '#8A8FA8' }}>
                  Employer contributions (NSSF + Housing Levy): KES {fmt(totals.er)} — booked as an expense on approval.
                  Total cost to school: KES {fmt(totals.gross + totals.er)}.
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ================= STATUTORY ================= */}
      {tab === 'statutory' && (
        <>
          <div style={{ ...card, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#2a2421' }}>Statutory remittances</div>
              <div style={{ fontSize: 12, color: '#8A8FA8', marginTop: 2 }}>What each approved payroll owes KRA / NSSF / SHA, and what has been remitted.</div>
            </div>
            <div>
              <label style={lbl}>Month</label>
              <select style={{ ...input, width: 140, cursor: 'pointer' }} value={statMonth} onChange={e => setStatMonth(parseInt(e.target.value))}>
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Year</label>
              <select style={{ ...input, width: 100, cursor: 'pointer' }} value={statYear} onChange={e => setStatYear(parseInt(e.target.value))}>
                {[statYear - 1, statYear, statYear + 1].filter((v, i, a) => a.indexOf(v) === i).map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>

          {statForm && (
            <div style={card}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#2a2421', marginBottom: 14 }}>
                Record {statForm.label} remittance — {MONTHS[statMonth - 1]} {statYear}
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ minWidth: 170 }}>
                  <label style={lbl}>Paid from</label>
                  <select style={{ ...input, cursor: 'pointer' }} value={statForm.bank_account_id} onChange={e => setStatForm({ ...statForm, bank_account_id: e.target.value })}>
                    {bankAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div style={{ width: 140 }}>
                  <label style={lbl}>Amount (KES)</label>
                  <input style={{ ...input, fontFamily: 'monospace', textAlign: 'right' }} type="number" min="0" step="0.01" value={statForm.amount} onChange={e => setStatForm({ ...statForm, amount: e.target.value })} />
                </div>
                <div>
                  <label style={lbl}>Date paid</label>
                  <input style={input} type="date" value={statForm.paid_at} onChange={e => setStatForm({ ...statForm, paid_at: e.target.value })} />
                </div>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <label style={lbl}>Reference (KRA slip / bank ref)</label>
                  <input style={input} value={statForm.reference} onChange={e => setStatForm({ ...statForm, reference: e.target.value })} />
                </div>
                <button onClick={recordStatutory} disabled={busy} style={btn('#1A5F9C', '#fff', busy)}>{busy ? 'Posting…' : 'Post remittance'}</button>
                <button onClick={() => setStatForm(null)} disabled={busy} style={btn('#F1F0F5', '#4A4A6A', busy)}>Cancel</button>
              </div>
            </div>
          )}

          <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: '#F8FAFC' }}>
                <th style={th}>Obligation</th>
                <th style={{ ...th, textAlign: 'right' }}>Due (from payroll)</th>
                <th style={{ ...th, textAlign: 'right' }}>Remitted</th>
                <th style={{ ...th, textAlign: 'right' }}>Balance owed</th>
                <th style={th}></th>
              </tr></thead>
              <tbody>
                {(statSummary || []).map(r => (
                  <tr key={r.kind}>
                    <td style={{ ...td, fontWeight: 700 }}>{r.label}</td>
                    <td style={tdNum}>{fmt(r.due)}</td>
                    <td style={{ ...tdNum, color: '#1B6B3A' }}>{fmt(r.paid)}</td>
                    <td style={{ ...tdNum, fontWeight: 800, color: Number(r.balance) > 0 ? '#C0392B' : '#1B6B3A' }}>{fmt(r.balance)}</td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <button onClick={() => setStatForm({
                        kind: r.kind, label: r.label,
                        amount: Number(r.balance) > 0 ? String(r.balance) : '',
                        bank_account_id: payAccount || bankAccounts[0]?.id || '',
                        paid_at: new Date().toISOString().slice(0, 10), reference: '',
                      })} disabled={busy} style={smallBtn('#F4F9FE', '#1A5F9C')}>Record remittance</button>
                    </td>
                  </tr>
                ))}
                {!statSummary && <tr><td colSpan={5} style={{ ...td, textAlign: 'center', color: '#8A8FA8', padding: 20 }}>Loading…</td></tr>}
              </tbody>
            </table>
          </div>

          <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '12px 20px', borderBottom: '1px solid #E8EAF0', fontSize: 13, fontWeight: 800, color: '#2a2421' }}>Remittance history</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr style={{ background: '#F8FAFC' }}>
                  <th style={th}>What</th><th style={th}>Period</th><th style={th}>Paid from</th><th style={th}>Date</th>
                  <th style={th}>Reference</th><th style={{ ...th, textAlign: 'right' }}>Amount (KES)</th><th style={th}></th>
                </tr></thead>
                <tbody>
                  {statPayments.map(sp => (
                    <tr key={sp.id} style={{ opacity: sp.status === 'voided' ? 0.55 : 1 }}>
                      <td style={{ ...td, fontWeight: 600, textTransform: 'uppercase', fontSize: 11.5 }}>{sp.kind.replace('_', ' ')}{sp.status === 'voided' ? ' · VOID' : ''}</td>
                      <td style={td}>{sp.period_month ? `${MONTHS[sp.period_month - 1]} ${sp.period_year}` : '—'}</td>
                      <td style={td}>{sp.bank_accounts?.name}</td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>{sp.paid_at}</td>
                      <td style={td}>{sp.reference || '—'}</td>
                      <td style={{ ...tdNum, fontWeight: 700 }}>{fmt(sp.amount)}</td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        {sp.status === 'active' && (
                          <button onClick={() => voidStatutory(sp)} disabled={busy} style={smallBtn('#FCEEEC', '#C0392B')}>Void</button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!statPayments.length && <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: '#8A8FA8', padding: 20 }}>No remittances recorded yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ================= P9 ================= */}
      {tab === 'p9' && (
        <>
          <div style={{ ...card, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#2a2421' }}>P9 tax deduction cards</div>
              <div style={{ fontSize: 12, color: '#8A8FA8', marginTop: 2 }}>Annual pay-and-tax certificate per employee, from approved runs — for their KRA ITR filing.</div>
            </div>
            <div style={{ minWidth: 200 }}>
              <label style={lbl}>Employee</label>
              <select style={{ ...input, cursor: 'pointer' }} value={p9StaffId} onChange={e => setP9StaffId(e.target.value)}>
                <option value="">Select…</option>
                {staffList.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Year</label>
              <select style={{ ...input, width: 100, cursor: 'pointer' }} value={p9Year} onChange={e => setP9Year(parseInt(e.target.value))}>
                {[p9Year - 1, p9Year, p9Year + 1].filter((v, i, a) => a.indexOf(v) === i).map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <button onClick={runP9} disabled={busy} style={btn('#1A5F9C', '#fff', busy)}>View</button>
            {p9Data && p9Data.months?.length > 0 && (
              <button onClick={() => printP9(schoolConfig, p9Data)} style={btn('#F4F9FE', '#1A5F9C')}>🖨 Print P9</button>
            )}
          </div>

          {p9Data && (
            <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '12px 20px', borderBottom: '1px solid #E8EAF0', display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ fontSize: 13.5, fontWeight: 800, color: '#2a2421' }}>{p9Data.staff_name || '—'}</span>
                <span style={{ fontSize: 12, color: '#8A8FA8' }}>KRA PIN: {p9Data.kra_pin || '—'} · Year {p9Data.year}</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr style={{ background: '#F8FAFC' }}>
                    <th style={th}>Month</th>
                    {['Basic', 'Benefits', 'Gross', 'Pension', 'Taxable', 'Tax charged', 'Relief', 'PAYE'].map(h => (
                      <th key={h} style={{ ...th, textAlign: 'right' }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {(p9Data.months || []).map(m => (
                      <tr key={m.month}>
                        <td style={{ ...td, fontWeight: 600 }}>{MONTHS[m.month - 1]}</td>
                        <td style={tdNum}>{fmt(m.basic)}</td>
                        <td style={tdNum}>{fmt(m.benefits)}</td>
                        <td style={{ ...tdNum, fontWeight: 700 }}>{fmt(m.gross)}</td>
                        <td style={tdNum}>{fmt(m.pension)}</td>
                        <td style={tdNum}>{fmt(m.taxable)}</td>
                        <td style={tdNum}>{fmt(m.tax_charged)}</td>
                        <td style={tdNum}>{fmt(m.relief)}</td>
                        <td style={{ ...tdNum, fontWeight: 700 }}>{fmt(m.paye)}</td>
                      </tr>
                    ))}
                    {!(p9Data.months || []).length && (
                      <tr><td colSpan={9} style={{ ...td, textAlign: 'center', color: '#8A8FA8', padding: 20 }}>
                        No approved payroll for this employee in {p9Data.year}.
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Payroll;

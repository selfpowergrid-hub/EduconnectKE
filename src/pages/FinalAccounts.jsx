import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

// Final Accounts (Phase E) — the statements a school must produce, all read
// from the one general ledger (gl_journal_lines), plus the accountant's tools:
//   · Trial Balance        — every account Dr/Cr, proves the books balance
//   · Income & Expenditure — surplus/deficit for a period, drill-down to detail
//   · Balance Sheet        — assets / liabilities / fund as at a date
//   · Account Detail       — any account's entries with running balance
//   · Journal Entry        — manual adjustments via post_gl_journal (audited)
//   · Year-End             — close the year to Accumulated Fund + books lock

const fmt = (n) => Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const todayISO = () => new Date().toISOString().slice(0, 10);
const yearStartISO = () => todayISO().slice(0, 4) + '-01-01';

const TYPE_LABEL = { asset: 'Assets', liability: 'Liabilities', equity: 'Equity', income: 'Income', expense: 'Expenses' };
const SOURCE_LABEL = {
  fees: 'Fee collection', bank_transfer: 'Transfer', manual: 'Journal',
  ap_bill: 'Supplier bill', ap_bill_void: 'Bill void', ap_payment: 'Supplier payment',
  ap_payment_void: 'Payment void', petty_expense: 'Petty cash', petty_expense_void: 'Petty cash void',
  payroll: 'Payroll', payroll_payment: 'Salaries paid', statutory: 'Statutory', statutory_void: 'Statutory void',
  year_close: 'Year close', year_close_reversal: 'Year reopen',
};

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
  const body = rows.map(r => `<tr>${r.map((c, i) => `<td class="${i > 0 && /^[\d,.()-]+$/.test(String(c)) ? 'num' : ''}">${c ?? ''}</td>`).join('')}</tr>`).join('');
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

const emptyJLine = () => ({ account_id: '', narration: '', debit: '', credit: '' });

const FinalAccounts = ({ schoolConfig }) => {
  const [tab, setTab] = useState('tb');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const [accounts, setAccounts] = useState([]);
  const [lock, setLock] = useState(null);         // fiscal_locks row or null

  // Trial balance / statements share the same fetch
  const [tbAsAt, setTbAsAt] = useState(todayISO());
  const [tbRows, setTbRows] = useState(null);     // trial balance rows (all history → asAt)
  const [ieFrom, setIeFrom] = useState(yearStartISO());
  const [ieTo, setIeTo] = useState(todayISO());
  const [ieRows, setIeRows] = useState(null);
  const [bsAsAt, setBsAsAt] = useState(todayISO());
  const [bsRows, setBsRows] = useState(null);

  // Account detail
  const [detAccount, setDetAccount] = useState('');
  const [detFrom, setDetFrom] = useState(yearStartISO());
  const [detTo, setDetTo] = useState(todayISO());
  const [detail, setDetail] = useState(null);

  // Manual journal
  const [jDate, setJDate] = useState(todayISO());
  const [jMemo, setJMemo] = useState('');
  const [jLines, setJLines] = useState([emptyJLine(), emptyJLine()]);
  const [jMsg, setJMsg] = useState('');

  // Year-end
  const [closeYear, setCloseYear] = useState(new Date().getFullYear() - 1);
  const [lockDate, setLockDate] = useState('');

  const load = useCallback(async () => {
    if (!schoolConfig?.id) return;
    const [accs, lk] = await Promise.all([
      supabase.from('gl_accounts').select('id, code, name, type, is_active')
        .eq('school_id', schoolConfig.id).order('code'),
      supabase.from('fiscal_locks').select('*').eq('school_id', schoolConfig.id).maybeSingle(),
    ]);
    if (accs.error) { setErr(accs.error.message); return; }
    setAccounts(accs.data || []);
    setLock(lk.data || null);
  }, [schoolConfig?.id]);

  useEffect(() => { load(); }, [load]);

  const fetchTB = async (from, to) => {
    const { data, error } = await supabase.rpc('get_gl_trial_balance', {
      p_school_id: schoolConfig.id, p_from: from, p_to: to,
    });
    if (error) { setErr(error.message); return null; }
    return Array.isArray(data) ? data.map(r => ({ ...r, net: Number(r.debits) - Number(r.credits) })) : [];
  };

  const runTB = async () => { setErr(''); setTbRows(await fetchTB(null, tbAsAt || null)); };
  const runIE = async () => { setErr(''); setIeRows(await fetchTB(ieFrom || null, ieTo || null)); };
  const runBS = async () => { setErr(''); setBsRows(await fetchTB(null, bsAsAt || null)); };

  const runDetail = async (accountId = detAccount, from = detFrom, to = detTo) => {
    if (!accountId) { setErr('Pick an account.'); return; }
    setErr('');
    const { data, error } = await supabase.rpc('get_gl_account_detail', {
      p_school_id: schoolConfig.id, p_account_id: accountId,
      p_from: from || null, p_to: to || null,
    });
    if (error) { setErr(error.message); return; }
    setDetail(data);
  };

  const drillTo = (accountId, from, to) => {
    setDetAccount(accountId);
    setDetFrom(from || '');
    setDetTo(to || '');
    setDetail(null);
    setTab('detail');
    runDetail(accountId, from, to);
  };

  // ---------------- Journal ----------------

  const setJLine = (i, patch) => setJLines(ls => ls.map((l, j) => j === i ? { ...l, ...patch } : l));
  const jTotals = jLines.reduce((t, l) => ({
    dr: t.dr + (parseFloat(l.debit) || 0), cr: t.cr + (parseFloat(l.credit) || 0),
  }), { dr: 0, cr: 0 });
  const jBalanced = jTotals.dr > 0 && Math.abs(jTotals.dr - jTotals.cr) < 0.005;

  const postJournal = async () => {
    const lines = jLines
      .filter(l => l.account_id && ((parseFloat(l.debit) || 0) > 0 || (parseFloat(l.credit) || 0) > 0))
      .map(l => ({
        account_id: l.account_id, narration: l.narration || null,
        debit: parseFloat(l.debit) || 0, credit: parseFloat(l.credit) || 0,
      }));
    if (lines.length < 2) { setJMsg('A journal needs at least two lines.'); return; }
    setBusy(true);
    setJMsg('');
    const { data, error } = await supabase.rpc('post_gl_journal', {
      p_school_id: schoolConfig.id, p_entry_date: jDate || null,
      p_memo: jMemo || null, p_lines: lines,
    });
    setBusy(false);
    if (error) { setJMsg(error.message); return; }
    setJMsg(`Posted ${data.journal_no}.`);
    setJLines([emptyJLine(), emptyJLine()]);
    setJMemo('');
  };

  // ---------------- Year-end ----------------

  const doClose = async () => {
    if (!window.confirm(`Close the ${closeYear} financial year?\n\nAll income and expense accounts are zeroed into the Accumulated Fund, and the books lock through 31 Dec ${closeYear}. Nothing dated on or before that day can be posted afterwards.\n\nOnly the school admin can reopen it.`)) return;
    setBusy(true);
    setErr('');
    const { data, error } = await supabase.rpc('close_fiscal_year', { p_school_id: schoolConfig.id, p_year: closeYear });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    window.alert(`Year ${closeYear} closed. ${data.accounts_closed} accounts zeroed; ${Number(data.surplus) >= 0 ? 'surplus' : 'deficit'} of KES ${fmt(Math.abs(data.surplus))} moved to the Accumulated Fund.`);
    load();
  };

  const doReopen = async () => {
    if (!window.confirm(`Reopen the ${closeYear} financial year?\n\nThe closing journal is reversed and the lock rolls back.`)) return;
    setBusy(true);
    setErr('');
    const { error } = await supabase.rpc('reopen_fiscal_year', { p_school_id: schoolConfig.id, p_year: closeYear });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    load();
  };

  const doSetLock = async () => {
    if (!window.confirm(lockDate
      ? `Lock the books through ${lockDate}? Nothing dated on or before that day can be posted.`
      : 'Remove the books lock?')) return;
    setBusy(true);
    setErr('');
    const { error } = await supabase.rpc('set_fiscal_lock', { p_school_id: schoolConfig.id, p_locked_through: lockDate || null });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setLockDate('');
    load();
  };

  // ---------------- Rendering ----------------

  const card = { background: '#fff', border: '1px solid #E8EAF0', borderRadius: 12, padding: 20, marginBottom: 16 };
  const lbl = { display: 'block', fontSize: 10, fontWeight: 800, color: '#8a8fa8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' };
  const input = { padding: '8px 10px', borderRadius: 8, border: '1px solid #e6dfd8', fontSize: 13, color: '#2a2421', background: '#fff', boxSizing: 'border-box' };
  const btn = (bg, color, disabled) => ({ padding: '9px 16px', background: disabled ? '#8a8fa8' : bg, border: 'none', borderRadius: 8, fontSize: 13, color, fontWeight: 700, cursor: disabled ? 'default' : 'pointer' });
  const th = { padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 800, color: '#8a8fa8', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #E8EAF0', whiteSpace: 'nowrap' };
  const td = { padding: '8px 12px', borderTop: '1px solid #F1F0F5', fontSize: 12.5, color: '#2a2421' };
  const tdNum = { ...td, textAlign: 'right', fontFamily: 'monospace', whiteSpace: 'nowrap' };
  const sectionRow = (label) => (
    <tr style={{ background: '#F8FAFC' }}>
      <td colSpan={99} style={{ ...td, fontWeight: 800, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#4A4A6A' }}>{label}</td>
    </tr>
  );

  // Derived statement data
  const tbTotals = (tbRows || []).reduce((t, r) => ({
    dr: t.dr + Math.max(r.net, 0), cr: t.cr + Math.max(-r.net, 0),
  }), { dr: 0, cr: 0 });
  const ieIncome = (ieRows || []).filter(r => r.type === 'income' && Math.abs(r.net) >= 0.005);
  const ieExpense = (ieRows || []).filter(r => r.type === 'expense' && Math.abs(r.net) >= 0.005);
  const ieIncomeTotal = ieIncome.reduce((s, r) => s - r.net, 0);   // income = net credit
  const ieExpenseTotal = ieExpense.reduce((s, r) => s + r.net, 0);
  const ieSurplus = ieIncomeTotal - ieExpenseTotal;
  const bsAssets = (bsRows || []).filter(r => r.type === 'asset' && Math.abs(r.net) >= 0.005);
  const bsLiab = (bsRows || []).filter(r => r.type === 'liability' && Math.abs(r.net) >= 0.005);
  const bsEquity = (bsRows || []).filter(r => r.type === 'equity' && Math.abs(r.net) >= 0.005);
  const bsAssetsTotal = bsAssets.reduce((s, r) => s + r.net, 0);
  const bsLiabTotal = bsLiab.reduce((s, r) => s - r.net, 0);
  const bsEquityTotal = bsEquity.reduce((s, r) => s - r.net, 0);
  const bsSurplus = (bsRows || []).filter(r => r.type === 'income' || r.type === 'expense')
    .reduce((s, r) => s - r.net, 0);   // unclosed income − expenses to date
  const bsBalanced = Math.abs(bsAssetsTotal - (bsLiabTotal + bsEquityTotal + bsSurplus)) < 0.01;
  const detAcc = accounts.find(a => a.id === detAccount);
  const detEntries = detail?.entries || [];
  const detClosing = detEntries.length ? Number(detEntries[detEntries.length - 1].balance) : Number(detail?.opening_balance || 0);

  return (
    <div style={{ paddingBottom: 40, maxWidth: 1100 }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#2a2421' }}>Final Accounts</h2>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: '#8A8FA8' }}>
          The school's books of account — every fee, bill, salary and voucher reads from one ledger.
          {lock && <> · <strong style={{ color: '#B4690E' }}>Books locked through {lock.locked_through}</strong></>}
        </p>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid #E8EAF0', flexWrap: 'wrap' }}>
        {[['tb', 'Trial Balance'], ['ie', 'Income & Expenditure'], ['bs', 'Balance Sheet'], ['detail', 'Account Detail'], ['journal', 'Journal Entry'], ['yearend', 'Year-End']].map(([id, label]) => (
          <button key={id} onClick={() => { setTab(id); setErr(''); }}
            style={{ padding: '8px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: tab === id ? '#1A5F9C' : '#8A8FA8', borderBottom: tab === id ? '2px solid #1A5F9C' : '2px solid transparent', marginBottom: -1 }}>
            {label}
          </button>
        ))}
      </div>

      {err && (
        <div style={{ ...card, background: '#FCEEEC', border: '1px solid #F3C9C3', color: '#C0392B', fontSize: 12.5, fontWeight: 600 }}>{err}</div>
      )}

      {/* ================= TRIAL BALANCE ================= */}
      {tab === 'tb' && (
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #E8EAF0', display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#2a2421' }}>Trial Balance</div>
              <div style={{ fontSize: 12, color: '#8A8FA8', marginTop: 2 }}>Every account's net balance — total debits must equal total credits.</div>
            </div>
            <div><label style={lbl}>As at</label><input style={input} type="date" value={tbAsAt} onChange={e => setTbAsAt(e.target.value)} /></div>
            <button onClick={runTB} style={btn('#1A5F9C', '#fff')}>Run</button>
            {tbRows && (() => {
              const headers = ['Code', 'Account', 'Type', 'Debit', 'Credit'];
              const rows = [
                ...tbRows.map(r => [r.code, r.name, r.type, r.net > 0 ? fmt(r.net) : '', r.net < 0 ? fmt(-r.net) : '']),
                ['', 'TOTALS', '', fmt(tbTotals.dr), fmt(tbTotals.cr)],
              ];
              return (
                <>
                  <button onClick={() => downloadCsv(`trial-balance-${tbAsAt}.csv`, headers, rows)} style={btn('#F4F9FE', '#1A5F9C')}>⬇ CSV</button>
                  <button onClick={() => printTable(schoolConfig?.school_name, `Trial Balance as at ${tbAsAt}`, headers, rows)} style={btn('#F4F9FE', '#1A5F9C')}>🖨 Print</button>
                </>
              );
            })()}
          </div>
          {tbRows && (
            <>
              <div style={{ padding: '10px 20px', background: Math.abs(tbTotals.dr - tbTotals.cr) < 0.01 ? '#E8F5EE' : '#FCEEEC', fontSize: 12.5, fontWeight: 700, color: Math.abs(tbTotals.dr - tbTotals.cr) < 0.01 ? '#1B6B3A' : '#C0392B' }}>
                {Math.abs(tbTotals.dr - tbTotals.cr) < 0.01 ? '✓ The books balance.' : '⚠ Debits and credits differ — investigate before producing statements.'}
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr style={{ background: '#F8FAFC' }}>
                    <th style={th}>Code</th><th style={th}>Account</th><th style={th}>Type</th>
                    <th style={{ ...th, textAlign: 'right' }}>Debit (KES)</th><th style={{ ...th, textAlign: 'right' }}>Credit (KES)</th>
                  </tr></thead>
                  <tbody>
                    {tbRows.map(r => (
                      <tr key={r.account_id} style={{ cursor: 'pointer' }} onClick={() => drillTo(r.account_id, null, tbAsAt)}>
                        <td style={{ ...td, fontFamily: 'monospace' }}>{r.code}</td>
                        <td style={{ ...td, color: '#1A5F9C', fontWeight: 600 }}>{r.name}</td>
                        <td style={td}>{r.type}</td>
                        <td style={tdNum}>{r.net > 0 ? fmt(r.net) : ''}</td>
                        <td style={tdNum}>{r.net < 0 ? fmt(-r.net) : ''}</td>
                      </tr>
                    ))}
                    <tr style={{ background: '#FDFBF7', borderTop: '1px solid #E8EAF0' }}>
                      <td style={td} /><td style={{ ...td, fontWeight: 800 }}>TOTALS</td><td style={td} />
                      <td style={{ ...tdNum, fontWeight: 800 }}>{fmt(tbTotals.dr)}</td>
                      <td style={{ ...tdNum, fontWeight: 800 }}>{fmt(tbTotals.cr)}</td>
                    </tr>
                    {!tbRows.length && <tr><td colSpan={5} style={{ ...td, textAlign: 'center', color: '#8A8FA8', padding: 20 }}>No postings yet.</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ================= INCOME & EXPENDITURE ================= */}
      {tab === 'ie' && (
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #E8EAF0', display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#2a2421' }}>Income & Expenditure Statement</div>
              <div style={{ fontSize: 12, color: '#8A8FA8', marginTop: 2 }}>What the school earned and spent over a period. Click any line for its entries.</div>
            </div>
            <div><label style={lbl}>From</label><input style={input} type="date" value={ieFrom} onChange={e => setIeFrom(e.target.value)} /></div>
            <div><label style={lbl}>To</label><input style={input} type="date" value={ieTo} onChange={e => setIeTo(e.target.value)} /></div>
            <button onClick={runIE} style={btn('#1A5F9C', '#fff')}>Run</button>
            {ieRows && (() => {
              const headers = ['Code', 'Line', 'Amount (KES)'];
              const rows = [
                ['', 'INCOME', ''],
                ...ieIncome.map(r => [r.code, r.name, fmt(-r.net)]),
                ['', 'Total income', fmt(ieIncomeTotal)],
                ['', 'EXPENDITURE', ''],
                ...ieExpense.map(r => [r.code, r.name, fmt(r.net)]),
                ['', 'Total expenditure', fmt(ieExpenseTotal)],
                ['', ieSurplus >= 0 ? 'SURPLUS' : 'DEFICIT', fmt(Math.abs(ieSurplus))],
              ];
              return (
                <>
                  <button onClick={() => downloadCsv(`income-expenditure-${ieFrom}-to-${ieTo}.csv`, headers, rows)} style={btn('#F4F9FE', '#1A5F9C')}>⬇ CSV</button>
                  <button onClick={() => printTable(schoolConfig?.school_name, `Income & Expenditure Statement (${ieFrom} to ${ieTo})`, headers, rows)} style={btn('#F4F9FE', '#1A5F9C')}>🖨 Print</button>
                </>
              );
            })()}
          </div>
          {ieRows && (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {sectionRow('Income')}
                {ieIncome.map(r => (
                  <tr key={r.account_id} style={{ cursor: 'pointer' }} onClick={() => drillTo(r.account_id, ieFrom, ieTo)}>
                    <td style={{ ...td, fontFamily: 'monospace', width: 70 }}>{r.code}</td>
                    <td style={{ ...td, color: '#1A5F9C', fontWeight: 600 }}>{r.name}</td>
                    <td style={{ ...tdNum, width: 160 }}>{fmt(-r.net)}</td>
                  </tr>
                ))}
                <tr style={{ background: '#FDFBF7' }}>
                  <td style={td} /><td style={{ ...td, fontWeight: 800 }}>Total income</td>
                  <td style={{ ...tdNum, fontWeight: 800 }}>{fmt(ieIncomeTotal)}</td>
                </tr>
                {sectionRow('Expenditure')}
                {ieExpense.map(r => (
                  <tr key={r.account_id} style={{ cursor: 'pointer' }} onClick={() => drillTo(r.account_id, ieFrom, ieTo)}>
                    <td style={{ ...td, fontFamily: 'monospace' }}>{r.code}</td>
                    <td style={{ ...td, color: '#1A5F9C', fontWeight: 600 }}>{r.name}</td>
                    <td style={tdNum}>{fmt(r.net)}</td>
                  </tr>
                ))}
                <tr style={{ background: '#FDFBF7' }}>
                  <td style={td} /><td style={{ ...td, fontWeight: 800 }}>Total expenditure</td>
                  <td style={{ ...tdNum, fontWeight: 800 }}>{fmt(ieExpenseTotal)}</td>
                </tr>
                <tr style={{ background: ieSurplus >= 0 ? '#E8F5EE' : '#FCEEEC', borderTop: '2px solid #E8EAF0' }}>
                  <td style={td} />
                  <td style={{ ...td, fontWeight: 800, fontSize: 13.5, color: ieSurplus >= 0 ? '#1B6B3A' : '#C0392B' }}>
                    {ieSurplus >= 0 ? 'SURPLUS for the period' : 'DEFICIT for the period'}
                  </td>
                  <td style={{ ...tdNum, fontWeight: 800, fontSize: 13.5, color: ieSurplus >= 0 ? '#1B6B3A' : '#C0392B' }}>{fmt(Math.abs(ieSurplus))}</td>
                </tr>
                {!ieIncome.length && !ieExpense.length && (
                  <tr><td colSpan={3} style={{ ...td, textAlign: 'center', color: '#8A8FA8', padding: 20 }}>No income or expenses in this period.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ================= BALANCE SHEET ================= */}
      {tab === 'bs' && (
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #E8EAF0', display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#2a2421' }}>Balance Sheet (Statement of Financial Position)</div>
              <div style={{ fontSize: 12, color: '#8A8FA8', marginTop: 2 }}>What the school owns and owes as at a date.</div>
            </div>
            <div><label style={lbl}>As at</label><input style={input} type="date" value={bsAsAt} onChange={e => setBsAsAt(e.target.value)} /></div>
            <button onClick={runBS} style={btn('#1A5F9C', '#fff')}>Run</button>
            {bsRows && (() => {
              const headers = ['Code', 'Line', 'Amount (KES)'];
              const rows = [
                ['', 'ASSETS', ''],
                ...bsAssets.map(r => [r.code, r.name, fmt(r.net)]),
                ['', 'Total assets', fmt(bsAssetsTotal)],
                ['', 'LIABILITIES', ''],
                ...bsLiab.map(r => [r.code, r.name, fmt(-r.net)]),
                ['', 'Total liabilities', fmt(bsLiabTotal)],
                ['', 'ACCUMULATED FUND', ''],
                ...bsEquity.map(r => [r.code, r.name, fmt(-r.net)]),
                ['', 'Surplus/(deficit) to date', fmt(bsSurplus)],
                ['', 'Total fund', fmt(bsEquityTotal + bsSurplus)],
                ['', 'Liabilities + fund', fmt(bsLiabTotal + bsEquityTotal + bsSurplus)],
              ];
              return (
                <>
                  <button onClick={() => downloadCsv(`balance-sheet-${bsAsAt}.csv`, headers, rows)} style={btn('#F4F9FE', '#1A5F9C')}>⬇ CSV</button>
                  <button onClick={() => printTable(schoolConfig?.school_name, `Balance Sheet as at ${bsAsAt}`, headers, rows)} style={btn('#F4F9FE', '#1A5F9C')}>🖨 Print</button>
                </>
              );
            })()}
          </div>
          {bsRows && (
            <>
              <div style={{ padding: '10px 20px', background: bsBalanced ? '#E8F5EE' : '#FCEEEC', fontSize: 12.5, fontWeight: 700, color: bsBalanced ? '#1B6B3A' : '#C0392B' }}>
                {bsBalanced
                  ? `✓ Assets (${fmt(bsAssetsTotal)}) = Liabilities + Fund (${fmt(bsLiabTotal + bsEquityTotal + bsSurplus)})`
                  : `⚠ Assets ${fmt(bsAssetsTotal)} ≠ Liabilities + Fund ${fmt(bsLiabTotal + bsEquityTotal + bsSurplus)}`}
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {sectionRow('Assets')}
                  {bsAssets.map(r => (
                    <tr key={r.account_id} style={{ cursor: 'pointer' }} onClick={() => drillTo(r.account_id, null, bsAsAt)}>
                      <td style={{ ...td, fontFamily: 'monospace', width: 70 }}>{r.code}</td>
                      <td style={{ ...td, color: '#1A5F9C', fontWeight: 600 }}>{r.name}</td>
                      <td style={{ ...tdNum, width: 160 }}>{fmt(r.net)}</td>
                    </tr>
                  ))}
                  <tr style={{ background: '#FDFBF7' }}><td style={td} /><td style={{ ...td, fontWeight: 800 }}>Total assets</td><td style={{ ...tdNum, fontWeight: 800 }}>{fmt(bsAssetsTotal)}</td></tr>
                  {sectionRow('Liabilities')}
                  {bsLiab.map(r => (
                    <tr key={r.account_id} style={{ cursor: 'pointer' }} onClick={() => drillTo(r.account_id, null, bsAsAt)}>
                      <td style={{ ...td, fontFamily: 'monospace' }}>{r.code}</td>
                      <td style={{ ...td, color: '#1A5F9C', fontWeight: 600 }}>{r.name}</td>
                      <td style={tdNum}>{fmt(-r.net)}</td>
                    </tr>
                  ))}
                  <tr style={{ background: '#FDFBF7' }}><td style={td} /><td style={{ ...td, fontWeight: 800 }}>Total liabilities</td><td style={{ ...tdNum, fontWeight: 800 }}>{fmt(bsLiabTotal)}</td></tr>
                  {sectionRow('Accumulated fund')}
                  {bsEquity.map(r => (
                    <tr key={r.account_id} style={{ cursor: 'pointer' }} onClick={() => drillTo(r.account_id, null, bsAsAt)}>
                      <td style={{ ...td, fontFamily: 'monospace' }}>{r.code}</td>
                      <td style={{ ...td, color: '#1A5F9C', fontWeight: 600 }}>{r.name}</td>
                      <td style={tdNum}>{fmt(-r.net)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td style={td} /><td style={td}>Surplus/(deficit) to date (unclosed)</td>
                    <td style={tdNum}>{fmt(bsSurplus)}</td>
                  </tr>
                  <tr style={{ background: '#FDFBF7', borderTop: '2px solid #E8EAF0' }}>
                    <td style={td} /><td style={{ ...td, fontWeight: 800 }}>Total liabilities + fund</td>
                    <td style={{ ...tdNum, fontWeight: 800 }}>{fmt(bsLiabTotal + bsEquityTotal + bsSurplus)}</td>
                  </tr>
                </tbody>
              </table>
            </>
          )}
        </div>
      )}

      {/* ================= ACCOUNT DETAIL ================= */}
      {tab === 'detail' && (
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #E8EAF0', display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#2a2421' }}>General Ledger — account detail</div>
              <div style={{ fontSize: 12, color: '#8A8FA8', marginTop: 2 }}>Every entry on one account, with a running balance.</div>
            </div>
            <div style={{ minWidth: 220 }}>
              <label style={lbl}>Account</label>
              <select style={{ ...input, width: '100%', cursor: 'pointer' }} value={detAccount} onChange={e => setDetAccount(e.target.value)}>
                <option value="">Select…</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
              </select>
            </div>
            <div><label style={lbl}>From</label><input style={input} type="date" value={detFrom} onChange={e => setDetFrom(e.target.value)} /></div>
            <div><label style={lbl}>To</label><input style={input} type="date" value={detTo} onChange={e => setDetTo(e.target.value)} /></div>
            <button onClick={() => runDetail()} style={btn('#1A5F9C', '#fff')}>Run</button>
            {detail && detAcc && (() => {
              const headers = ['Date', 'Journal', 'Source', 'Details', 'Debit', 'Credit', 'Balance'];
              const rows = [
                [detFrom || '—', '', '', 'Opening balance', '', '', fmt(detail.opening_balance)],
                ...detEntries.map(e => [e.entry_date, e.journal_no, SOURCE_LABEL[e.source_type] || e.source_type, e.narration || '', Number(e.debit) ? fmt(e.debit) : '', Number(e.credit) ? fmt(e.credit) : '', fmt(e.balance)]),
                [detTo || '—', '', '', 'Closing balance', '', '', fmt(detClosing)],
              ];
              return (
                <>
                  <button onClick={() => downloadCsv(`ledger-${detAcc.code}.csv`, headers, rows)} style={btn('#F4F9FE', '#1A5F9C')}>⬇ CSV</button>
                  <button onClick={() => printTable(schoolConfig?.school_name, `General Ledger — ${detAcc.code} ${detAcc.name} (${detFrom || 'start'} to ${detTo || 'today'})`, headers, rows)} style={btn('#F4F9FE', '#1A5F9C')}>🖨 Print</button>
                </>
              );
            })()}
          </div>
          {detail && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr style={{ background: '#F8FAFC' }}>
                  <th style={th}>Date</th><th style={th}>Journal</th><th style={th}>Source</th><th style={th}>Details</th>
                  <th style={{ ...th, textAlign: 'right' }}>Debit</th><th style={{ ...th, textAlign: 'right' }}>Credit</th><th style={{ ...th, textAlign: 'right' }}>Balance</th>
                </tr></thead>
                <tbody>
                  <tr style={{ background: '#FDFBF7' }}>
                    <td style={{ ...td, color: '#8A8FA8' }}>{detFrom || '—'}</td>
                    <td colSpan={3} style={{ ...td, fontWeight: 700, color: '#4A4A6A' }}>Opening balance</td>
                    <td /><td /><td style={{ ...tdNum, fontWeight: 700 }}>{fmt(detail.opening_balance)}</td>
                  </tr>
                  {detEntries.map((e, i) => (
                    <tr key={i}>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>{e.entry_date}</td>
                      <td style={{ ...td, fontFamily: 'monospace', fontSize: 11.5, whiteSpace: 'nowrap' }}>{e.journal_no}</td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>{SOURCE_LABEL[e.source_type] || e.source_type}</td>
                      <td style={{ ...td, color: '#4A4A6A' }}>{e.narration || ''}</td>
                      <td style={tdNum}>{Number(e.debit) ? fmt(e.debit) : ''}</td>
                      <td style={tdNum}>{Number(e.credit) ? fmt(e.credit) : ''}</td>
                      <td style={{ ...tdNum, fontWeight: 600 }}>{fmt(e.balance)}</td>
                    </tr>
                  ))}
                  <tr style={{ background: '#FDFBF7', borderTop: '1px solid #E8EAF0' }}>
                    <td style={{ ...td, color: '#8A8FA8' }}>{detTo || '—'}</td>
                    <td colSpan={3} style={{ ...td, fontWeight: 700, color: '#4A4A6A' }}>Closing balance</td>
                    <td /><td /><td style={{ ...tdNum, fontWeight: 800 }}>{fmt(detClosing)}</td>
                  </tr>
                  {!detEntries.length && <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: '#8A8FA8', padding: 16 }}>No movements in this period.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ================= JOURNAL ENTRY ================= */}
      {tab === 'journal' && (
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#2a2421', marginBottom: 4 }}>Manual journal entry</div>
          <div style={{ fontSize: 12, color: '#8A8FA8', marginBottom: 14 }}>
            The accountant's escape hatch for adjustments (accruals, corrections, opening balances). Fully audited; must balance.
          </div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
            <div><label style={lbl}>Entry date</label><input style={input} type="date" value={jDate} onChange={e => setJDate(e.target.value)} /></div>
            <div style={{ flex: 1, minWidth: 200 }}><label style={lbl}>Memo</label>
              <input style={{ ...input, width: '100%' }} value={jMemo} onChange={e => setJMemo(e.target.value)} placeholder="e.g. Accrue December electricity" /></div>
          </div>
          {jLines.map((l, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <select style={{ ...input, flex: 2, cursor: 'pointer' }} value={l.account_id} onChange={e => setJLine(i, { account_id: e.target.value })}>
                <option value="">Account…</option>
                {accounts.filter(a => a.is_active).map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
              </select>
              <input style={{ ...input, flex: 2 }} placeholder="Narration" value={l.narration} onChange={e => setJLine(i, { narration: e.target.value })} />
              <input style={{ ...input, width: 120, textAlign: 'right', fontFamily: 'monospace' }} type="number" min="0" step="0.01" placeholder="Debit"
                value={l.debit} onChange={e => setJLine(i, { debit: e.target.value, credit: e.target.value ? '' : l.credit })} />
              <input style={{ ...input, width: 120, textAlign: 'right', fontFamily: 'monospace' }} type="number" min="0" step="0.01" placeholder="Credit"
                value={l.credit} onChange={e => setJLine(i, { credit: e.target.value, debit: e.target.value ? '' : l.debit })} />
              <button onClick={() => setJLines(ls => ls.filter((_, j) => j !== i))} disabled={jLines.length <= 2}
                style={{ padding: '5px 10px', background: '#FCEEEC', border: 'none', borderRadius: 6, fontSize: 11.5, color: '#C0392B', fontWeight: 700, cursor: 'pointer', opacity: jLines.length <= 2 ? 0.4 : 1 }}>✕</button>
            </div>
          ))}
          <button onClick={() => setJLines(ls => [...ls, emptyJLine()])}
            style={{ padding: '5px 10px', background: '#F4F9FE', border: 'none', borderRadius: 6, fontSize: 11.5, color: '#1A5F9C', fontWeight: 700, cursor: 'pointer', marginBottom: 14 }}>+ Add line</button>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', borderTop: '1px solid #F1F0F5', paddingTop: 14 }}>
            <div style={{ flex: 1, fontSize: 13, fontWeight: 700, color: jBalanced ? '#1B6B3A' : '#C0392B' }}>
              Dr {fmt(jTotals.dr)} · Cr {fmt(jTotals.cr)} {jBalanced ? '· ✓ balanced' : jTotals.dr || jTotals.cr ? '· not balanced' : ''}
            </div>
            <button onClick={postJournal} disabled={busy || !jBalanced} style={btn('#1A5F9C', '#fff', busy || !jBalanced)}>
              {busy ? 'Posting…' : 'Post journal'}
            </button>
          </div>
          {jMsg && (
            <div style={{ marginTop: 10, fontSize: 12.5, fontWeight: 600, color: jMsg.startsWith('Posted') ? '#1B6B3A' : '#C0392B' }}>{jMsg}</div>
          )}
        </div>
      )}

      {/* ================= YEAR-END ================= */}
      {tab === 'yearend' && (
        <>
          <div style={card}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#2a2421', marginBottom: 4 }}>Books lock</div>
            <div style={{ fontSize: 12.5, color: '#4A4A6A', marginBottom: 14, lineHeight: 1.5 }}>
              {lock
                ? <>The books are locked through <strong>{lock.locked_through}</strong>. Nothing — fees, bills, payroll, journals — can be posted with a date on or before it.</>
                : 'No lock is set — postings are allowed for any date.'}
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div><label style={lbl}>Lock through (blank = remove)</label>
                <input style={input} type="date" value={lockDate} onChange={e => setLockDate(e.target.value)} /></div>
              <button onClick={doSetLock} disabled={busy} style={btn('#B4690E', '#fff', busy)}>
                {lockDate ? 'Set lock' : 'Remove lock'}
              </button>
              <div style={{ fontSize: 11.5, color: '#8A8FA8' }}>Admin only. Useful for locking a finished term mid-year.</div>
            </div>
          </div>

          <div style={card}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#2a2421', marginBottom: 4 }}>Year-end close</div>
            <div style={{ fontSize: 12.5, color: '#4A4A6A', marginBottom: 14, lineHeight: 1.5 }}>
              Closing a year zeroes every income and expense account into <strong>3000 Accumulated Fund</strong> and locks the books
              through 31 December. Run it once the year's last entries are in. Reopening (admin only) reverses the closing
              journal — do it before the next year's close, never after.
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div>
                <label style={lbl}>Financial year</label>
                <select style={{ ...input, width: 120, cursor: 'pointer' }} value={closeYear} onChange={e => setCloseYear(parseInt(e.target.value))}>
                  {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 3 + i).map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <button onClick={doClose} disabled={busy} style={btn('#1B6B3A', '#fff', busy)}>🔒 Close year {closeYear}</button>
              <button onClick={doReopen} disabled={busy} style={btn('#FCEEEC', '#C0392B', busy)}>Reopen year {closeYear}</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default FinalAccounts;

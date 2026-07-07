import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

// Banking & Cash (Final Accounts Phase B) — the school's money locations.
//   · Accounts strip: petty cash / bank / M-PESA with live GL balances
//   · Record transfer: move money between accounts (petty-cash top-up,
//     M-PESA sweep) — posts a balanced GL journal via record_bank_transfer()
//   · Cashbook: per-account chronological in/out with opening + running
//     balance (get_cashbook()), letterhead print + CSV
// Collections land here automatically: fee payments default to the kind's
// default account by method, and the fee→GL bridge posts the CASH leg to it.

const KIND_META = {
  petty_cash: { label: 'Petty Cash', icon: '💵', color: '#B4690E', bg: '#FDF6EC' },
  bank:       { label: 'Bank',       icon: '🏦', color: '#1A5F9C', bg: '#F4F9FE' },
  mpesa:      { label: 'M-PESA',     icon: '📱', color: '#1B6B3A', bg: '#E8F5EE' },
};

const SOURCE_LABEL = {
  fees: 'Fee collection', bank_transfer: 'Transfer', manual: 'Journal',
};

const fmt = (n) => Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const todayISO = () => new Date().toISOString().slice(0, 10);
const monthStartISO = () => todayISO().slice(0, 8) + '01';

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
    <p class="sub">${title} · generated ${new Date().toLocaleString()} · EduConnect KE</p>
    <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
    <div class="noprint" style="margin-top:16px;text-align:center;">
      <button onclick="window.print()" style="padding:8px 22px;">Print</button>
    </div>
  </body></html>`);
  w.document.close();
  w.focus();
}

const Banking = ({ schoolConfig }) => {
  const [accounts, setAccounts] = useState([]);
  const [balances, setBalances] = useState({});   // gl_account_id → Dr − Cr
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  // Transfer form
  const [showTransfer, setShowTransfer] = useState(false);
  const [tFrom, setTFrom] = useState('');
  const [tTo, setTTo] = useState('');
  const [tAmount, setTAmount] = useState('');
  const [tDate, setTDate] = useState(todayISO());
  const [tMemo, setTMemo] = useState('');
  const [tBusy, setTBusy] = useState(false);
  const [tMsg, setTMsg] = useState('');

  // Cashbook
  const [cbAccount, setCbAccount] = useState('');
  const [cbFrom, setCbFrom] = useState(monthStartISO());
  const [cbTo, setCbTo] = useState(todayISO());
  const [cashbook, setCashbook] = useState(null);   // { opening_balance, entries }
  const [cbLoading, setCbLoading] = useState(false);

  const load = useCallback(async () => {
    if (!schoolConfig?.id) return;
    setLoading(true);
    setErr('');
    const [{ data: accs, error: aErr }, { data: tb }] = await Promise.all([
      supabase.from('bank_accounts')
        .select('id, name, kind, bank_name, branch, account_no, gl_account_id, is_default, is_active')
        .eq('school_id', schoolConfig.id).order('kind').order('created_at'),
      supabase.rpc('get_gl_trial_balance', { p_school_id: schoolConfig.id }),
    ]);
    if (aErr) { setErr(aErr.message); setLoading(false); return; }
    setAccounts(accs || []);
    const map = {};
    (Array.isArray(tb) ? tb : []).forEach(r => {
      map[r.account_id] = Number(r.debits || 0) - Number(r.credits || 0);
    });
    setBalances(map);
    if (!cbAccount && accs?.length) setCbAccount(accs[0].id);
    setLoading(false);
  }, [schoolConfig?.id, cbAccount]);

  useEffect(() => { load(); }, [load]);

  const loadCashbook = useCallback(async () => {
    if (!schoolConfig?.id || !cbAccount) return;
    setCbLoading(true);
    const { data, error } = await supabase.rpc('get_cashbook', {
      p_school_id: schoolConfig.id,
      p_bank_account_id: cbAccount,
      p_from: cbFrom || null,
      p_to: cbTo || null,
    });
    setCbLoading(false);
    if (error) { setErr(error.message); setCashbook(null); return; }
    setCashbook(data);
  }, [schoolConfig?.id, cbAccount, cbFrom, cbTo]);

  useEffect(() => { loadCashbook(); }, [loadCashbook]);

  const submitTransfer = async () => {
    const amount = parseFloat(tAmount);
    if (!tFrom || !tTo) { setTMsg('Pick both accounts.'); return; }
    if (tFrom === tTo) { setTMsg('Choose two different accounts.'); return; }
    if (!amount || amount <= 0) { setTMsg('Enter an amount greater than zero.'); return; }
    setTBusy(true);
    setTMsg('');
    const { data, error } = await supabase.rpc('record_bank_transfer', {
      p_school_id: schoolConfig.id,
      p_from_id: tFrom, p_to_id: tTo,
      p_amount: amount, p_date: tDate || null,
      p_memo: tMemo.trim() || null,
    });
    setTBusy(false);
    if (error) { setTMsg(error.message); return; }
    setTMsg(`Done — posted ${data.journal_no}.`);
    setTAmount(''); setTMemo('');
    load();
    loadCashbook();
  };

  const activeAccounts = accounts.filter(a => a.is_active);
  const cbAcc = accounts.find(a => a.id === cbAccount);
  const entries = cashbook?.entries || [];
  const closing = entries.length
    ? Number(entries[entries.length - 1].balance)
    : Number(cashbook?.opening_balance || 0);

  const cashbookHeaders = ['Date', 'Journal', 'Source', 'Details', 'Money In', 'Money Out', 'Balance'];
  const cashbookRows = () => {
    const rows = [[cbFrom || '—', '', '', 'Opening balance', '', '', fmt(cashbook?.opening_balance)]];
    entries.forEach(e => rows.push([
      e.entry_date, e.journal_no, SOURCE_LABEL[e.source_type] || e.source_type,
      e.narration || '', Number(e.money_in) ? fmt(e.money_in) : '',
      Number(e.money_out) ? fmt(e.money_out) : '', fmt(e.balance),
    ]));
    rows.push([cbTo || '—', '', '', 'Closing balance', '', '', fmt(closing)]);
    return rows;
  };
  const cashbookTitle = () =>
    `Cashbook — ${cbAcc?.name || ''} (${cbFrom || 'start'} to ${cbTo || 'today'})`;

  const card = { background: '#fff', border: '1px solid #E8EAF0', borderRadius: 12, padding: 20, marginBottom: 16 };
  const lblStyle = { display: 'block', fontSize: 10, fontWeight: 800, color: '#8a8fa8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' };
  const inputStyle = { padding: '8px 10px', borderRadius: 8, border: '1px solid #e6dfd8', fontSize: 13, color: '#2a2421', background: '#fff', boxSizing: 'border-box' };
  const btn = (bg, color, disabled) => ({ padding: '9px 16px', background: disabled ? '#8a8fa8' : bg, border: 'none', borderRadius: 8, fontSize: 13, color, fontWeight: 700, cursor: disabled ? 'default' : 'pointer' });

  return (
    <div style={{ paddingBottom: 40, maxWidth: 1080 }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#2a2421' }}>Banking & Cash</h2>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: '#8A8FA8' }}>
          Where the school's money sits. Fee collections land in the right account automatically by payment method.
        </p>
      </div>

      {err && (
        <div style={{ ...card, background: '#FCEEEC', border: '1px solid #F3C9C3', color: '#C0392B', fontSize: 12.5, fontWeight: 600 }}>{err}</div>
      )}

      {loading ? (
        <div style={{ color: '#8A8FA8', fontSize: 13 }}>Loading…</div>
      ) : (
        <>
          {/* Account cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
            {accounts.map(a => {
              const meta = KIND_META[a.kind] || KIND_META.bank;
              const bal = balances[a.gl_account_id] ?? 0;
              return (
                <div key={a.id} style={{ ...card, marginBottom: 0, opacity: a.is_active ? 1 : 0.5 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 18 }}>{meta.icon}</span>
                    <span style={{ fontSize: 13.5, fontWeight: 800, color: '#2a2421', flex: 1 }}>{a.name}</span>
                    {a.is_default && (
                      <span style={{ fontSize: 9.5, fontWeight: 800, color: meta.color, background: meta.bg, padding: '2px 8px', borderRadius: 999 }}>DEFAULT</span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: '#8A8FA8', marginBottom: 10 }}>
                    {meta.label}{a.account_no ? ` · ${a.account_no}` : ''}{a.bank_name ? ` · ${a.bank_name}` : ''}
                  </div>
                  <div style={{ fontFamily: 'monospace', fontSize: 19, fontWeight: 800, color: bal < 0 ? '#C0392B' : '#2a2421' }}>
                    {fmt(bal)}
                  </div>
                  <div style={{ fontSize: 10, color: '#8A8FA8', marginTop: 2 }}>KES · per general ledger</div>
                </div>
              );
            })}
          </div>

          {/* Transfer */}
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#2a2421' }}>Move money between accounts</div>
                <div style={{ fontSize: 12, color: '#8A8FA8', marginTop: 2 }}>
                  Petty-cash top-ups, M-PESA sweeps to the bank, cash banking — posts straight to the ledger.
                </div>
              </div>
              {!showTransfer && (
                <button onClick={() => { setShowTransfer(true); setTMsg(''); }} style={btn('#1A5F9C', '#fff')}>
                  Record transfer
                </button>
              )}
            </div>
            {showTransfer && (
              <div style={{ marginTop: 16, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ minWidth: 170 }}>
                  <label style={lblStyle}>From</label>
                  <select value={tFrom} onChange={(e) => setTFrom(e.target.value)} style={{ ...inputStyle, width: '100%', cursor: 'pointer' }}>
                    <option value="">Select…</option>
                    {activeAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div style={{ minWidth: 170 }}>
                  <label style={lblStyle}>To</label>
                  <select value={tTo} onChange={(e) => setTTo(e.target.value)} style={{ ...inputStyle, width: '100%', cursor: 'pointer' }}>
                    <option value="">Select…</option>
                    {activeAccounts.filter(a => a.id !== tFrom).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div style={{ width: 130 }}>
                  <label style={lblStyle}>Amount (KES)</label>
                  <input type="number" min="0" step="0.01" value={tAmount} onChange={(e) => setTAmount(e.target.value)}
                    style={{ ...inputStyle, width: '100%', fontFamily: 'monospace', textAlign: 'right' }} />
                </div>
                <div style={{ width: 150 }}>
                  <label style={lblStyle}>Date</label>
                  <input type="date" value={tDate} onChange={(e) => setTDate(e.target.value)} style={{ ...inputStyle, width: '100%' }} />
                </div>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <label style={lblStyle}>Memo (optional)</label>
                  <input value={tMemo} onChange={(e) => setTMemo(e.target.value)} placeholder="e.g. Weekly petty cash top-up"
                    style={{ ...inputStyle, width: '100%' }} />
                </div>
                <button onClick={submitTransfer} disabled={tBusy} style={btn('#1A5F9C', '#fff', tBusy)}>
                  {tBusy ? 'Posting…' : 'Post transfer'}
                </button>
                <button onClick={() => { setShowTransfer(false); setTMsg(''); }} disabled={tBusy} style={btn('#F1F0F5', '#4A4A6A', tBusy)}>
                  Close
                </button>
              </div>
            )}
            {tMsg && (
              <div style={{ marginTop: 10, fontSize: 12.5, fontWeight: 600, color: tMsg.startsWith('Done') ? '#1B6B3A' : '#C0392B' }}>{tMsg}</div>
            )}
          </div>

          {/* Cashbook */}
          <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #E8EAF0', display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#2a2421' }}>Cashbook</div>
                <div style={{ fontSize: 12, color: '#8A8FA8', marginTop: 2 }}>Every shilling in and out, with a running balance.</div>
              </div>
              <div style={{ minWidth: 180 }}>
                <label style={lblStyle}>Account</label>
                <select value={cbAccount} onChange={(e) => setCbAccount(e.target.value)} style={{ ...inputStyle, width: '100%', cursor: 'pointer' }}>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <label style={lblStyle}>From</label>
                <input type="date" value={cbFrom} onChange={(e) => setCbFrom(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={lblStyle}>To</label>
                <input type="date" value={cbTo} onChange={(e) => setCbTo(e.target.value)} style={inputStyle} />
              </div>
              <button onClick={() => downloadCsv(`cashbook-${(cbAcc?.name || 'account').replace(/\s+/g, '-').toLowerCase()}-${cbFrom}-to-${cbTo}.csv`, cashbookHeaders, cashbookRows())}
                disabled={!cashbook} style={btn('#F4F9FE', '#1A5F9C', !cashbook)}>
                ⬇ CSV
              </button>
              <button onClick={() => printTable(schoolConfig?.school_name, cashbookTitle(), cashbookHeaders, cashbookRows())}
                disabled={!cashbook} style={btn('#F4F9FE', '#1A5F9C', !cashbook)}>
                🖨 Print
              </button>
            </div>

            {cbLoading ? (
              <div style={{ padding: 20, color: '#8A8FA8', fontSize: 13 }}>Loading…</div>
            ) : !cashbook ? (
              <div style={{ padding: 20, color: '#8A8FA8', fontSize: 13 }}>Pick an account to see its cashbook.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC' }}>
                      {cashbookHeaders.map((h, i) => (
                        <th key={h} style={{ padding: '8px 14px', textAlign: i >= 4 ? 'right' : 'left', fontSize: 10, fontWeight: 800, color: '#8a8fa8', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #E8EAF0' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ background: '#FDFBF7' }}>
                      <td style={{ padding: '8px 14px', color: '#8A8FA8' }}>{cbFrom || '—'}</td>
                      <td colSpan={3} style={{ padding: '8px 14px', fontWeight: 700, color: '#4A4A6A' }}>Opening balance</td>
                      <td /><td />
                      <td style={{ padding: '8px 14px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>{fmt(cashbook.opening_balance)}</td>
                    </tr>
                    {entries.map((e, i) => (
                      <tr key={i} style={{ borderTop: '1px solid #F1F0F5' }}>
                        <td style={{ padding: '7px 14px', whiteSpace: 'nowrap' }}>{e.entry_date}</td>
                        <td style={{ padding: '7px 14px', fontFamily: 'monospace', fontSize: 11.5, whiteSpace: 'nowrap' }}>{e.journal_no}</td>
                        <td style={{ padding: '7px 14px', whiteSpace: 'nowrap' }}>{SOURCE_LABEL[e.source_type] || e.source_type}</td>
                        <td style={{ padding: '7px 14px', color: '#4A4A6A' }}>{e.narration || ''}</td>
                        <td style={{ padding: '7px 14px', textAlign: 'right', fontFamily: 'monospace', color: '#1B6B3A' }}>{Number(e.money_in) ? fmt(e.money_in) : ''}</td>
                        <td style={{ padding: '7px 14px', textAlign: 'right', fontFamily: 'monospace', color: '#C0392B' }}>{Number(e.money_out) ? fmt(e.money_out) : ''}</td>
                        <td style={{ padding: '7px 14px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>{fmt(e.balance)}</td>
                      </tr>
                    ))}
                    <tr style={{ background: '#FDFBF7', borderTop: '1px solid #E8EAF0' }}>
                      <td style={{ padding: '8px 14px', color: '#8A8FA8' }}>{cbTo || '—'}</td>
                      <td colSpan={3} style={{ padding: '8px 14px', fontWeight: 700, color: '#4A4A6A' }}>Closing balance</td>
                      <td /><td />
                      <td style={{ padding: '8px 14px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 800 }}>{fmt(closing)}</td>
                    </tr>
                    {!entries.length && (
                      <tr>
                        <td colSpan={7} style={{ padding: '16px 14px', color: '#8A8FA8', textAlign: 'center' }}>
                          No movements in this period.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default Banking;

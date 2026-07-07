import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';

// Pocket Money — student personal (custodial) accounts. Deposits from
// parents, withdrawals by students, running balances and statements.
// Deliberately separate from school fee finances: different tables, no
// contact with invoices, the fee ledger, or finance reports.

const GRADES_BY_LEVEL = {
  "Pre-Primary": ["PP1", "PP2"],
  "Primary": ["Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6"],
  "Junior Secondary": ["Grade 7", "Grade 8", "Grade 9"],
  "Senior Secondary": ["Grade 10", "Grade 11", "Grade 12"]
};
const GRADE_NAME_TO_CODE = {
  "PP1": "pp1", "PP2": "pp2",
  "Grade 1": "g1", "Grade 2": "g2", "Grade 3": "g3", "Grade 4": "g4", "Grade 5": "g5", "Grade 6": "g6",
  "Grade 7": "g7", "Grade 8": "g8", "Grade 9": "g9",
  "Grade 10": "g10", "Grade 11": "g11", "Grade 12": "g12"
};
const GRADE_CODE_TO_NAME = Object.fromEntries(Object.entries(GRADE_NAME_TO_CODE).map(([k, v]) => [v, k]));

const sName = (s) => s ? `${s.first_name || ''} ${s.last_name || ''}`.trim() : '—';
const kes = (n) => Math.round(Number(n) || 0).toLocaleString();

const PocketMoney = ({ schoolConfig }) => {
  const [activeTab, setActiveTab] = useState('balances');
  const [students, setStudents] = useState([]);
  const [txns, setTxns] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLevel, setSelectedLevel] = useState('Senior Secondary');
  const [selectedGrade, setSelectedGrade] = useState('all');

  // Deposit / withdraw modal
  const [txnModal, setTxnModal] = useState(null); // { student, kind }
  const [txnForm, setTxnForm] = useState({ amount: '', method: 'cash', reference: '', party: '', notes: '' });
  const [isSavingTxn, setIsSavingTxn] = useState(false);

  useEffect(() => {
    if (schoolConfig?.id) loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolConfig?.id]);

  const loadAll = async () => {
    setIsLoading(true);
    try {
      const [studs, tx] = await Promise.all([
        supabase.from('students').select('id, adm_no, first_name, last_name, level_id, stream_id')
          .eq('school_id', schoolConfig.id),
        supabase.from('pocket_money_txns').select('*')
          .eq('school_id', schoolConfig.id)
          .order('txn_at', { ascending: false }),
      ]);
      if (studs.error) throw studs.error;
      if (tx.error) throw tx.error;
      setStudents(studs.data || []);
      setTxns(tx.data || []);
    } catch (err) {
      console.error('Pocket money load failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const studentById = useMemo(() => Object.fromEntries(students.map(s => [s.id, s])), [students]);

  const balanceByStudent = useMemo(() => {
    const m = {};
    txns.forEach(t => {
      if (t.status !== 'active') return;
      m[t.student_id] = (m[t.student_id] || 0) + (t.kind === 'deposit' ? Number(t.amount) : -Number(t.amount));
    });
    return m;
  }, [txns]);

  const stats = useMemo(() => {
    const balances = Object.values(balanceByStudent).filter(v => v > 0.005);
    const today = new Date().toDateString();
    let depToday = 0, wdToday = 0;
    txns.forEach(t => {
      if (t.status !== 'active') return;
      if (new Date(t.txn_at).toDateString() !== today) return;
      if (t.kind === 'deposit') depToday += Number(t.amount); else wdToday += Number(t.amount);
    });
    return {
      held: balances.reduce((s, v) => s + v, 0),
      holders: balances.length,
      depToday, wdToday,
    };
  }, [balanceByStudent, txns]);

  const filteredStudents = useMemo(() => {
    const q = searchTerm.toLowerCase();
    const levelGrades = GRADES_BY_LEVEL[selectedLevel].map(n => GRADE_NAME_TO_CODE[n]);
    const target = selectedGrade === 'all' ? null : GRADE_NAME_TO_CODE[selectedGrade];
    return students
      .filter(s => (sName(s).toLowerCase().includes(q) || (s.adm_no || '').toLowerCase().includes(q))
        && levelGrades.includes(s.level_id)
        && (target ? s.level_id === target : true))
      .map(s => ({ ...s, balance: balanceByStudent[s.id] || 0 }))
      .sort((a, b) => b.balance - a.balance);
  }, [students, balanceByStudent, searchTerm, selectedLevel, selectedGrade]);

  const filteredTxns = useMemo(() => {
    const q = searchTerm.toLowerCase();
    return txns.filter(t => {
      const s = studentById[t.student_id];
      return sName(s).toLowerCase().includes(q)
        || (s?.adm_no || '').toLowerCase().includes(q)
        || (t.reference || '').toLowerCase().includes(q);
    });
  }, [txns, studentById, searchTerm]);

  const openTxnModal = (student, kind) => {
    setTxnForm({ amount: '', method: kind === 'deposit' ? 'mpesa' : 'cash', reference: '', party: '', notes: '' });
    setTxnModal({ student, kind });
  };

  const handleSaveTxn = async () => {
    const amount = parseFloat(txnForm.amount);
    if (!amount || amount <= 0) { alert('Enter a valid amount.'); return; }
    setIsSavingTxn(true);
    try {
      const { error } = await supabase.rpc('record_pocket_txn', {
        p_school_id: schoolConfig.id,
        p_student_id: txnModal.student.id,
        p_kind: txnModal.kind,
        p_amount: amount,
        p_method: txnForm.method || null,
        p_reference: txnForm.reference.trim() || null,
        p_party: txnForm.party.trim() || null,
        p_notes: txnForm.notes.trim() || null,
      });
      if (error) throw error;
      await loadAll();
      setTxnModal(null);
    } catch (err) {
      alert((err.message || '').includes('row-level security')
        ? 'Your sign-in session appears to have expired. Refresh the page and try again.'
        : err.message);
    } finally {
      setIsSavingTxn(false);
    }
  };

  const handleVoidTxn = async (t) => {
    const s = studentById[t.student_id];
    const reason = window.prompt(`Void this ${t.kind} of KES ${kes(t.amount)} for ${sName(s)}?\n\nEnter the void reason (required):`);
    if (reason === null) return;
    try {
      const { error } = await supabase.rpc('void_pocket_txn', { p_txn_id: t.id, p_reason: reason });
      if (error) throw error;
      await loadAll();
    } catch (err) {
      alert(err.message);
    }
  };

  // Letterheaded statement: chronological with running balance.
  const printStatement = async (s) => {
    let info = {};
    try {
      const { data } = await supabase.from('school_information')
        .select('logo_url, motto, principal_name')
        .eq('school_id', schoolConfig.id).maybeSingle();
      info = data || {};
    } catch { /* optional */ }

    const list = txns
      .filter(t => t.student_id === s.id && t.status === 'active')
      .sort((a, b) => new Date(a.txn_at) - new Date(b.txn_at));
    let running = 0;
    const rows = list.map(t => {
      running += t.kind === 'deposit' ? Number(t.amount) : -Number(t.amount);
      return `<tr>
        <td>${new Date(t.txn_at).toLocaleString()}</td>
        <td>${t.kind === 'deposit' ? 'Deposit' : 'Withdrawal'}${t.party ? ` — ${t.kind === 'deposit' ? 'from' : 'to'} ${t.party}` : ''}${t.method ? ` · ${t.method.toUpperCase()}` : ''}${t.reference ? ` · ${t.reference}` : ''}${t.notes ? ` · ${t.notes}` : ''}</td>
        <td class="num">${t.kind === 'deposit' ? kes(t.amount) : ''}</td>
        <td class="num">${t.kind === 'withdrawal' ? kes(t.amount) : ''}</td>
        <td class="num">${kes(running)}</td>
      </tr>`;
    }).join('');
    const contact1 = [schoolConfig?.address, [schoolConfig?.subCounty, schoolConfig?.county].filter(Boolean).join(', ')].filter(Boolean).join(' · ');
    const contact2 = [schoolConfig?.phone ? `Tel: ${schoolConfig.phone}` : '', schoolConfig?.email ? `Email: ${schoolConfig.email}` : ''].filter(Boolean).join(' · ');

    const w = window.open('', '_blank');
    if (!w) { alert('Allow pop-ups to print the statement.'); return; }
    w.document.write(`<!doctype html><html><head><title>Pocket Money Statement — ${sName(s)}</title><style>
      body { font-family: Arial, sans-serif; font-size: 12px; color: #111; margin: 26px; }
      .letterhead { display: flex; align-items: center; gap: 18px; justify-content: center; }
      .letterhead img { width: 68px; height: 68px; object-fit: contain; }
      .lh-text { text-align: center; }
      .lh-text h2 { margin: 0; font-size: 19px; text-transform: uppercase; letter-spacing: 0.5px; }
      .lh-line { color: #333; font-size: 11px; margin-top: 2px; }
      .motto { font-style: italic; color: #555; font-size: 11px; margin-top: 3px; }
      .lh-rule { border: none; border-top: 3px double #333; margin: 10px 0 8px; }
      .doc-title { text-align: center; font-weight: bold; letter-spacing: 1.5px; margin: 0 0 12px; font-size: 13px; }
      .who { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 6px; padding: 8px 10px; background: #f7f7f7; border: 1px solid #ddd; border-radius: 6px; margin-bottom: 12px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #bbb; padding: 4px 7px; text-align: left; }
      th { background: #f0f0f0; font-size: 9.5px; text-transform: uppercase; }
      .num { text-align: right; font-family: 'Courier New', monospace; white-space: nowrap; }
      .closing { margin-top: 10px; padding: 9px 12px; border: 1.5px solid #333; border-radius: 6px; display: flex; justify-content: space-between; font-weight: bold; font-size: 13px; }
      .sig { margin-top: 26px; display: flex; justify-content: space-between; gap: 30px; font-size: 11px; }
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
      <p class="doc-title">STUDENT POCKET MONEY STATEMENT</p>
      <div class="who">
        <span><strong>${sName(s)}</strong> · ADM ${s.adm_no}</span>
        <span>${GRADE_CODE_TO_NAME[s.level_id] || s.level_id}</span>
        <span>Statement date: ${new Date().toLocaleDateString()}</span>
      </div>
      <table>
        <thead><tr><th>Date</th><th>Particulars</th><th class="num">Deposits (KES)</th><th class="num">Withdrawals</th><th class="num">Balance</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5">No transactions recorded.</td></tr>'}</tbody>
      </table>
      <div class="closing"><span>CURRENT BALANCE</span><span>KES ${kes(balanceByStudent[s.id] || 0)}</span></div>
      <div class="sig">
        <div>Prepared by (Finance Office)</div>
        <div>Parent / Guardian</div>
      </div>
      <p class="foot">Pocket money is held in trust for the student and is separate from school fees. Generated via EduConnect KE · ${new Date().toLocaleString()}</p>
      <div class="noprint" style="text-align:center;margin-top:16px;">
        <button onclick="window.print()" style="padding:8px 24px;">Print / Save as PDF</button>
      </div>
    </body></html>`);
    w.document.close();
    w.focus();
  };

  const tabStyle = (active) => ({
    padding: '10px 4px', fontSize: 14, fontWeight: 700,
    color: active ? '#1B6B3A' : '#8A8FA8',
    borderBottom: active ? '2px solid #1B6B3A' : '2px solid transparent',
    cursor: 'pointer', whiteSpace: 'nowrap',
  });

  return (
    <div style={{ paddingBottom: 40 }}>
      <div style={{ background: '#fff', border: '1px solid #e6dfd8', borderRadius: 12, padding: '18px 22px', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#1A1A2E' }}>👛 Pocket Money</h3>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: '#8A8FA8', lineHeight: 1.5 }}>
          Students' personal money held in trust — deposits from parents, withdrawals by students.
          Kept completely separate from school fees: it never appears in fee balances, invoices or finance reports.
        </p>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
        {[['Total held in trust', stats.held, '#1A5F9C'],
          ['Students with balances', stats.holders, '#4A4A6A'],
          ["Today's deposits", stats.depToday, '#1B6B3A'],
          ["Today's withdrawals", stats.wdToday, '#C0392B']].map(([lbl, val, col]) => (
          <div key={lbl} style={{ background: '#fff', border: '1px solid #E8EAF0', borderRadius: 12, padding: '13px 16px' }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: '#8A8FA8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{lbl}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: col, marginTop: 4, fontFamily: lbl.includes('Students') ? 'inherit' : 'monospace' }}>
              {lbl.includes('Students') ? val : `KES ${kes(val)}`}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 20, marginBottom: 14, borderBottom: '1px solid #E8EAF0' }}>
        <div onClick={() => setActiveTab('balances')} style={tabStyle(activeTab === 'balances')}>Balances</div>
        <div onClick={() => setActiveTab('transactions')} style={tabStyle(activeTab === 'transactions')}>Transactions</div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text" placeholder={activeTab === 'balances' ? 'Search student…' : 'Search transactions…'}
          value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
          style={{ flex: 1, minWidth: 200, padding: '10px 14px', borderRadius: 8, border: '1px solid #E8EAF0', fontSize: 13, outline: 'none' }}
        />
        {activeTab === 'balances' && (
          <>
            <select value={selectedLevel} onChange={(e) => { setSelectedLevel(e.target.value); setSelectedGrade('all'); }}
              style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #E8EAF0', fontSize: 13, background: '#fff' }}>
              {Object.keys(GRADES_BY_LEVEL).map(l => <option key={l} value={l}>{l}</option>)}
            </select>
            <select value={selectedGrade} onChange={(e) => setSelectedGrade(e.target.value)}
              style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #E8EAF0', fontSize: 13, background: '#fff' }}>
              <option value="all">All {selectedLevel}</option>
              {GRADES_BY_LEVEL[selectedLevel].map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </>
        )}
      </div>

      <div style={{ background: '#fff', border: '1px solid #E8EAF0', borderRadius: 12, overflow: 'hidden' }}>
        {isLoading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#8A8FA8', fontSize: 13 }}>Loading…</div>
        ) : activeTab === 'balances' ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ background: '#FAFBFC', borderBottom: '1px solid #E8EAF0' }}>
              <tr>
                <th style={th}>ADM No.</th>
                <th style={th}>Student</th>
                <th style={th}>Balance</th>
                <th style={th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.length === 0 ? (
                <tr><td colSpan="4" style={{ textAlign: 'center', padding: 30, color: '#8A8FA8' }}>No students match this filter.</td></tr>
              ) : filteredStudents.slice(0, 100).map((s, idx) => (
                <tr key={s.id} style={{ borderBottom: '1px solid #F7F8FA', background: idx % 2 === 0 ? '#fff' : '#FAFBFC' }}>
                  <td style={{ padding: '12px 18px', fontWeight: 600, color: '#1A5F9C' }}>{s.adm_no}</td>
                  <td style={{ padding: '12px 18px', fontWeight: 700, color: '#1A1A2E' }}>{sName(s)}</td>
                  <td style={{ padding: '12px 18px', fontFamily: 'monospace', fontWeight: 800, color: s.balance > 0.005 ? '#1B6B3A' : '#8A8FA8' }}>
                    KES {kes(s.balance)}
                  </td>
                  <td style={{ padding: '12px 18px', whiteSpace: 'nowrap' }}>
                    <button onClick={() => openTxnModal(s, 'deposit')}
                      style={{ padding: '5px 12px', background: '#1B6B3A', border: 'none', borderRadius: 6, fontSize: 11, color: '#fff', fontWeight: 700, cursor: 'pointer', marginRight: 6 }}>
                      + Deposit
                    </button>
                    <button onClick={() => openTxnModal(s, 'withdrawal')} disabled={s.balance <= 0.005}
                      title={s.balance <= 0.005 ? 'No balance to withdraw' : ''}
                      style={{ padding: '5px 12px', background: '#fff', border: '1px solid #C0392B', borderRadius: 6, fontSize: 11, color: '#C0392B', fontWeight: 700, cursor: s.balance <= 0.005 ? 'default' : 'pointer', opacity: s.balance <= 0.005 ? 0.45 : 1, marginRight: 6 }}>
                      − Withdraw
                    </button>
                    <button onClick={() => printStatement(s)}
                      style={{ padding: '5px 12px', background: '#fff', border: '1px solid #1A5F9C', borderRadius: 6, fontSize: 11, color: '#1A5F9C', fontWeight: 700, cursor: 'pointer' }}>
                      🧾 Statement
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ background: '#FAFBFC', borderBottom: '1px solid #E8EAF0' }}>
              <tr>
                <th style={th}>Date</th>
                <th style={th}>Student</th>
                <th style={th}>Type</th>
                <th style={th}>Amount</th>
                <th className="hide-mobile" style={th}>Details</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {filteredTxns.length === 0 ? (
                <tr><td colSpan="6" style={{ textAlign: 'center', padding: 30, color: '#8A8FA8' }}>No transactions yet.</td></tr>
              ) : filteredTxns.slice(0, 200).map((t, idx) => {
                const s = studentById[t.student_id];
                const voided = t.status === 'voided';
                const isDep = t.kind === 'deposit';
                return (
                  <tr key={t.id} style={{ borderBottom: '1px solid #F7F8FA', background: idx % 2 === 0 ? '#fff' : '#FAFBFC', opacity: voided ? 0.6 : 1 }}>
                    <td style={{ padding: '11px 16px', color: '#4A4A6A', whiteSpace: 'nowrap' }}>{new Date(t.txn_at).toLocaleString()}</td>
                    <td style={{ padding: '11px 16px', fontWeight: 700, color: '#1A1A2E' }}>{sName(s)} <span style={{ color: '#8A8FA8', fontWeight: 400 }}>{s?.adm_no}</span></td>
                    <td style={{ padding: '11px 16px' }}>
                      <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: 10, fontWeight: 800, background: isDep ? '#E8F5EE' : '#FDF0ED', color: isDep ? '#1B6B3A' : '#C0392B' }}>
                        {isDep ? '↓ DEPOSIT' : '↑ WITHDRAWAL'}
                      </span>
                    </td>
                    <td style={{ padding: '11px 16px', fontFamily: 'monospace', fontWeight: 700, color: voided ? '#8A8FA8' : (isDep ? '#1B6B3A' : '#C0392B'), textDecoration: voided ? 'line-through' : 'none' }}>
                      {kes(t.amount)}{voided && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 800, color: '#C0392B' }}>VOID</span>}
                    </td>
                    <td className="hide-mobile" style={{ padding: '11px 16px', color: '#4A4A6A', fontSize: 12 }}>
                      {[t.party, t.method?.toUpperCase(), t.reference, t.notes].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td style={{ padding: '11px 16px', textAlign: 'right' }}>
                      {!voided && (
                        <button onClick={() => handleVoidTxn(t)}
                          style={{ padding: '4px 10px', background: '#fff', border: '1px solid #C0392B', borderRadius: 6, fontSize: 11, color: '#C0392B', fontWeight: 700, cursor: 'pointer' }}>
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

      {/* Deposit / Withdraw modal */}
      {txnModal && (() => {
        const { student, kind } = txnModal;
        const isDep = kind === 'deposit';
        const bal = balanceByStudent[student.id] || 0;
        const amount = parseFloat(txnForm.amount) || 0;
        const after = bal + (isDep ? amount : -amount);
        return (
          <div onClick={() => !isSavingTxn && setTxnModal(null)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
            <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 24, width: '100%', maxWidth: 420, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 12px 40px rgba(0,0,0,0.2)' }}>
              <h3 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 800, color: '#2a2421' }}>
                {isDep ? '↓ Pocket Money Deposit' : '↑ Pocket Money Withdrawal'}
              </h3>
              <p style={{ margin: '0 0 12px', fontSize: 13, color: '#8A8FA8' }}>{sName(student)} · {student.adm_no}</p>

              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                {[['Current balance', bal, '#4A4A6A'], ['After this ' + kind, after, after < 0 ? '#C0392B' : '#1A5F9C']].map(([lbl, val, col]) => (
                  <div key={lbl} style={{ flex: 1, padding: '8px 10px', background: '#F8FAFC', border: '1px solid #E8EAF0', borderRadius: 8, textAlign: 'center' }}>
                    <div style={{ fontSize: 9.5, fontWeight: 800, color: '#8A8FA8', textTransform: 'uppercase' }}>{lbl}</div>
                    <div style={{ fontSize: 14, fontWeight: 800, fontFamily: 'monospace', color: col, marginTop: 2 }}>{kes(val)}</div>
                  </div>
                ))}
              </div>
              {!isDep && after < -0.005 && (
                <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 8, background: '#FDF0ED', border: '1px solid #C0392B', fontSize: 12, color: '#C0392B', fontWeight: 600 }}>
                  Exceeds the available balance — the system will refuse this withdrawal.
                </div>
              )}

              <label style={lbl}>Amount (KES)</label>
              <input type="number" min="0" autoFocus value={txnForm.amount} placeholder="0"
                onChange={(e) => setTxnForm({ ...txnForm, amount: e.target.value })} style={inp} />

              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={lbl}>Method</label>
                  <select value={txnForm.method} onChange={(e) => setTxnForm({ ...txnForm, method: e.target.value })} style={inp}>
                    <option value="cash">Cash</option>
                    <option value="mpesa">M-Pesa</option>
                    <option value="bank">Bank</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={lbl}>Reference (optional)</label>
                  <input type="text" value={txnForm.reference} placeholder="e.g. M-Pesa code"
                    onChange={(e) => setTxnForm({ ...txnForm, reference: e.target.value })} style={inp} />
                </div>
              </div>

              <label style={lbl}>{isDep ? 'Deposited by' : 'Received by (student/guardian)'}</label>
              <input type="text" value={txnForm.party} placeholder={isDep ? "e.g. parent's name" : 'e.g. the student'}
                onChange={(e) => setTxnForm({ ...txnForm, party: e.target.value })} style={inp} />

              <label style={lbl}>Notes (optional)</label>
              <input type="text" value={txnForm.notes} placeholder={isDep ? 'e.g. for shopping day' : 'e.g. school trip shopping'}
                onChange={(e) => setTxnForm({ ...txnForm, notes: e.target.value })} style={inp} />

              <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
                <button onClick={() => setTxnModal(null)} style={{ flex: 1, padding: 12, background: '#fff', border: '1px solid #e6dfd8', borderRadius: 10, fontWeight: 600, color: '#8a8fa8', cursor: 'pointer' }}>Cancel</button>
                <button onClick={handleSaveTxn} disabled={isSavingTxn}
                  style={{ flex: 1, padding: 12, background: isSavingTxn ? '#8a8fa8' : (isDep ? '#1B6B3A' : '#C0392B'), border: 'none', borderRadius: 10, fontWeight: 700, color: '#fff', cursor: isSavingTxn ? 'wait' : 'pointer' }}>
                  {isSavingTxn ? 'Saving…' : (isDep ? 'Record Deposit' : 'Record Withdrawal')}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

const th = { padding: '12px 18px', textAlign: 'left', fontWeight: 700, color: '#8A8FA8', fontSize: 11, textTransform: 'uppercase' };
const lbl = { display: 'block', fontSize: 12, fontWeight: 700, color: '#4A4A6A', margin: '12px 0 6px', textTransform: 'uppercase', letterSpacing: '0.04em' };
const inp = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e6dfd8', fontSize: 14, outline: 'none', boxSizing: 'border-box', background: '#fafafa' };

export default PocketMoney;

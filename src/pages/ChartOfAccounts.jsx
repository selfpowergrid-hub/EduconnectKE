import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

// Chart of Accounts — the General Ledger's account list (Final Accounts Phase A).
// View the seeded Kenyan-school chart, rename accounts, add expense heads, and
// deactivate ones no longer used. System accounts (referenced by the fee→GL
// bridge and reports) can be renamed but not deleted or retyped — enforced by
// the gl_accounts_protect trigger; the UI just reflects that.
//
// A live "GL balanced" strip calls get_gl_trial_balance() so the bursar can see
// that every posted journal nets to zero (proves the fee-ledger bridge is clean).

const TYPE_META = {
  asset:     { label: 'Assets',      color: '#1A5F9C', bg: '#F4F9FE' },
  liability: { label: 'Liabilities', color: '#B4690E', bg: '#FDF6EC' },
  equity:    { label: 'Equity',      color: '#6B4FA0', bg: '#F6F3FB' },
  income:    { label: 'Income',      color: '#1B6B3A', bg: '#E8F5EE' },
  expense:   { label: 'Expenses',    color: '#C0392B', bg: '#FCEEEC' },
};
const TYPE_ORDER = ['asset', 'liability', 'equity', 'income', 'expense'];

const fmt = (n) => Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ChartOfAccounts = ({ schoolConfig }) => {
  const [accounts, setAccounts] = useState([]);
  const [totals, setTotals] = useState(null);   // { debits, credits } from trial balance
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const [editing, setEditing] = useState(null);   // account id being renamed
  const [editName, setEditName] = useState('');
  const [editCode, setEditCode] = useState('');

  const [adding, setAdding] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('expense');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!schoolConfig?.id) return;
    setLoading(true);
    setErr('');
    const [{ data: accs, error: aErr }, { data: tb, error: tErr }] = await Promise.all([
      supabase.from('gl_accounts').select('id, code, name, type, subtype, is_system, is_active')
        .eq('school_id', schoolConfig.id).order('code'),
      supabase.rpc('get_gl_trial_balance', { p_school_id: schoolConfig.id }),
    ]);
    if (aErr) { setErr(aErr.message); setLoading(false); return; }
    setAccounts(accs || []);
    if (!tErr && Array.isArray(tb)) {
      const d = tb.reduce((s, r) => s + Number(r.debits || 0), 0);
      const c = tb.reduce((s, r) => s + Number(r.credits || 0), 0);
      setTotals({ debits: d, credits: c });
    } else {
      setTotals(null);
    }
    setLoading(false);
  }, [schoolConfig?.id]);

  useEffect(() => { load(); }, [load]);

  const startEdit = (a) => { setEditing(a.id); setEditName(a.name); setEditCode(a.code); };
  const cancelEdit = () => { setEditing(null); setEditName(''); setEditCode(''); };

  const saveEdit = async (a) => {
    const name = editName.trim();
    const code = editCode.trim();
    if (!name || !code) return;
    setBusy(true);
    setErr('');
    const { error } = await supabase.from('gl_accounts')
      .update({ name, code }).eq('id', a.id);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    cancelEdit();
    load();
  };

  const toggleActive = async (a) => {
    setBusy(true);
    setErr('');
    const { error } = await supabase.from('gl_accounts')
      .update({ is_active: !a.is_active }).eq('id', a.id);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    load();
  };

  const deleteAccount = async (a) => {
    if (!window.confirm(`Delete account ${a.code} — ${a.name}?\n\nOnly possible if it has no ledger entries. If it has been used, deactivate it instead.`)) return;
    setBusy(true);
    setErr('');
    const { error } = await supabase.from('gl_accounts').delete().eq('id', a.id);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    load();
  };

  const addAccount = async () => {
    const code = newCode.trim();
    const name = newName.trim();
    if (!code || !name) { setErr('Give the new account a code and a name.'); return; }
    setBusy(true);
    setErr('');
    const { error } = await supabase.from('gl_accounts').insert({
      school_id: schoolConfig.id, code, name, type: newType, is_system: false, is_active: true,
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setAdding(false); setNewCode(''); setNewName(''); setNewType('expense');
    load();
  };

  const balanced = totals && Math.abs(totals.debits - totals.credits) < 0.005;

  const card = { background: '#fff', border: '1px solid #E8EAF0', borderRadius: 12, padding: 20, marginBottom: 16 };
  const lblStyle = { display: 'block', fontSize: 10, fontWeight: 800, color: '#8a8fa8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' };
  const inputStyle = { padding: '8px 10px', borderRadius: 8, border: '1px solid #e6dfd8', fontSize: 13, color: '#2a2421', background: '#fff', boxSizing: 'border-box' };
  const smallBtn = (bg, color) => ({ padding: '5px 10px', background: bg, border: 'none', borderRadius: 6, fontSize: 11.5, color, fontWeight: 700, cursor: busy ? 'default' : 'pointer' });

  return (
    <div>
      {/* Health strip */}
      <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={lblStyle}>General ledger</div>
          <div style={{ fontSize: 13, color: '#4A4A6A', lineHeight: 1.5 }}>
            {accounts.length} accounts. Every fee posting mirrors here automatically — this is the book the final accounts are built from.
          </div>
        </div>
        {totals && (
          <div style={{
            padding: '10px 16px', borderRadius: 10, minWidth: 220,
            background: balanced ? '#E8F5EE' : '#FCEEEC',
            border: `1px solid ${balanced ? '#BFE3CD' : '#F3C9C3'}`,
          }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: balanced ? '#1B6B3A' : '#C0392B' }}>
              {balanced ? '✓ GL balanced' : '⚠ GL out of balance'}
            </div>
            <div style={{ fontSize: 11.5, color: '#8A8FA8', fontFamily: 'monospace', marginTop: 3 }}>
              Dr {fmt(totals.debits)} · Cr {fmt(totals.credits)}
            </div>
          </div>
        )}
      </div>

      {err && (
        <div style={{ ...card, background: '#FCEEEC', border: '1px solid #F3C9C3', color: '#C0392B', fontSize: 12.5, fontWeight: 600 }}>{err}</div>
      )}

      {/* Add account */}
      <div style={{ marginBottom: 16 }}>
        {!adding ? (
          <button onClick={() => { setAdding(true); setErr(''); }}
            style={{ padding: '9px 16px', background: '#1A5F9C', border: 'none', borderRadius: 8, fontSize: 13, color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
            + Add account
          </button>
        ) : (
          <div style={{ ...card, marginBottom: 0, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ width: 100 }}>
              <label style={lblStyle}>Code</label>
              <input value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="5950"
                style={{ ...inputStyle, width: '100%', fontFamily: 'monospace' }} />
            </div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label style={lblStyle}>Name</label>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Examination Expenses"
                style={{ ...inputStyle, width: '100%' }} />
            </div>
            <div style={{ width: 150 }}>
              <label style={lblStyle}>Type</label>
              <select value={newType} onChange={(e) => setNewType(e.target.value)} style={{ ...inputStyle, width: '100%', cursor: 'pointer' }}>
                {TYPE_ORDER.map(t => <option key={t} value={t}>{TYPE_META[t].label.replace(/s$/, '')}</option>)}
              </select>
            </div>
            <button onClick={addAccount} disabled={busy}
              style={{ ...smallBtn('#1A5F9C', '#fff'), padding: '8px 16px', fontSize: 13 }}>
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => { setAdding(false); setErr(''); }} disabled={busy}
              style={{ ...smallBtn('#F1F0F5', '#4A4A6A'), padding: '8px 14px', fontSize: 13 }}>
              Cancel
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div style={{ color: '#8A8FA8', fontSize: 13 }}>Loading…</div>
      ) : (
        TYPE_ORDER.map(type => {
          const rows = accounts.filter(a => a.type === type);
          if (!rows.length) return null;
          const meta = TYPE_META[type];
          return (
            <div key={type} style={{ ...card, padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '10px 16px', background: meta.bg, borderBottom: '1px solid #E8EAF0' }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: meta.color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{meta.label}</span>
              </div>
              {rows.map((a, i) => (
                <div key={a.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
                  borderBottom: i < rows.length - 1 ? '1px solid #F1F0F5' : 'none',
                  opacity: a.is_active ? 1 : 0.5,
                }}>
                  {editing === a.id ? (
                    <>
                      <input value={editCode} onChange={(e) => setEditCode(e.target.value)}
                        style={{ ...inputStyle, width: 80, fontFamily: 'monospace' }} />
                      <input value={editName} onChange={(e) => setEditName(e.target.value)}
                        style={{ ...inputStyle, flex: 1 }} />
                      <button onClick={() => saveEdit(a)} disabled={busy} style={smallBtn('#1A5F9C', '#fff')}>Save</button>
                      <button onClick={cancelEdit} disabled={busy} style={smallBtn('#F1F0F5', '#4A4A6A')}>Cancel</button>
                    </>
                  ) : (
                    <>
                      <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: '#2a2421', width: 56 }}>{a.code}</span>
                      <span style={{ flex: 1, fontSize: 13.5, color: '#2a2421' }}>{a.name}</span>
                      {a.subtype && <span style={{ fontSize: 10.5, color: '#8A8FA8', background: '#F1F0F5', padding: '2px 8px', borderRadius: 999 }}>{a.subtype}</span>}
                      {a.is_system && <span style={{ fontSize: 10, fontWeight: 800, color: '#6B4FA0', background: '#F6F3FB', padding: '2px 8px', borderRadius: 999 }}>SYSTEM</span>}
                      {!a.is_active && <span style={{ fontSize: 10, fontWeight: 800, color: '#8A8FA8', background: '#F1F0F5', padding: '2px 8px', borderRadius: 999 }}>INACTIVE</span>}
                      <button onClick={() => startEdit(a)} disabled={busy} style={smallBtn('#F4F9FE', '#1A5F9C')}>Rename</button>
                      <button onClick={() => toggleActive(a)} disabled={busy} style={smallBtn('#F1F0F5', '#4A4A6A')}>
                        {a.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      {!a.is_system && (
                        <button onClick={() => deleteAccount(a)} disabled={busy} style={smallBtn('#FCEEEC', '#C0392B')}>Delete</button>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          );
        })
      )}
    </div>
  );
};

export default ChartOfAccounts;

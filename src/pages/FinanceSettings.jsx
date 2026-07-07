import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import ChartOfAccounts from './ChartOfAccounts';

// Finance Settings — school-level configuration for the Accounting module, tabbed:
//   · Defaults        — allocation mode, working year/term, receipt numbering
//   · Chart of Accounts — the General Ledger account list (Final Accounts Phase A)
const FinanceSettings = ({ schoolConfig }) => {
  const thisYear = new Date().getFullYear();
  const [tab, setTab] = useState('defaults');
  const [mode, setMode] = useState('priority');
  const [workingYear, setWorkingYear] = useState('');   // '' = calendar year
  const [currentTerm, setCurrentTerm] = useState('');   // '' = by calendar month
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  // Receipt numbering (per the effective working year)
  const [nextReceipt, setNextReceipt] = useState(null);
  const [newNext, setNewNext] = useState('');
  const [rctMsg, setRctMsg] = useState('');
  const [savingRct, setSavingRct] = useState(false);

  const effectiveYear = workingYear ? parseInt(workingYear) : thisYear;

  useEffect(() => {
    if (!schoolConfig?.id) return;
    (async () => {
      const { data } = await supabase
        .from('fee_settings').select('allocation_mode, working_year, current_term')
        .eq('school_id', schoolConfig.id).maybeSingle();
      if (data) {
        if (data.allocation_mode) setMode(data.allocation_mode);
        setWorkingYear(data.working_year ? String(data.working_year) : '');
        setCurrentTerm(data.current_term ? String(data.current_term) : '');
      }
      setLoaded(true);
    })();
  }, [schoolConfig?.id]);

  // Load the next receipt number whenever the effective year changes.
  useEffect(() => {
    if (!schoolConfig?.id || !loaded) return;
    (async () => {
      setNextReceipt(null);
      const { data, error } = await supabase.rpc('get_next_receipt_no', {
        p_school_id: schoolConfig.id, p_year: effectiveYear,
      });
      if (!error) setNextReceipt(data);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolConfig?.id, loaded, effectiveYear]);

  const saveSettings = async (patch) => {
    setSaving(true);
    setSavedMsg('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const next = {
        allocation_mode: mode,
        working_year: workingYear ? parseInt(workingYear) : null,
        current_term: currentTerm ? parseInt(currentTerm) : null,
        ...patch,
      };
      const { error } = await supabase.from('fee_settings').upsert({
        school_id: schoolConfig.id,
        ...next,
        updated_at: new Date().toISOString(),
        updated_by: user?.id || null,
      }, { onConflict: 'school_id' });
      if (error) throw error;
      setSavedMsg('Saved.');
    } catch (err) {
      setSavedMsg('Failed to save: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const setModeAndSave = (m) => { setMode(m); saveSettings({ allocation_mode: m }); };
  const setYearAndSave = (y) => { setWorkingYear(y); saveSettings({ working_year: y ? parseInt(y) : null }); };
  const setTermAndSave = (t) => { setCurrentTerm(t); saveSettings({ current_term: t ? parseInt(t) : null }); };

  const saveReceiptStart = async () => {
    const n = parseInt(newNext);
    if (!n || n < 1) { setRctMsg('Enter a valid number (1 or higher).'); return; }
    if (!window.confirm(`Set the NEXT receipt number for ${effectiveYear} to ${n}?\n\nReceipts will continue from RCT-${effectiveYear}-${String(n).padStart(6, '0')}. This cannot be moved backwards.`)) return;
    setSavingRct(true);
    setRctMsg('');
    try {
      const { data, error } = await supabase.rpc('set_receipt_counter', {
        p_school_id: schoolConfig.id, p_year: effectiveYear, p_next_no: n,
      });
      if (error) throw error;
      setNextReceipt(data.next_no);
      setNewNext('');
      setRctMsg(`Done — the next receipt will be RCT-${effectiveYear}-${String(data.next_no).padStart(6, '0')}.`);
    } catch (err) {
      setRctMsg(err.message);
    } finally {
      setSavingRct(false);
    }
  };

  const OPTIONS = [
    {
      id: 'priority',
      title: 'Priority',
      tag: 'Recommended',
      blurb: 'A payment clears charges in the order voteheads are listed in Fee Structure — top first. Tuition before Lunch, and so on.',
      example: 'Owed Tuition 2,000 + Lunch 1,000. Pay 1,500 → Tuition 1,500 (still owes 500), Lunch 0.',
    },
    {
      id: 'percentage',
      title: 'Percentage (pro-rata)',
      tag: '',
      blurb: 'A payment is split across all outstanding charges in proportion to what is owed on each.',
      example: 'Owed Tuition 2,000 + Lunch 1,000. Pay 1,500 → Tuition 1,000, Lunch 500 (2:1 ratio).',
    },
  ];

  const card = { background: '#fff', border: '1px solid #E8EAF0', borderRadius: 12, padding: 20, marginBottom: 16 };
  const cardTitle = { fontSize: 13, fontWeight: 800, color: '#2a2421', marginBottom: 4 };
  const cardSub = { fontSize: 12.5, color: '#8A8FA8', marginBottom: 16, lineHeight: 1.5 };
  const selStyle = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e6dfd8', fontSize: 13, fontWeight: 600, color: '#2a2421', background: '#fff', cursor: 'pointer', boxSizing: 'border-box' };
  const lblStyle = { display: 'block', fontSize: 10, fontWeight: 800, color: '#8a8fa8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' };

  return (
    <div style={{ paddingBottom: 40, maxWidth: tab === 'coa' ? 980 : 780 }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#2a2421' }}>Finance Settings</h2>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: '#8A8FA8' }}>
          Configuration for the Accounting module. Changes save automatically and apply to new activity.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid #E8EAF0' }}>
        {[{ id: 'defaults', label: 'Defaults' }, { id: 'coa', label: 'Chart of Accounts' }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              padding: '8px 16px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 700,
              color: tab === t.id ? '#1A5F9C' : '#8A8FA8',
              borderBottom: tab === t.id ? '2px solid #1A5F9C' : '2px solid transparent',
              marginBottom: -1,
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'coa' ? (
        <ChartOfAccounts schoolConfig={schoolConfig} />
      ) : !loaded ? (
        <div style={{ color: '#8A8FA8', fontSize: 13 }}>Loading…</div>
      ) : (
        <>
          {/* Working defaults */}
          <div style={card}>
            <div style={cardTitle}>Working defaults</div>
            <div style={cardSub}>The year and term that finance screens and forms open on — set them once at the start of each term.</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={lblStyle}>Working year</label>
                <select value={workingYear} onChange={(e) => setYearAndSave(e.target.value)} style={selStyle}>
                  <option value="">Automatic — calendar year ({thisYear})</option>
                  {[thisYear - 1, thisYear, thisYear + 1].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div>
                <label style={lblStyle}>Current term</label>
                <select value={currentTerm} onChange={(e) => setTermAndSave(e.target.value)} style={selStyle}>
                  <option value="">Automatic — by calendar month</option>
                  <option value="1">Term 1</option>
                  <option value="2">Term 2</option>
                  <option value="3">Term 3</option>
                </select>
              </div>
            </div>
          </div>

          {/* Receipt numbering */}
          <div style={card}>
            <div style={cardTitle}>Receipt numbering · {effectiveYear}</div>
            <div style={cardSub}>
              Every payment automatically takes the next number and prints it on the receipt.
              Set the starting point here (e.g. to continue from your paper receipt book). Numbering can only move forward.
            </div>
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200, padding: '12px 16px', background: '#F8FAFC', border: '1px solid #E8EAF0', borderRadius: 10 }}>
                <div style={lblStyle}>Next receipt number</div>
                <div style={{ fontFamily: 'monospace', fontSize: 17, fontWeight: 800, color: '#1A5F9C' }}>
                  {nextReceipt === null ? '…' : `RCT-${effectiveYear}-${String(nextReceipt).padStart(6, '0')}`}
                </div>
              </div>
              <div style={{ minWidth: 160 }}>
                <label style={lblStyle}>Change next number to</label>
                <input type="number" min="1" value={newNext} placeholder={nextReceipt ? String(nextReceipt) : ''}
                  onChange={(e) => setNewNext(e.target.value)}
                  style={{ ...selStyle, cursor: 'text', fontFamily: 'monospace', textAlign: 'right' }} />
              </div>
              <button onClick={saveReceiptStart} disabled={savingRct || !newNext}
                style={{ padding: '10px 18px', background: savingRct || !newNext ? '#8a8fa8' : '#1A5F9C', border: 'none', borderRadius: 8, fontSize: 13, color: '#fff', fontWeight: 700, cursor: savingRct || !newNext ? 'default' : 'pointer' }}>
                {savingRct ? 'Saving…' : 'Set'}
              </button>
            </div>
            {rctMsg && (
              <div style={{ marginTop: 10, fontSize: 12.5, fontWeight: 600, color: rctMsg.startsWith('Done') ? '#1B6B3A' : '#C0392B' }}>{rctMsg}</div>
            )}
          </div>

          {/* Allocation mode */}
          <div style={card}>
            <div style={cardTitle}>Default payment allocation</div>
            <div style={cardSub}>When a payment doesn’t cover everything a student owes, how should it be spread across the voteheads? The bursar can override per payment.</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              {OPTIONS.map(o => {
                const active = mode === o.id;
                return (
                  <button key={o.id} onClick={() => setModeAndSave(o.id)} disabled={saving}
                    style={{
                      textAlign: 'left', cursor: 'pointer', padding: 16, borderRadius: 12,
                      border: active ? '2px solid #1A5F9C' : '1.5px solid #E8EAF0',
                      background: active ? '#F4F9FE' : '#fff',
                    }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ width: 16, height: 16, borderRadius: '50%', flexShrink: 0, border: active ? '5px solid #1A5F9C' : '2px solid #c9c2b8' }} />
                      <span style={{ fontWeight: 800, color: '#2a2421' }}>{o.title}</span>
                      {o.tag && <span style={{ fontSize: 10, fontWeight: 800, color: '#1B6B3A', background: '#E8F5EE', padding: '2px 8px', borderRadius: 999 }}>{o.tag}</span>}
                    </div>
                    <div style={{ fontSize: 12.5, color: '#4A4A6A', lineHeight: 1.5, marginBottom: 8 }}>{o.blurb}</div>
                    <div style={{ fontSize: 11.5, color: '#8A8FA8', fontStyle: 'italic', lineHeight: 1.5 }}>{o.example}</div>
                  </button>
                );
              })}
            </div>
            {savedMsg && (
              <div style={{ marginTop: 12, fontSize: 12.5, fontWeight: 600, color: savedMsg.startsWith('Failed') ? '#C0392B' : '#1B6B3A' }}>{savedMsg}</div>
            )}
            <div style={{ marginTop: 14, padding: '10px 14px', background: '#F8FAFC', borderRadius: 10, fontSize: 12, color: '#8A8FA8', lineHeight: 1.5 }}>
              💡 Priority order is the votehead order in <strong>Fee Structure → Voteheads</strong>. Move a votehead up to make it clear first.
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default FinanceSettings;

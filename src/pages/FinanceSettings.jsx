import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

// Finance Settings — currently the payment allocation mode (how a payment is
// spread across a student's outstanding voteheads). More settings (discount
// ceilings, clearance threshold, numbering) can join this page later.
const FinanceSettings = ({ schoolConfig }) => {
  const [mode, setMode] = useState('priority');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  useEffect(() => {
    if (!schoolConfig?.id) return;
    (async () => {
      const { data } = await supabase
        .from('fee_settings').select('allocation_mode')
        .eq('school_id', schoolConfig.id).maybeSingle();
      if (data?.allocation_mode) setMode(data.allocation_mode);
      setLoaded(true);
    })();
  }, [schoolConfig?.id]);

  const save = async (newMode) => {
    setMode(newMode);
    setSaving(true);
    setSavedMsg('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('fee_settings').upsert({
        school_id: schoolConfig.id,
        allocation_mode: newMode,
        updated_at: new Date().toISOString(),
        updated_by: user?.id || null,
      }, { onConflict: 'school_id' });
      if (error) throw error;
      setSavedMsg('Saved — applies to new payments.');
    } catch (err) {
      setSavedMsg('Failed to save: ' + err.message);
    } finally {
      setSaving(false);
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

  return (
    <div style={{ paddingBottom: 40, maxWidth: 780 }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#2a2421' }}>Finance Settings</h2>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: '#8A8FA8' }}>
          Defaults for the Accounting module. The bursar can still override the mode on an individual payment.
        </p>
      </div>

      <div style={{ background: '#fff', border: '1px solid #E8EAF0', borderRadius: 12, padding: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#2a2421', marginBottom: 4 }}>Default payment allocation</div>
        <div style={{ fontSize: 12.5, color: '#8A8FA8', marginBottom: 16, lineHeight: 1.5 }}>
          When a payment doesn’t cover everything a student owes, how should it be spread across the voteheads?
        </div>

        {!loaded ? (
          <div style={{ color: '#8A8FA8', fontSize: 13 }}>Loading…</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {OPTIONS.map(o => {
              const active = mode === o.id;
              return (
                <button
                  key={o.id}
                  onClick={() => save(o.id)}
                  disabled={saving}
                  style={{
                    textAlign: 'left', cursor: 'pointer', padding: 16, borderRadius: 12,
                    border: active ? '2px solid #1A5F9C' : '1.5px solid #E8EAF0',
                    background: active ? '#F4F9FE' : '#fff',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{
                      width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                      border: active ? '5px solid #1A5F9C' : '2px solid #c9c2b8',
                    }} />
                    <span style={{ fontWeight: 800, color: '#2a2421' }}>{o.title}</span>
                    {o.tag && <span style={{ fontSize: 10, fontWeight: 800, color: '#1B6B3A', background: '#E8F5EE', padding: '2px 8px', borderRadius: 999 }}>{o.tag}</span>}
                  </div>
                  <div style={{ fontSize: 12.5, color: '#4A4A6A', lineHeight: 1.5, marginBottom: 8 }}>{o.blurb}</div>
                  <div style={{ fontSize: 11.5, color: '#8A8FA8', fontStyle: 'italic', lineHeight: 1.5 }}>{o.example}</div>
                </button>
              );
            })}
          </div>
        )}

        {savedMsg && (
          <div style={{ marginTop: 14, fontSize: 12.5, fontWeight: 600, color: savedMsg.startsWith('Failed') ? '#C0392B' : '#1B6B3A' }}>
            {savedMsg}
          </div>
        )}

        <div style={{ marginTop: 16, padding: '10px 14px', background: '#F8FAFC', borderRadius: 10, fontSize: 12, color: '#8A8FA8', lineHeight: 1.5 }}>
          💡 Priority order is the votehead order in <strong>Fee Structure → Voteheads</strong>. Drag a votehead up to make it clear first.
        </div>
      </div>
    </div>
  );
};

export default FinanceSettings;

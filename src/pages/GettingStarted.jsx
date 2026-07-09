import React, { useState, useEffect, useMemo } from 'react';
import {
  fetchOnboardingStatus, stepsForModule, progressFor, SHARE_CODE_INFO,
} from '../lib/onboardingSteps';

const MODULE_LABEL = { examination: 'Exams setup', accounting: 'Accounts setup' };

// Self-detecting setup checklist. `onNavigateTo(navId, moduleKey)` deep-links to
// the exact page/tab (switching module first when the step lives elsewhere).
const GettingStarted = ({ schoolConfig, role, activeModule, availableModules = [], onNavigateTo }) => {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [viewModule, setViewModule] = useState(activeModule || 'examination');

  const moduleTabs = useMemo(
    () => (availableModules || []).filter((m) => MODULE_LABEL[m]),
    [availableModules]
  );

  const load = async () => {
    setLoading(true);
    const s = await fetchOnboardingStatus(schoolConfig?.id);
    setStatus(s);
    setLoading(false);
  };

  useEffect(() => { if (schoolConfig?.id) load(); /* eslint-disable-next-line */ }, [schoolConfig?.id]);
  useEffect(() => { if (activeModule) setViewModule(activeModule); }, [activeModule]);

  const steps = useMemo(() => stepsForModule(viewModule), [viewModule]);
  const prog = useMemo(() => (status ? progressFor(steps, status) : { done: 0, total: steps.length, pct: 0 }), [steps, status]);

  if (role !== 'admin') {
    return <div style={{ color: '#8a8fa8', padding: 24 }}>The setup guide is available to school administrators.</div>;
  }

  const accent = '#1B6B3A';

  return (
    <div style={{ maxWidth: 820 }}>
      {/* Header + progress */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: "'EB Garamond', serif", fontSize: 30, fontWeight: 700, color: '#2a2421', margin: '0 0 6px' }}>
          🚀 Getting Started
        </h1>
        <p style={{ fontSize: 14, color: '#8a8fa8', margin: 0, lineHeight: 1.5 }}>
          Work through these steps to set up your school. Each one ticks itself off once done.
        </p>
      </div>

      {/* Module toggle (only when the school runs both modules) */}
      {moduleTabs.length > 1 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {moduleTabs.map((m) => (
            <button
              key={m}
              onClick={() => setViewModule(m)}
              style={{
                padding: '8px 16px', borderRadius: 999, cursor: 'pointer', fontSize: 13, fontWeight: 700,
                border: `1.5px solid ${viewModule === m ? accent : '#e6dfd8'}`,
                background: viewModule === m ? '#eaf5ee' : '#fff',
                color: viewModule === m ? accent : '#8a8fa8',
              }}
            >{MODULE_LABEL[m]}</button>
          ))}
        </div>
      )}

      {/* Progress bar */}
      <div style={{ background: '#fff', border: '1px solid #ece5db', borderRadius: 14, padding: '16px 20px', marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#2a2421' }}>
            {loading ? 'Checking your setup…' : prog.pct === 100 ? '🎉 All set — your school is ready!' : `${prog.done} of ${prog.total} done`}
          </span>
          <button onClick={load} disabled={loading} style={{ background: 'none', border: '1px solid #e6dfd8', borderRadius: 8, padding: '5px 12px', fontSize: 12, fontWeight: 600, color: '#8a8fa8', cursor: loading ? 'wait' : 'pointer' }}>
            ↻ Refresh
          </button>
        </div>
        <div style={{ height: 8, borderRadius: 999, background: '#f0ece3', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${prog.pct}%`, background: accent, borderRadius: 999, transition: 'width 0.3s' }} />
        </div>
      </div>

      {/* Steps */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {steps.map((st, i) => {
          const done = status ? st.done(status) : false;
          return (
            <div key={st.id} style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px',
              background: '#fff', border: `1px solid ${done ? '#cfe6d8' : '#ece5db'}`, borderRadius: 14,
            }}>
              <div style={{
                width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800,
                background: done ? accent : '#f0ece3', color: done ? '#fff' : '#8a8fa8',
              }}>{done ? '✓' : i + 1}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: '#2a2421' }}>
                  {st.icon} {st.title}
                  {st.optional && <span style={{ fontSize: 11, fontWeight: 600, color: '#a0a4b0', marginLeft: 6 }}>· optional</span>}
                </div>
                <div style={{ fontSize: 12.5, color: '#8a8fa8', marginTop: 2, lineHeight: 1.4 }}>{st.blurb}</div>
                <div style={{ fontSize: 11.5, color: '#b0a99e', marginTop: 2 }}>Why: {st.why}</div>
              </div>
              <button
                onClick={() => onNavigateTo?.(st.nav.navId, st.nav.module)}
                style={{
                  padding: '9px 16px', borderRadius: 9, whiteSpace: 'nowrap', flexShrink: 0,
                  border: `1.5px solid ${done ? '#cfe6d8' : accent}`,
                  background: done ? '#fff' : accent, color: done ? accent : '#fff',
                  fontSize: 13, fontWeight: 700, cursor: 'pointer',
                }}
              >{done ? 'Review' : 'Set up →'}</button>
            </div>
          );
        })}

        {/* Informational: share the school code */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', background: '#fefbf2', border: '1px solid #e6d28a', borderRadius: 14 }}>
          <div style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, background: '#fff', border: '1px solid #e6d28a' }}>{SHARE_CODE_INFO.icon}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: '#8A6A1F' }}>{SHARE_CODE_INFO.title}</div>
            <div style={{ fontSize: 12.5, color: '#a58a4a', marginTop: 2, lineHeight: 1.4 }}>{SHARE_CODE_INFO.blurb}</div>
          </div>
          {schoolConfig?.schoolCode && (
            <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 16, color: '#2a2421', flexShrink: 0 }}>{schoolConfig.schoolCode}</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GettingStarted;

import React, { useState, useEffect, useMemo } from 'react';
import { fetchOnboardingStatus, stepsForModule, progressFor } from '../../lib/onboardingSteps';

// Small floating pill (bottom-right, above the page) that opens the Getting
// Started checklist. Shows live progress, sits out of the menu flow entirely,
// and hides itself once setup is complete. Admin-only; the parent renders it.
const FloatingSetupButton = ({ schoolConfig, activeModule, onOpen, hidden }) => {
  const minKey = `setup_fab_min_${schoolConfig?.id || ''}`;
  const [status, setStatus] = useState(null);
  const [hover, setHover] = useState(false);
  const [minimized, setMinimized] = useState(() => localStorage.getItem(minKey) === '1');

  useEffect(() => {
    let alive = true;
    if (schoolConfig?.id) {
      fetchOnboardingStatus(schoolConfig.id).then((s) => { if (alive) setStatus(s); });
    }
    return () => { alive = false; };
  }, [schoolConfig?.id]);

  const steps = useMemo(() => stepsForModule(activeModule || 'examination'), [activeModule]);
  const prog = useMemo(() => (status ? progressFor(steps, status) : null), [steps, status]);

  if (hidden || !prog || prog.pct === 100) return null;

  const accent = '#1B6B3A';
  const setMin = (v) => { localStorage.setItem(minKey, v ? '1' : '0'); setMinimized(v); };

  // Minimized: a small 🚀 circle that re-expands the pill on click.
  if (minimized) {
    return (
      <button
        type="button"
        onClick={() => setMin(false)}
        title="Setup guide"
        style={{
          position: 'fixed', right: 22, bottom: 22, zIndex: 1200,
          width: 48, height: 48, borderRadius: '50%', border: 'none', cursor: 'pointer',
          background: accent, color: '#fff', fontSize: 20,
          boxShadow: '0 6px 18px rgba(27,107,58,0.32)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >🚀</button>
    );
  }

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'fixed', right: 22, bottom: 22, zIndex: 1200,
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 10px 10px 18px', borderRadius: 999,
        background: accent, color: '#fff',
        boxShadow: hover ? '0 10px 26px rgba(27,107,58,0.4)' : '0 6px 18px rgba(27,107,58,0.32)',
        transform: hover ? 'translateY(-1px)' : 'none', transition: 'all 0.18s ease',
      }}
    >
      <button
        type="button"
        onClick={onOpen}
        title="Finish setting up your school"
        style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer', padding: 0 }}
      >
        <span style={{ fontSize: 17 }}>🚀</span>
        <span className="hide-mobile">Finish setup</span>
        <span style={{ background: 'rgba(255,255,255,0.22)', borderRadius: 999, padding: '2px 9px', fontSize: 12.5, fontWeight: 800, whiteSpace: 'nowrap' }}>{prog.done}/{prog.total}</span>
      </button>
      <button
        type="button"
        onClick={() => setMin(true)}
        title="Minimize"
        style={{ background: 'rgba(255,255,255,0.18)', border: 'none', color: '#fff', width: 24, height: 24, borderRadius: '50%', cursor: 'pointer', fontSize: 15, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
      >×</button>
    </div>
  );
};

export default FloatingSetupButton;

import React, { useState, useEffect, useMemo } from 'react';
import { fetchOnboardingStatus, stepsForModule, progressFor } from '../../lib/onboardingSteps';

// Small floating pill (bottom-right, above the page) that opens the Getting
// Started checklist. Shows live progress, sits out of the menu flow entirely,
// and hides itself once setup is complete. Admin-only; the parent renders it.
const FloatingSetupButton = ({ schoolConfig, activeModule, onOpen, hidden }) => {
  const [status, setStatus] = useState(null);
  const [hover, setHover] = useState(false);

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

  return (
    <button
      type="button"
      onClick={onOpen}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title="Finish setting up your school"
      style={{
        position: 'fixed', right: 22, bottom: 22, zIndex: 1200,
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 18px', borderRadius: 999, border: 'none', cursor: 'pointer',
        background: accent, color: '#fff', fontSize: 14, fontWeight: 800,
        boxShadow: hover ? '0 10px 26px rgba(27,107,58,0.4)' : '0 6px 18px rgba(27,107,58,0.32)',
        transform: hover ? 'translateY(-1px)' : 'none', transition: 'all 0.18s ease',
      }}
    >
      <span style={{ fontSize: 17 }}>🚀</span>
      <span className="hide-mobile">Finish setup</span>
      <span style={{
        background: 'rgba(255,255,255,0.22)', borderRadius: 999,
        padding: '2px 9px', fontSize: 12.5, fontWeight: 800, whiteSpace: 'nowrap',
      }}>{prog.done}/{prog.total}</span>
    </button>
  );
};

export default FloatingSetupButton;

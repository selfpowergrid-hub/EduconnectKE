import React, { useState, useEffect, useMemo } from 'react';
import { fetchOnboardingStatus, stepsForModule, progressFor } from '../../lib/onboardingSteps';

// Compact "finish setting up" card for the top of the dashboard. Fetches its
// own status, shows progress + the next unfinished step, and links into the
// full Getting Started checklist. Hidden once complete or dismissed.
const OnboardingWidget = ({ schoolConfig, activeModule, onNavigateTo, onOpenChecklist }) => {
  const dismissKey = `onboarding_dismissed_${schoolConfig?.id || ''}`;
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(dismissKey) === '1');
  const [status, setStatus] = useState(null);

  useEffect(() => {
    let alive = true;
    if (schoolConfig?.id) {
      fetchOnboardingStatus(schoolConfig.id).then((s) => { if (alive) setStatus(s); });
    }
    return () => { alive = false; };
  }, [schoolConfig?.id]);

  const steps = useMemo(() => stepsForModule(activeModule || 'examination'), [activeModule]);
  const prog = useMemo(() => (status ? progressFor(steps, status) : null), [steps, status]);
  const nextStep = useMemo(
    () => (status ? steps.find((st) => !st.optional && !st.done(status)) : null),
    [steps, status]
  );

  if (dismissed || !status || !prog || prog.pct === 100) return null;

  const accent = '#1B6B3A';
  const dismiss = () => { localStorage.setItem(dismissKey, '1'); setDismissed(true); };

  return (
    <div style={{
      background: 'linear-gradient(135deg,#ffffff,#fbfdfb)', border: '1.5px solid #cfe6d8',
      borderRadius: 16, padding: '18px 20px', marginBottom: 24,
      boxShadow: '0 4px 16px rgba(27,107,58,0.06)',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#2a2421' }}>🚀 Finish setting up your school</div>
          <div style={{ fontSize: 13, color: '#8a8fa8', marginTop: 2 }}>
            {prog.done} of {prog.total} steps done{nextStep ? ` · Next: ${nextStep.title}` : ''}
          </div>
        </div>
        <button onClick={dismiss} title="Hide" style={{ background: 'none', border: 'none', color: '#b0a99e', fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: 2, flexShrink: 0 }}>×</button>
      </div>

      <div style={{ height: 7, borderRadius: 999, background: '#eef4f0', overflow: 'hidden', margin: '12px 0 14px' }}>
        <div style={{ height: '100%', width: `${prog.pct}%`, background: accent, borderRadius: 999, transition: 'width 0.3s' }} />
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {nextStep && (
          <button
            onClick={() => onNavigateTo?.(nextStep.nav.navId, nextStep.nav.module)}
            style={{ padding: '10px 18px', borderRadius: 9, border: 'none', background: accent, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
          >{nextStep.title} →</button>
        )}
        <button
          onClick={onOpenChecklist}
          style={{ padding: '10px 18px', borderRadius: 9, border: '1.5px solid #cfe6d8', background: '#fff', color: accent, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
        >View full checklist</button>
      </div>
    </div>
  );
};

export default OnboardingWidget;

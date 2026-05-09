import React from 'react';
import { PLANS, getRequiredPlan } from '../../lib/planConfig';

/**
 * PlanGate — wraps a feature and shows an upgrade prompt if
 * the current plan doesn't include the required plan tier.
 *
 * Props:
 *   currentPlan  — 'starter' | 'professional' | 'enterprise'
 *   requiredPlan — the minimum plan needed
 *   featureName  — human-readable name of the locked feature
 *   children     — the content to render if access is granted
 */
const PlanGate = ({ currentPlan, requiredPlan, featureName, children }) => {
  const PLAN_ORDER = ['starter', 'professional', 'enterprise'];
  const currentIdx = PLAN_ORDER.indexOf(currentPlan || 'starter');
  const requiredIdx = PLAN_ORDER.indexOf(requiredPlan || 'professional');

  if (currentIdx >= requiredIdx) {
    return <>{children}</>;
  }

  const required = PLANS[requiredPlan] || PLANS.professional;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '60px 32px',
      textAlign: 'center', minHeight: 400,
    }}>
      {/* Lock icon */}
      <div style={{
        width: 80, height: 80, borderRadius: 20,
        background: 'linear-gradient(135deg, #f5f2eb, #e6dfd8)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 36, marginBottom: 24,
        boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
      }}>
        🔒
      </div>

      <h3 style={{
        fontSize: 22, fontWeight: 800, color: '#2a2421',
        margin: '0 0 8px', letterSpacing: '-0.01em',
      }}>
        {featureName || 'This Feature'} is Locked
      </h3>

      <p style={{
        fontSize: 14, color: '#8a8fa8', margin: '0 0 28px',
        maxWidth: 400, lineHeight: 1.6,
      }}>
        Upgrade to the <strong style={{ color: required.color }}>{required.name}</strong> plan
        to unlock {featureName || 'this feature'} and more powerful tools for your school.
      </p>

      {/* Feature preview */}
      <div style={{
        background: '#fff', border: '1px solid #e6dfd8', borderRadius: 14,
        padding: '20px 24px', marginBottom: 28, maxWidth: 320, width: '100%',
      }}>
        <div style={{
          fontSize: 11, fontWeight: 800, color: required.color,
          textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12,
        }}>
          {required.icon} {required.name} Plan Includes
        </div>
        {required.features.slice(0, 4).map(f => (
          <div key={f} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 0', fontSize: 13, color: '#2a2421', fontWeight: 500,
          }}>
            <span style={{ color: required.color, fontSize: 12 }}>✓</span> {f}
          </div>
        ))}
      </div>

      {/* CTA */}
      <button style={{
        padding: '14px 32px',
        background: `linear-gradient(135deg, ${required.color}, ${required.color}cc)`,
        color: '#fff', border: 'none', borderRadius: 12,
        fontSize: 14, fontWeight: 800, cursor: 'pointer',
        boxShadow: `0 4px 16px ${required.color}33`,
        transition: 'all 0.2s', letterSpacing: '0.02em',
      }}>
        Upgrade to {required.name} →
      </button>

      <p style={{ fontSize: 11, color: '#8a8fa8', marginTop: 12 }}>
        Contact us at support@educonnect.co.ke for upgrades
      </p>
    </div>
  );
};

export default PlanGate;

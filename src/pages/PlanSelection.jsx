import React from 'react';
import { PLANS, PLAN_ORDER } from '../lib/planConfig';
import logo from '../assets/logo.jpg';

const PlanSelection = ({ onSelectPlan }) => {
  const plans = PLAN_ORDER.map(id => PLANS[id]);

  return (
    <div style={{
      minHeight: '100vh', background: '#f5f2eb',
      fontFamily: "'Inter', sans-serif", padding: '48px 24px',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
    }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 48, maxWidth: 600 }}>
        <div style={{ width: 104, height: 104, margin: '0 auto 24px', borderRadius: 20, background: '#fff', border: '1px solid #ece5db', boxShadow: '0 6px 24px rgba(42,36,33,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 15, boxSizing: 'border-box' }}>
          <img src={logo} alt="LogiQ-Taaluma Logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
        </div>
        <h1 style={{
          fontFamily: "'EB Garamond', serif", fontSize: 36, fontWeight: 700,
          color: '#2a2421', margin: '0 0 12px', letterSpacing: '-0.02em',
        }}>
          Choose Your Plan
        </h1>
        <p style={{ fontSize: 16, color: '#8a8fa8', lineHeight: 1.6, margin: 0 }}>
          Select the plan that fits your school's needs. You can upgrade anytime.
        </p>
      </div>

      {/* Plan Cards */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 24, maxWidth: 960, width: '100%',
      }}>
        {plans.map((plan, idx) => {
          const isPro = plan.id === 'professional';
          return (
            <div key={plan.id} style={{
              background: '#fff',
              border: isPro ? '2px solid #D4AF37' : '1px solid #e6dfd8',
              borderRadius: 20, padding: '32px 28px',
              display: 'flex', flexDirection: 'column',
              position: 'relative', overflow: 'hidden',
              boxShadow: isPro ? '0 8px 32px rgba(204,120,92,0.15)' : '0 2px 8px rgba(0,0,0,0.04)',
              transition: 'transform 0.2s, box-shadow 0.2s',
            }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 12px 40px rgba(0,0,0,0.1)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = isPro ? '0 8px 32px rgba(204,120,92,0.15)' : '0 2px 8px rgba(0,0,0,0.04)'; }}
            >
              {/* Popular badge */}
              {isPro && (
                <div style={{
                  position: 'absolute', top: 16, right: -32,
                  background: '#D4AF37', color: '#fff', fontSize: 10, fontWeight: 800,
                  padding: '4px 40px', transform: 'rotate(45deg)',
                  letterSpacing: '0.05em',
                }}>POPULAR</div>
              )}

              {/* Plan header */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ 
                  width: 24, height: 24, borderRadius: '50%', 
                  background: plan.color, border: '2px solid #2a2421',
                  marginBottom: 16, flexShrink: 0 
                }} />
                <h3 style={{ fontSize: 22, fontWeight: 800, color: '#2a2421', margin: '0 0 4px' }}>
                  {plan.name}
                </h3>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span style={{ fontSize: 32, fontWeight: 900, color: plan.color }}>
                    KES {plan.price.toLocaleString()}
                  </span>
                  {plan.pricePeriod && (
                    <span style={{ fontSize: 13, color: '#8a8fa8', fontWeight: 500 }}>
                      /{plan.pricePeriod}
                    </span>
                  )}
                </div>
              </div>

              {/* Features */}
              <div style={{ flex: 1, marginBottom: 24 }}>
                {plan.features.map(f => (
                  <div key={f} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 0', fontSize: 13.5, color: '#2a2421', fontWeight: 500,
                  }}>
                    <span style={{
                      width: 20, height: 20, borderRadius: '50%',
                      background: plan.bg, color: plan.color,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 900, flexShrink: 0,
                    }}>✓</span>
                    {f}
                  </div>
                ))}
                {plan.excluded.map(f => (
                  <div key={f} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 0', fontSize: 13.5, color: '#c0c0c0', fontWeight: 500,
                  }}>
                    <span style={{
                      width: 20, height: 20, borderRadius: '50%',
                      background: '#f5f5f5', color: '#c0c0c0',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 900, flexShrink: 0,
                    }}>✗</span>
                    {f}
                  </div>
                ))}
              </div>

              {/* CTA */}
              <button
                onClick={() => onSelectPlan(plan.id)}
                style={{
                  width: '100%', padding: '14px',
                  background: isPro
                    ? 'linear-gradient(135deg, #D4AF37, #b5684e)'
                    : plan.color,
                  color: '#fff',
                  border: 'none',
                  borderRadius: 12, fontSize: 14, fontWeight: 800, cursor: 'pointer',
                  boxShadow: isPro ? '0 4px 16px rgba(212,175,55,0.3)' : 'none',
                  transition: 'all 0.2s', letterSpacing: '0.02em',
                }}
              >
                Choose {plan.name} →
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PlanSelection;

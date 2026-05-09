import React from 'react';
import { PLANS, PLAN_ORDER } from '../lib/planConfig';

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
        <div style={{
          width: 56, height: 56, background: '#cc785c', borderRadius: 14,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 28, fontWeight: 900, color: '#fff', margin: '0 auto 24px',
          boxShadow: '0 6px 24px rgba(204,120,92,0.3)',
        }}>E</div>
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
              border: isPro ? '2px solid #cc785c' : '1px solid #e6dfd8',
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
                  background: '#cc785c', color: '#fff', fontSize: 10, fontWeight: 800,
                  padding: '4px 40px', transform: 'rotate(45deg)',
                  letterSpacing: '0.05em',
                }}>POPULAR</div>
              )}

              {/* Plan header */}
              <div style={{ marginBottom: 24 }}>
                <span style={{ fontSize: 28, marginBottom: 8, display: 'block' }}>{plan.icon}</span>
                <h3 style={{ fontSize: 22, fontWeight: 800, color: '#2a2421', margin: '0 0 4px' }}>
                  {plan.name}
                </h3>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span style={{ fontSize: 32, fontWeight: 900, color: plan.color }}>
                    {plan.price === 0 ? 'Free' : `KES ${plan.price.toLocaleString()}`}
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
                    ? 'linear-gradient(135deg, #cc785c, #b5684e)'
                    : plan.id === 'enterprise' ? plan.color : '#fff',
                  color: plan.id === 'starter' ? '#2a2421' : '#fff',
                  border: plan.id === 'starter' ? '1.5px solid #e6dfd8' : 'none',
                  borderRadius: 12, fontSize: 14, fontWeight: 800, cursor: 'pointer',
                  boxShadow: isPro ? '0 4px 16px rgba(204,120,92,0.3)' : 'none',
                  transition: 'all 0.2s', letterSpacing: '0.02em',
                }}
              >
                {plan.price === 0 ? 'Get Started Free →' : `Choose ${plan.name} →`}
              </button>
            </div>
          );
        })}
      </div>

      <p style={{ textAlign: 'center', fontSize: 13, color: '#8a8fa8', marginTop: 40 }}>
        All plans include a 14-day free trial. No credit card required.
      </p>
    </div>
  );
};

export default PlanSelection;

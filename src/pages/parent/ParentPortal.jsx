import React, { useState } from 'react';
import logo from '../../assets/logo.jpg';
import ParentResults from './ParentResults';
import ParentFees from './ParentFees';

// Standalone shell shown to a parent/guardian after a successful lookup.
// `data` is the parent-portal edge function response; there is no Supabase
// session behind it. State is held in memory (App persists it to sessionStorage).
const ParentPortal = ({ data, onSignOut }) => {
  const children = data?.children || [];
  const [childIdx, setChildIdx] = useState(0);
  const [tab, setTab] = useState('results'); // 'results' | 'fees'

  const child = children[childIdx];

  return (
    <div style={{ minHeight: '100vh', background: '#f5f2eb', fontFamily: "'Inter', sans-serif" }}>
      {/* Top bar */}
      <div style={{
        padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        borderBottom: '1px solid #e6dfd8', background: '#fff', position: 'sticky', top: 0, zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <img src={logo} alt="LOGIQ" style={{ width: 34, height: 34, borderRadius: 8, objectFit: 'cover' }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#D4AF37', letterSpacing: '0.12em' }}>LOGIQ</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#2a2421', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {data?.school?.name || 'School'}
            </div>
          </div>
        </div>
        <button onClick={onSignOut} style={{
          padding: '8px 14px', background: 'none', border: '1px solid #e6dfd8', borderRadius: 8,
          fontSize: 13, fontWeight: 600, color: '#8a8fa8', cursor: 'pointer', whiteSpace: 'nowrap',
        }}>Sign Out</button>
      </div>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '20px 16px 60px' }}>
        {/* Child switcher */}
        {children.length > 1 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            {children.map((c, i) => (
              <button
                key={c.id}
                onClick={() => setChildIdx(i)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 999,
                  border: `1.5px solid ${i === childIdx ? '#1A5F9C' : '#e6dfd8'}`,
                  background: i === childIdx ? '#eaf2fa' : '#fff', cursor: 'pointer',
                  fontSize: 13, fontWeight: 700, color: i === childIdx ? '#1A5F9C' : '#4A4A6A',
                }}
              >
                {c.photo_url
                  ? <img src={c.photo_url} alt="" style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover' }} />
                  : <span style={{ width: 24, height: 24, borderRadius: '50%', background: '#e6dfd8', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>👦</span>}
                {c.name}
              </button>
            ))}
          </div>
        )}

        {!child ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#8a8fa8' }}>No child records found.</div>
        ) : (
          <>
            {/* Child header card */}
            <div style={{
              background: '#fff', borderRadius: 16, border: '1px solid #ece5db', padding: 20,
              display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16,
            }}>
              {child.photo_url
                ? <img src={child.photo_url} alt={child.name} style={{ width: 64, height: 64, borderRadius: 12, objectFit: 'cover' }} />
                : <div style={{ width: 64, height: 64, borderRadius: 12, background: '#f0ece3', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>🎓</div>}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 19, fontWeight: 800, color: '#2a2421' }}>{child.name}</div>
                <div style={{ fontSize: 13, color: '#8a8fa8', marginTop: 2 }}>
                  ADM {child.adm_no} · {child.grade}{child.stream ? ` · ${child.stream}` : ''}
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {[['results', '📊 Results'], ['fees', '💰 Fees']].map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  style={{
                    flex: 1, padding: '12px', borderRadius: 10, border: 'none', cursor: 'pointer',
                    fontSize: 14, fontWeight: 700,
                    background: tab === id ? '#1B6B3A' : '#fff',
                    color: tab === id ? '#fff' : '#8a8fa8',
                    boxShadow: tab === id ? '0 2px 8px rgba(27,107,58,0.25)' : 'inset 0 0 0 1px #ece5db',
                  }}
                >{label}</button>
              ))}
            </div>

            {tab === 'results'
              ? <ParentResults results={child.results || []} />
              : <ParentFees fees={child.fees} year={data?.year} school={data?.school} child={child} />}
          </>
        )}
      </div>
    </div>
  );
};

export default ParentPortal;

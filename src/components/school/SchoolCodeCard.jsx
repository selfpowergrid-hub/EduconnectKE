import React, { useState } from 'react';

// Display-only card for the school's system-assigned code (SCH-###).
// The code is allocated by the database and never edited here — teachers and
// parents type it to reach the right school at sign-in.
const SchoolCodeCard = ({ code, dense = false }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!code) return;
    navigator.clipboard?.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const wrap = {
    background: 'linear-gradient(135deg, #fff 0%, #fefbf2 100%)',
    border: '1.5px solid #e6d28a',
    borderRadius: 16,
    padding: dense ? 16 : 24,
    boxShadow: '0 2px 12px rgba(212,175,55,0.08)',
  };

  return (
    <section style={wrap}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: 14, fontWeight: 800, color: '#8A6A1F', margin: '0 0 4px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            🏷️ School Code
          </h2>
          <p style={{ fontSize: 13, color: '#8a8fa8', margin: 0, lineHeight: 1.5 }}>
            System-assigned. Teachers and parents enter this code to sign in to your school.
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{
          flex: 1, minWidth: 220, padding: '14px 18px', borderRadius: 10,
          background: '#fff', border: '1.5px dashed #D4AF37',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{
            fontFamily: 'monospace', fontWeight: 800, fontSize: 22,
            color: '#2a2421', letterSpacing: '0.06em', flex: 1, wordBreak: 'break-all',
          }}>
            {code || '— not set —'}
          </div>
          <button
            type="button"
            onClick={handleCopy}
            disabled={!code}
            style={{
              padding: '8px 14px', borderRadius: 8,
              border: `1.5px solid ${copied ? '#1B6B3A' : '#D4AF37'}`,
              background: copied ? '#1B6B3A' : '#fff',
              color: copied ? '#fff' : '#8A6A1F',
              fontWeight: 700, fontSize: 12, cursor: code ? 'pointer' : 'not-allowed',
              whiteSpace: 'nowrap', transition: 'all 0.2s',
            }}
          >{copied ? '✓ Copied' : '📋 Copy'}</button>
        </div>
      </div>
    </section>
  );
};

export default SchoolCodeCard;

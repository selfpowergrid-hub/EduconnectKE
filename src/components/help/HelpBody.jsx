import React from 'react';

const accent = '#1B6B3A';

// Renders a help article / page-help body: what / why / steps / tips.
// Shared by the Help drawer and the Ask-a-question answer box.
const HelpBody = ({ content }) => (
  <div>
    {content.what && <p style={{ fontSize: 14, color: '#2a2421', margin: '0 0 12px', lineHeight: 1.55 }}>{content.what}</p>}
    {content.why && (
      <div style={{ fontSize: 13, color: '#8A6A1F', background: '#fefbf2', border: '1px solid #f0e2b8', borderRadius: 10, padding: '10px 13px', marginBottom: 14, lineHeight: 1.5 }}>
        <strong>Why:</strong> {content.why}
      </div>
    )}
    {content.steps?.length > 0 && (
      <>
        <div style={{ fontSize: 11, fontWeight: 800, color: '#8a8fa8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>How to</div>
        <ol style={{ margin: '0 0 16px', paddingLeft: 18, color: '#4A4A6A', fontSize: 13.5, lineHeight: 1.6 }}>
          {content.steps.map((s, i) => <li key={i} style={{ marginBottom: 4 }}>{s}</li>)}
        </ol>
      </>
    )}
    {content.tips?.length > 0 && (
      <div style={{ background: '#f7f9f7', border: '1px solid #e3ece3', borderRadius: 10, padding: '12px 14px' }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: accent, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>💡 Tips</div>
        <ul style={{ margin: 0, paddingLeft: 16, color: '#4A4A6A', fontSize: 13, lineHeight: 1.55 }}>
          {content.tips.map((t, i) => <li key={i} style={{ marginBottom: 3 }}>{t}</li>)}
        </ul>
      </div>
    )}
  </div>
);

export default HelpBody;

import React, { useState } from 'react';
import { helpFor } from '../../lib/helpContent';
import AskForHelp from './AskForHelp';

// The header "?" — opens a right-side drawer with help for the current page,
// a link into Getting Started, and an "Ask for Help" action available anywhere.
const HelpMenu = ({ pageId, module, role, schoolConfig, userEmail, onOpenChecklist }) => {
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const help = helpFor(pageId);

  const accent = '#1B6B3A';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Help"
        style={{
          width: 34, height: 34, borderRadius: '50%', border: '1.5px solid #e6dfd8',
          background: '#fff', color: '#8a8fa8', fontSize: 16, fontWeight: 800, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}
      >?</button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(42,36,33,0.4)', zIndex: 1300 }} />
          <aside style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(400px, 92vw)', zIndex: 1301,
            background: '#fff', boxShadow: '-8px 0 30px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ padding: '18px 20px', borderBottom: '1px solid #f0ece3', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f5f2eb' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: accent, letterSpacing: '0.08em' }}>HELP</div>
                <div style={{ fontSize: 17, fontWeight: 800, color: '#2a2421' }}>{help.title}</div>
              </div>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#8a8fa8', lineHeight: 1 }}>&times;</button>
            </div>

            <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>
              {help.what && <p style={{ fontSize: 14, color: '#2a2421', margin: '0 0 12px', lineHeight: 1.55 }}>{help.what}</p>}
              {help.why && (
                <div style={{ fontSize: 13, color: '#8A6A1F', background: '#fefbf2', border: '1px solid #f0e2b8', borderRadius: 10, padding: '10px 13px', marginBottom: 14, lineHeight: 1.5 }}>
                  <strong>Why:</strong> {help.why}
                </div>
              )}
              {help.steps?.length > 0 && (
                <>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#8a8fa8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>How to</div>
                  <ol style={{ margin: '0 0 16px', paddingLeft: 18, color: '#4A4A6A', fontSize: 13.5, lineHeight: 1.6 }}>
                    {help.steps.map((s, i) => <li key={i} style={{ marginBottom: 4 }}>{s}</li>)}
                  </ol>
                </>
              )}
              {help.tips?.length > 0 && (
                <div style={{ background: '#f7f9f7', border: '1px solid #e3ece3', borderRadius: 10, padding: '12px 14px', marginBottom: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: accent, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>💡 Tips</div>
                  <ul style={{ margin: 0, paddingLeft: 16, color: '#4A4A6A', fontSize: 13, lineHeight: 1.55 }}>
                    {help.tips.map((t, i) => <li key={i} style={{ marginBottom: 3 }}>{t}</li>)}
                  </ul>
                </div>
              )}
            </div>

            <div style={{ padding: 16, borderTop: '1px solid #f0ece3', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {onOpenChecklist && role === 'admin' && (
                <button
                  onClick={() => { setOpen(false); onOpenChecklist(); }}
                  style={{ padding: '11px', borderRadius: 9, border: '1.5px solid #cfe6d8', background: '#fff', color: accent, fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}
                >🚀 Open Getting Started</button>
              )}
              <button
                onClick={() => setAsking(true)}
                style={{ padding: '11px', borderRadius: 9, border: 'none', background: accent, color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}
              >✉️ Ask for Help</button>
            </div>
          </aside>
        </>
      )}

      {asking && (
        <AskForHelp
          schoolConfig={schoolConfig}
          role={role}
          module={module}
          pageId={pageId}
          userEmail={userEmail}
          onClose={() => setAsking(false)}
        />
      )}
    </>
  );
};

export default HelpMenu;

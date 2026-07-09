import React, { useState, useMemo } from 'react';
import { searchArticles } from '../../lib/helpArticles';
import HelpBody from './HelpBody';

// Ask a question → get the answer right here, from the built-in knowledge
// base (local keyword search — no AI, no network, no email/WhatsApp needed).
const AskForHelp = ({ module, onClose }) => {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState(null);

  const results = useMemo(() => (query.trim() ? searchArticles(query, module) : []), [query, module]);
  const answer = picked || results[0] || null;
  const others = results.filter((a) => a.id !== answer?.id).slice(0, 4);

  const overlay = { position: 'fixed', inset: 0, background: 'rgba(42,36,33,0.55)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1400, padding: 16 };
  const card = { background: '#fff', borderRadius: 16, width: '100%', maxWidth: 500, maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 50px rgba(0,0,0,0.25)', overflow: 'hidden' };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={card} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0ece3', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f5f2eb', flexShrink: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#2a2421' }}>💬 Ask a question</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#8a8fa8', lineHeight: 1 }}>&times;</button>
        </div>

        <div style={{ padding: '16px 20px 0', flexShrink: 0 }}>
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPicked(null); }}
            placeholder="Type your question, e.g. how do I pay school fees?"
            autoFocus
            style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1.5px solid #e6dfd8', fontSize: 14, boxSizing: 'border-box', outline: 'none' }}
          />
        </div>

        <div style={{ padding: '16px 20px 20px', overflowY: 'auto', flex: 1 }}>
          {!query.trim() ? (
            <div style={{ fontSize: 13.5, color: '#8a8fa8', lineHeight: 1.6 }}>
              Ask anything about using LogiQ-Taaluma — you’ll get the answer right here.
              <div style={{ marginTop: 12, fontSize: 12, fontWeight: 700, color: '#b0a99e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Popular</div>
              <ul style={{ margin: '6px 0 0', paddingLeft: 16 }}>
                {['How do I add students?', 'How do I set up fees?', 'How do parents log in?'].map((ex) => (
                  <li key={ex} style={{ marginBottom: 4 }}>
                    <button onClick={() => setQuery(ex)} style={{ background: 'none', border: 'none', color: '#1B6B3A', fontWeight: 600, cursor: 'pointer', padding: 0, fontSize: 13.5 }}>{ex}</button>
                  </li>
                ))}
              </ul>
            </div>
          ) : answer ? (
            <>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#2a2421', marginBottom: 10 }}>{answer.title}</div>
              <HelpBody content={answer} />
              {others.length > 0 && (
                <div style={{ marginTop: 18 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#8a8fa8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Related answers</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {others.map((a) => (
                      <button
                        key={a.id}
                        onClick={() => setPicked(a)}
                        style={{ width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 9, cursor: 'pointer', background: '#fff', border: '1px solid #f0ece3', color: '#2a2421', fontSize: 13, fontWeight: 600, display: 'flex', justifyContent: 'space-between', gap: 8 }}
                      ><span>{a.title}</span><span style={{ color: '#1B6B3A', fontWeight: 800 }}>›</span></button>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div style={{ fontSize: 13.5, color: '#8a8fa8', lineHeight: 1.6 }}>
              We don’t have an exact answer for “{query}” yet. Try different words — for example the task name (streams, students, fees, marks, receipts).
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AskForHelp;

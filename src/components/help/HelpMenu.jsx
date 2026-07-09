import React, { useState, useMemo } from 'react';
import { helpFor } from '../../lib/helpContent';
import { searchArticles, articlesByCategory } from '../../lib/helpArticles';
import AskForHelp from './AskForHelp';

const accent = '#1B6B3A';

// Renders an article/page-help body: what / why / steps / tips.
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

const TopicRow = ({ title, onClick }) => (
  <button
    onClick={onClick}
    style={{
      width: '100%', textAlign: 'left', padding: '11px 12px', borderRadius: 9, cursor: 'pointer',
      background: '#fff', border: '1px solid #f0ece3', color: '#2a2421', fontSize: 13.5, fontWeight: 600,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
    }}
    onMouseEnter={(e) => { e.currentTarget.style.background = '#faf8f3'; e.currentTarget.style.borderColor = '#e3ece3'; }}
    onMouseLeave={(e) => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#f0ece3'; }}
  >
    <span>{title}</span>
    <span style={{ color: accent, fontWeight: 800 }}>›</span>
  </button>
);

// The header "?" — opens a right-side drawer with search, browse-by-topic,
// help for the current page, and "Ask for Help". All answers are built-in
// (searchArticles is local keyword matching — no AI/network).
const HelpMenu = ({ pageId, module, role, schoolConfig, userEmail, onOpenChecklist }) => {
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const [query, setQuery] = useState('');
  const [article, setArticle] = useState(null);
  const [showAll, setShowAll] = useState(false);

  const pageHelp = helpFor(pageId);
  const results = useMemo(() => (query.trim() ? searchArticles(query, module) : []), [query, module]);
  const groups = useMemo(() => articlesByCategory(module, showAll), [module, showAll]);

  const close = () => { setOpen(false); setArticle(null); setQuery(''); };

  return (
    <>
      <button
        type="button" onClick={() => setOpen(true)} title="Help"
        style={{ width: 34, height: 34, borderRadius: '50%', border: '1.5px solid #e6dfd8', background: '#fff', color: '#8a8fa8', fontSize: 16, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
      >?</button>

      {open && (
        <>
          <div onClick={close} style={{ position: 'fixed', inset: 0, background: 'rgba(42,36,33,0.4)', zIndex: 1300 }} />
          <aside style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(420px, 94vw)', zIndex: 1301, background: '#fff', boxShadow: '-8px 0 30px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0ece3', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f5f2eb' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: accent, letterSpacing: '0.08em' }}>HELP CENTER</div>
                <div style={{ fontSize: 17, fontWeight: 800, color: '#2a2421' }}>{article ? article.title : 'How can we help?'}</div>
              </div>
              <button onClick={close} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#8a8fa8', lineHeight: 1 }}>&times;</button>
            </div>

            {/* Search (hidden while reading an article) */}
            {!article && (
              <div style={{ padding: '14px 20px 0' }}>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search help… e.g. how do I add a stream?"
                  style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: '1.5px solid #e6dfd8', fontSize: 13.5, boxSizing: 'border-box', outline: 'none' }}
                />
              </div>
            )}

            {/* Body */}
            <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>
              {article ? (
                <>
                  <button onClick={() => setArticle(null)} style={{ background: 'none', border: 'none', color: accent, fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: 0, marginBottom: 12 }}>← Back</button>
                  <HelpBody content={article} />
                </>
              ) : query.trim() ? (
                <>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#8a8fa8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                    {results.length ? `${results.length} result${results.length > 1 ? 's' : ''}` : 'No matches'}
                  </div>
                  {results.length ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {results.map((a) => <TopicRow key={a.id} title={a.title} onClick={() => setArticle(a)} />)}
                    </div>
                  ) : (
                    <div style={{ fontSize: 13.5, color: '#8a8fa8', lineHeight: 1.6 }}>
                      Nothing matched “{query}”. Try different words, or use <strong>Ask for Help</strong> below and we’ll reply.
                    </div>
                  )}
                </>
              ) : (
                <>
                  {/* Help for the current page */}
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#8a8fa8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>On this page · {pageHelp.title}</div>
                  <HelpBody content={pageHelp} />

                  {/* Browse topics */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '22px 0 10px' }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: '#8a8fa8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Browse help topics</div>
                    <button onClick={() => setShowAll((v) => !v)} style={{ background: 'none', border: 'none', color: accent, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                      {showAll ? 'This module' : 'All modules'}
                    </button>
                  </div>
                  {Object.entries(groups).map(([cat, arts]) => (
                    <div key={cat} style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#b0a99e', margin: '0 0 6px' }}>{cat}</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {arts.map((a) => <TopicRow key={a.id} title={a.title} onClick={() => setArticle(a)} />)}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>

            {/* Footer actions */}
            <div style={{ padding: 16, borderTop: '1px solid #f0ece3', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {onOpenChecklist && role === 'admin' && (
                <button onClick={() => { close(); onOpenChecklist(); }} style={{ padding: '11px', borderRadius: 9, border: '1.5px solid #cfe6d8', background: '#fff', color: accent, fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>🚀 Open Getting Started</button>
              )}
              <button onClick={() => setAsking(true)} style={{ padding: '11px', borderRadius: 9, border: 'none', background: accent, color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>✉️ Ask for Help</button>
            </div>
          </aside>
        </>
      )}

      {asking && (
        <AskForHelp schoolConfig={schoolConfig} role={role} module={module} pageId={pageId} userEmail={userEmail} onClose={() => setAsking(false)} />
      )}
    </>
  );
};

export default HelpMenu;

import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

// Mirrors public.normalize_login_code() so we can preview the result before the
// server confirms it.
const clientNormalize = (raw) => {
  if (!raw) return '';
  let s = raw.toUpperCase().replace(/[^A-Z0-9]+/g, '-');
  s = s.replace(/^-+|-+$/g, '').slice(0, 16).replace(/-+$/g, '');
  return s;
};

const SchoolCodeCard = ({ schoolId, currentCode, onUpdated, dense = false }) => {
  const [localCode, setLocalCode] = useState(null);
  const displayedCode = localCode ?? currentCode;

  const [editing, setEditing] = useState(false);
  const [proposed, setProposed] = useState('');
  const [status, setStatus] = useState('idle'); // idle | checking | ok | taken | invalid
  const [msg, setMsg] = useState('');
  const [normalized, setNormalized] = useState('');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!editing) return;
    const preview = clientNormalize(proposed);
    if (!preview || preview.length < 4) {
      setStatus(proposed ? 'invalid' : 'idle');
      setMsg(proposed ? 'Code must be at least 4 letters/numbers.' : '');
      setNormalized('');
      return;
    }
    if (preview === displayedCode) {
      setStatus('idle');
      setMsg('That is the current code.');
      setNormalized(preview);
      return;
    }
    setStatus('checking');
    setMsg('Checking…');
    const h = setTimeout(async () => {
      try {
        const { data: norm, error: nErr } = await supabase.rpc('normalize_login_code', { p_code: proposed });
        if (nErr) throw nErr;
        if (!norm) { setStatus('invalid'); setMsg('Code must be at least 4 letters/numbers.'); setNormalized(''); return; }
        setNormalized(norm);
        const { data: avail, error: aErr } = await supabase.rpc('is_login_code_available', { p_code: proposed });
        if (aErr) throw aErr;
        if (avail) { setStatus('ok'); setMsg(`Available — teachers will type ${norm}`); }
        else { setStatus('taken'); setMsg('That code is already taken.'); }
      } catch (e) {
        setStatus('invalid');
        setMsg(e?.message?.includes('function')
          ? 'Database helpers not installed yet — run the school-code migration.'
          : (e?.message || 'Could not check.'));
      }
    }, 400);
    return () => clearTimeout(h);
  }, [proposed, editing, displayedCode]);

  const handleSave = async () => {
    if (status !== 'ok' || !normalized || !schoolId) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('school_registrations')
        .update({ login_code: normalized })
        .eq('id', schoolId);
      if (error) throw error;
      setLocalCode(normalized);
      setEditing(false);
      setProposed('');
      setStatus('idle');
      setMsg('');
      onUpdated?.(normalized);
    } catch (e) {
      alert('Could not change code: ' + (e.message || 'unknown'));
    } finally { setSaving(false); }
  };

  const handleCopy = () => {
    if (!displayedCode) return;
    navigator.clipboard?.writeText(displayedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const statusColor = status === 'ok' ? '#1B6B3A'
    : status === 'checking' ? '#8a8fa8'
    : status === 'idle' ? '#8a8fa8'
    : '#C0392B';

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
            🏷️ Teacher Login Code
          </h2>
          <p style={{ fontSize: 13, color: '#8a8fa8', margin: 0, lineHeight: 1.5 }}>
            Share this code with your teachers. They enter it on the Teacher sign-in page to find your school.
          </p>
        </div>
      </div>

      {!editing ? (
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
              {displayedCode || '— not set —'}
            </div>
            <button
              type="button"
              onClick={handleCopy}
              disabled={!displayedCode}
              style={{
                padding: '8px 14px', borderRadius: 8,
                border: `1.5px solid ${copied ? '#1B6B3A' : '#D4AF37'}`,
                background: copied ? '#1B6B3A' : '#fff',
                color: copied ? '#fff' : '#8A6A1F',
                fontWeight: 700, fontSize: 12, cursor: displayedCode ? 'pointer' : 'not-allowed',
                whiteSpace: 'nowrap', transition: 'all 0.2s',
              }}
            >{copied ? '✓ Copied' : '📋 Copy'}</button>
          </div>
          <button
            type="button"
            onClick={() => { setEditing(true); setProposed(displayedCode || ''); setStatus('idle'); setMsg(''); }}
            style={{
              padding: '12px 18px', borderRadius: 8, border: '1.5px solid #2a2421',
              background: '#2a2421', color: '#fff', fontWeight: 700, fontSize: 13,
              cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >✏️ Change Code</button>
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <input
              type="text"
              value={proposed}
              onChange={e => setProposed(e.target.value.toUpperCase())}
              placeholder="NEW-CODE"
              autoFocus
              style={{
                flex: 1, minWidth: 200, padding: '14px 16px', borderRadius: 10,
                border: '1.5px solid #D4AF37', fontSize: 18, fontFamily: 'monospace',
                fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
                outline: 'none', background: '#fff', color: '#2a2421', boxSizing: 'border-box',
              }}
            />
            <button
              type="button"
              onClick={handleSave}
              disabled={status !== 'ok' || saving}
              style={{
                padding: '14px 20px', borderRadius: 10, border: 'none',
                background: status === 'ok' && !saving ? '#1B6B3A' : '#b8c2cc',
                color: '#fff', fontWeight: 800, fontSize: 13,
                cursor: status === 'ok' && !saving ? 'pointer' : 'not-allowed',
                whiteSpace: 'nowrap',
              }}
            >{saving ? 'Saving…' : '✓ Save'}</button>
            <button
              type="button"
              onClick={() => { setEditing(false); setProposed(''); setStatus('idle'); setMsg(''); }}
              style={{
                padding: '14px 16px', borderRadius: 10, border: '1.5px solid #e6dfd8',
                background: '#fff', color: '#8A8FA8', fontWeight: 700, fontSize: 13, cursor: 'pointer',
              }}
            >Cancel</button>
          </div>
          <div style={{
            marginTop: 10, fontSize: 12, fontWeight: 600,
            color: statusColor, display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {status === 'ok' && '✓'}
            {status === 'checking' && '⏳'}
            {(status === 'taken' || status === 'invalid') && '✗'}
            {status === 'idle' && '💡'}
            <span>{msg || 'Pick a short, memorable code. Letters, numbers and hyphens only — minimum 4 characters.'}</span>
          </div>
        </div>
      )}
    </section>
  );
};

export default SchoolCodeCard;

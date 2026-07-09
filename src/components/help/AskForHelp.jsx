import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';

// Support fallbacks — reachable even if the DB insert fails. Set a WhatsApp
// number (country code + number, e.g. '254700000000') to show that button.
const SUPPORT_EMAIL = 'support@logiq.co.ke';
const SUPPORT_WHATSAPP = '';

// "Ask for Help from anywhere." Captures the message + auto-context (school,
// role, module, page) and files it in help_requests. Degrades gracefully to
// email/WhatsApp if the table isn't installed yet.
const AskForHelp = ({ schoolConfig, role, module, pageId, userEmail, onClose }) => {
  const [message, setMessage] = useState('');
  const [contact, setContact] = useState(userEmail || '');
  const [state, setState] = useState('idle'); // idle | sending | sent | error
  const [errMsg, setErrMsg] = useState('');

  const submit = async () => {
    if (!message.trim()) return;
    setState('sending');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('help_requests').insert([{
        school_id: schoolConfig?.id || null,
        user_id: user?.id || null,
        role: role || null,
        module: module || 'other',
        page: pageId || null,
        message: message.trim(),
        contact: contact.trim() || null,
      }]);
      if (error) throw error;
      setState('sent');
    } catch (e) {
      // Table not installed yet, or offline — steer them to email/WhatsApp.
      setErrMsg(e?.message || 'Could not send.');
      setState('error');
    }
  };

  const mailtoHref = () => {
    const subj = encodeURIComponent(`Help — ${schoolConfig?.schoolName || 'LogiQ-Taaluma'} (${pageId || 'app'})`);
    const body = encodeURIComponent(
      `${message || ''}\n\n---\nSchool: ${schoolConfig?.schoolName || ''}\nCode: ${schoolConfig?.schoolCode || ''}\nRole: ${role || ''}\nModule: ${module || ''}\nPage: ${pageId || ''}`
    );
    return `mailto:${SUPPORT_EMAIL}?subject=${subj}&body=${body}`;
  };
  const whatsappHref = () => `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(message || 'Hello, I need help with LogiQ-Taaluma.')}`;

  const overlay = { position: 'fixed', inset: 0, background: 'rgba(42,36,33,0.55)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1400, padding: 16 };
  const card = { background: '#fff', borderRadius: 16, width: '100%', maxWidth: 460, boxShadow: '0 20px 50px rgba(0,0,0,0.25)', overflow: 'hidden' };
  const field = { width: '100%', padding: '11px 13px', borderRadius: 9, border: '1.5px solid #e6dfd8', fontSize: 13.5, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={card} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0ece3', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f5f2eb' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#2a2421' }}>✉️ Ask for Help</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#8a8fa8', lineHeight: 1 }}>&times;</button>
        </div>

        {state === 'sent' ? (
          <div style={{ padding: 28, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#2a2421', marginBottom: 6 }}>Message sent</div>
            <div style={{ fontSize: 13, color: '#8a8fa8', lineHeight: 1.5 }}>
              Thanks — the LogiQ-Taaluma team will get back to you{contact ? ` on ${contact}` : ''}.
            </div>
            <button onClick={onClose} style={{ marginTop: 18, padding: '10px 22px', borderRadius: 9, border: 'none', background: '#1B6B3A', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Done</button>
          </div>
        ) : (
          <div style={{ padding: 20 }}>
            <p style={{ fontSize: 13, color: '#8a8fa8', margin: '0 0 12px', lineHeight: 1.5 }}>
              Tell us what you need help with. We already know which page you’re on, so just describe the problem.
            </p>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="e.g. How do I bulk-import students from an old spreadsheet?"
              rows={4}
              style={{ ...field, resize: 'vertical', marginBottom: 10 }}
            />
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#8a8fa8', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5 }}>Reply to (email or phone)</label>
            <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="you@school.ac.ke" style={{ ...field, marginBottom: 6 }} />

            {state === 'error' && (
              <div style={{ fontSize: 12, color: '#8A6A1F', background: '#fefbf2', border: '1px solid #e6d28a', borderRadius: 8, padding: '9px 12px', margin: '8px 0', lineHeight: 1.5 }}>
                We couldn’t send it in-app just now. Please use email or WhatsApp below — your message is kept in the box.
              </div>
            )}

            <button
              onClick={submit}
              disabled={!message.trim() || state === 'sending'}
              style={{ width: '100%', padding: '12px', borderRadius: 9, border: 'none', marginTop: 8, background: (!message.trim() || state === 'sending') ? '#b8c2cc' : '#1B6B3A', color: '#fff', fontSize: 14, fontWeight: 700, cursor: (!message.trim() || state === 'sending') ? 'not-allowed' : 'pointer' }}
            >{state === 'sending' ? 'Sending…' : 'Send to LogiQ-Taaluma'}</button>

            <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
              <div style={{ flex: 1, height: 1, background: '#f0ece3' }} />
              <span style={{ fontSize: 11, color: '#b0a99e' }}>or reach us directly</span>
              <div style={{ flex: 1, height: 1, background: '#f0ece3' }} />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <a href={mailtoHref()} style={{ flex: 1, textAlign: 'center', padding: '10px', borderRadius: 9, border: '1.5px solid #e6dfd8', background: '#fff', color: '#2a2421', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>✉️ Email</a>
              {SUPPORT_WHATSAPP && (
                <a href={whatsappHref()} target="_blank" rel="noreferrer" style={{ flex: 1, textAlign: 'center', padding: '10px', borderRadius: 9, border: '1.5px solid #cfe6d8', background: '#fff', color: '#1B6B3A', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>💬 WhatsApp</a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AskForHelp;

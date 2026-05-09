import React, { useState } from 'react';
import { supabase } from '../lib/supabase';

const LoginPage = () => {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      if (mode === 'signup') {
        if (!schoolName.trim()) { setError('Please enter your school name'); setIsLoading(false); return; }
        const { data, error: err } = await supabase.auth.signUp({
          email, password,
          options: { data: { school_name: schoolName } },
        });
        if (err) throw err;
        if (data.user && data.user.identities?.length === 0) {
          setError('An account with this email already exists.');
        }
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
      }
    } catch (err) {
      if (err.message.includes('Invalid login credentials')) setError('Incorrect email or password.');
      else if (err.message.includes('User already registered')) setError('Email already registered. Sign in instead.');
      else if (err.message.includes('Password should be at least')) setError('Password must be at least 6 characters.');
      else if (err.message.includes('Email not confirmed')) setError('Email not confirmed. Please check your inbox or disable email confirmation in your Supabase dashboard.');
      else setError(err.message || 'An error occurred.');
    } finally { setIsLoading(false); }
  };

  const handleGoogleSignIn = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
      if (error) throw error;
    } catch { setError('Google sign-in failed.'); }
  };

  const inputBase = {
    width: '100%', padding: '14px 16px 14px 44px', borderRadius: 12,
    border: '1.5px solid #e6dfd8', fontSize: 14, color: '#2a2421',
    background: '#fafafa', outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.2s',
  };
  const labelBase = {
    display: 'block', fontSize: 12, fontWeight: 700, color: '#4A4A6A',
    marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em',
  };
  const iconPos = {
    position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 16, opacity: 0.6,
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', fontFamily: "'Inter', sans-serif", background: '#f5f2eb' }}>
      {/* Left Branding */}
      <div className="hide-mobile" style={{
        flex: 1, background: 'linear-gradient(160deg, #2a2421 0%, #1a1714 50%, #2a2421 100%)',
        display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
        padding: '60px 48px', position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: -100, right: -100, width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(204,120,92,0.12) 0%, transparent 70%)' }} />
        <div style={{ position: 'absolute', bottom: -80, left: -80, width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle, rgba(27,107,58,0.12) 0%, transparent 70%)' }} />
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 440, textAlign: 'center' }}>
          <div style={{ width: 72, height: 72, background: '#cc785c', borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, fontWeight: 900, color: '#fff', margin: '0 auto 32px', boxShadow: '0 8px 32px rgba(204,120,92,0.3)' }}>E</div>
          <h1 style={{ fontFamily: "'EB Garamond', serif", fontSize: 44, fontWeight: 700, color: '#fff', margin: '0 0 16px', lineHeight: 1.1 }}>
            EduConnect<span style={{ color: '#cc785c' }}>KE</span>
          </h1>
          <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.6)', lineHeight: 1.7, margin: '0 0 48px' }}>
            The complete school management platform for Kenyan institutions.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
            {['📝 Examinations', '💰 Fee Tracking', '📊 Report Cards', '👥 Staff Mgmt'].map(f => (
              <span key={f} style={{ padding: '8px 16px', borderRadius: 20, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 500 }}>{f}</span>
            ))}
          </div>
        </div>
        <div style={{ position: 'absolute', bottom: 32, left: 0, right: 0, textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.25)', fontWeight: 500 }}>
          🇰🇪 Built for Kenyan Schools · CBC Aligned
        </div>
      </div>

      {/* Right Form */}
      <div style={{ width: '100%', maxWidth: 520, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '48px 40px', background: '#fff', overflowY: 'auto' }}>
        <div className="show-mobile" style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 48, height: 48, background: '#cc785c', borderRadius: 12, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 900, color: '#fff', marginBottom: 12 }}>E</div>
          <h2 style={{ fontFamily: "'EB Garamond', serif", fontSize: 28, fontWeight: 700, color: '#2a2421', margin: 0 }}>EduConnect<span style={{ color: '#cc785c' }}>KE</span></h2>
        </div>

        <div style={{ maxWidth: 400, margin: '0 auto', width: '100%' }}>
          <h2 style={{ fontSize: 28, fontWeight: 800, color: '#2a2421', margin: '0 0 8px' }}>
            {mode === 'signin' ? 'Welcome back' : 'Create your account'}
          </h2>
          <p style={{ fontSize: 15, color: '#8a8fa8', margin: '0 0 32px', lineHeight: 1.5 }}>
            {mode === 'signin' ? 'Sign in to access your school dashboard' : 'Set up your school on EduConnect'}
          </p>

          {/* Tabs */}
          <div style={{ display: 'flex', marginBottom: 28, background: '#f5f2eb', borderRadius: 12, padding: 4 }}>
            {['signin', 'signup'].map(t => (
              <button key={t} onClick={() => { setMode(t); setError(''); }} style={{
                flex: 1, padding: '12px 0', borderRadius: 10, border: 'none',
                background: mode === t ? '#fff' : 'transparent', color: mode === t ? '#2a2421' : '#8a8fa8',
                fontWeight: 700, fontSize: 14, cursor: 'pointer',
                boxShadow: mode === t ? '0 2px 8px rgba(0,0,0,0.06)' : 'none', transition: 'all 0.2s',
              }}>{t === 'signin' ? 'Sign In' : 'Sign Up'}</button>
            ))}
          </div>

          {error && (
            <div style={{ padding: '12px 16px', borderRadius: 10, background: '#FDF0ED', border: '1px solid #FADBD8', color: '#C0392B', fontSize: 13, fontWeight: 600, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>⚠️</span> {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {mode === 'signup' && (
              <div>
                <label style={labelBase}>School Name</label>
                <div style={{ position: 'relative' }}>
                  <span style={iconPos}>🏫</span>
                  <input type="text" value={schoolName} onChange={e => setSchoolName(e.target.value)} placeholder="e.g. Mwanga Academy" style={inputBase}
                    onFocus={e => e.target.style.borderColor = '#cc785c'} onBlur={e => e.target.style.borderColor = '#e6dfd8'} />
                </div>
              </div>
            )}
            <div>
              <label style={labelBase}>Email Address</label>
              <div style={{ position: 'relative' }}>
                <span style={iconPos}>📧</span>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@school.ac.ke" required style={inputBase}
                  onFocus={e => e.target.style.borderColor = '#cc785c'} onBlur={e => e.target.style.borderColor = '#e6dfd8'} />
              </div>
            </div>
            <div>
              <label style={labelBase}>Password</label>
              <div style={{ position: 'relative' }}>
                <span style={iconPos}>🔒</span>
                <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                  placeholder={mode === 'signup' ? 'Min 6 characters' : 'Enter your password'} required minLength={6}
                  style={{ ...inputBase, paddingRight: 48 }}
                  onFocus={e => e.target.style.borderColor = '#cc785c'} onBlur={e => e.target.style.borderColor = '#e6dfd8'} />
                <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, opacity: 0.5 }}>
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>
            <button type="submit" disabled={isLoading} style={{
              padding: 16, background: isLoading ? '#8a8fa8' : 'linear-gradient(135deg, #cc785c 0%, #b5684e 100%)',
              color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 800,
              cursor: isLoading ? 'not-allowed' : 'pointer', boxShadow: '0 4px 16px rgba(204,120,92,0.3)',
              transition: 'all 0.2s', marginTop: 4, letterSpacing: '0.02em',
            }}>{isLoading ? '⏳ Please wait...' : mode === 'signin' ? 'Sign In →' : 'Create Account →'}</button>
          </form>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16, margin: '28px 0' }}>
            <div style={{ flex: 1, height: 1, background: '#e6dfd8' }} />
            <span style={{ fontSize: 12, color: '#8a8fa8', fontWeight: 600 }}>OR</span>
            <div style={{ flex: 1, height: 1, background: '#e6dfd8' }} />
          </div>

          <button onClick={handleGoogleSignIn} style={{
            width: '100%', padding: 14, background: '#fff', border: '1.5px solid #e6dfd8',
            borderRadius: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 10, fontSize: 14, fontWeight: 700, color: '#2a2421', transition: 'all 0.2s',
          }}>
            <span style={{ fontSize: 18 }}>G</span> Continue with Google
          </button>

          <p style={{ textAlign: 'center', fontSize: 12, color: '#8a8fa8', marginTop: 28, lineHeight: 1.6 }}>
            {mode === 'signup' ? 'By creating an account, you agree to our Terms of Service.' : 'Forgot password? Contact support@educonnect.co.ke'}
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;

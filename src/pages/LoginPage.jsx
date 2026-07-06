import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import logo from '../assets/logo.jpg';

// Mirrors the Postgres normalize_login_code() rules so we can preview
// the code locally before the server confirms it.
const clientNormalizeCode = (raw) => {
  if (!raw) return '';
  let s = raw.toUpperCase().replace(/[^A-Z0-9]+/g, '-');
  s = s.replace(/^-+|-+$/g, '').slice(0, 16).replace(/-+$/g, '');
  return s;
};

const LoginPage = ({ onParentLogin }) => {
  const [view, setView] = useState('chooser'); // 'chooser' | 'admin' | 'register' | 'teacher' | 'parent'
  const mode = view === 'register' ? 'signup' : 'signin';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // School code picker (register view)
  const [proposedCode, setProposedCode] = useState('');
  const [codeEdited, setCodeEdited] = useState(false);
  const [codeStatus, setCodeStatus] = useState('idle'); // idle | checking | ok | taken | invalid
  const [codeMessage, setCodeMessage] = useState('');
  const [normalizedCode, setNormalizedCode] = useState('');

  // Teacher login state
  const [schoolCode, setSchoolCode] = useState(() => localStorage.getItem('teacher_school_code') || '');
  const [teacherList, setTeacherList] = useState([]);
  const [schoolNameLookup, setSchoolNameLookup] = useState('');
  const [selectedTeacherEmail, setSelectedTeacherEmail] = useState('');
  const [isLookingUp, setIsLookingUp] = useState(false);

  // Parent login state
  const [parentSchoolCode, setParentSchoolCode] = useState(() => localStorage.getItem('parent_school_code') || '');
  const [parentPhone, setParentPhone] = useState('');
  const [parentAdmNo, setParentAdmNo] = useState('');

  const goChooser = () => { setView('chooser'); setError(''); };

  const handleParentSignIn = async (e) => {
    e.preventDefault();
    if (!parentSchoolCode.trim() || !parentPhone.trim() || !parentAdmNo.trim()) {
      setError('Enter your school code, phone number and admission number.');
      return;
    }
    setError('');
    setIsLoading(true);
    try {
      const code = parentSchoolCode.trim().toUpperCase();
      const { data, error: err } = await supabase.functions.invoke('parent-portal', {
        body: { school_code: code, phone: parentPhone.trim(), adm_no: parentAdmNo.trim() },
      });
      // supabase-js wraps non-2xx responses in an error whose body is on err.context
      if (err) {
        let msg = 'Could not sign in. Please try again.';
        if (err.context && typeof err.context.json === 'function') {
          try { const body = await err.context.json(); if (body?.error) msg = body.error; } catch { /* ignore */ }
        }
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);
      if (!data?.children?.length) throw new Error('No records found for those details.');
      localStorage.setItem('parent_school_code', code);
      onParentLogin?.(data);
    } catch (err) {
      setError(err.message || 'Could not sign in.');
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-derive the code from school name until the admin manually edits it.
  useEffect(() => {
    if (view !== 'register' || codeEdited) return;
    setProposedCode(clientNormalizeCode(schoolName));
  }, [schoolName, codeEdited, view]);

  // Debounced availability check.
  useEffect(() => {
    if (view !== 'register') return;
    const preview = clientNormalizeCode(proposedCode);
    if (!preview || preview.length < 4) {
      setCodeStatus(proposedCode ? 'invalid' : 'idle');
      setCodeMessage(proposedCode ? 'Code must be at least 4 letters/numbers.' : '');
      setNormalizedCode('');
      return;
    }
    setCodeStatus('checking');
    setCodeMessage('Checking…');
    const handle = setTimeout(async () => {
      try {
        const { data: normalized, error: normErr } = await supabase
          .rpc('normalize_login_code', { p_code: proposedCode });
        if (normErr) throw normErr;
        if (!normalized) {
          setCodeStatus('invalid');
          setCodeMessage('Code must be at least 4 letters/numbers.');
          setNormalizedCode('');
          return;
        }
        setNormalizedCode(normalized);
        const { data: available, error: availErr } = await supabase
          .rpc('is_login_code_available', { p_code: proposedCode });
        if (availErr) throw availErr;
        if (available) {
          setCodeStatus('ok');
          setCodeMessage(`Available — teachers will type ${normalized}`);
        } else {
          setCodeStatus('taken');
          setCodeMessage('That code is already taken.');
        }
      } catch (e) {
        setCodeStatus('invalid');
        setCodeMessage(e?.message?.includes('function')
          ? 'Database helpers not installed yet — run the school-code migration.'
          : (e?.message || 'Could not check code.'));
      }
    }, 400);
    return () => clearTimeout(handle);
  }, [proposedCode, view]);

  const handleLookupSchool = async () => {
    const code = schoolCode.trim().toUpperCase();
    if (!code) { setError('Enter your school code first.'); return; }
    setError('');
    setIsLookingUp(true);
    try {
      const { data, error: err } = await supabase.functions.invoke('list-school-teachers', { body: { login_code: code } });
      if (err) throw err;
      if (data?.error) throw new Error(data.error);
      setSchoolNameLookup(data.school_name || '');
      setTeacherList(data.teachers || []);
      setSelectedTeacherEmail('');
      localStorage.setItem('teacher_school_code', code);
      if ((data.teachers || []).length === 0) {
        setError('No teacher logins have been created for this school yet. Ask your admin.');
      }
    } catch (err) {
      setError(err.message || 'Could not find that school.');
      setTeacherList([]);
      setSchoolNameLookup('');
    } finally {
      setIsLookingUp(false);
    }
  };

  const handleTeacherSignIn = async (e) => {
    e.preventDefault();
    if (!selectedTeacherEmail || !password) { setError('Pick your name and enter your password.'); return; }
    setError('');
    setIsLoading(true);
    try {
      const { error: err } = await supabase.auth.signInWithPassword({ email: selectedTeacherEmail, password });
      if (err) throw err;
    } catch (err) {
      if (err.message?.includes('Invalid login credentials')) setError('Wrong password. Ask your admin to reset it if you forgot.');
      else setError(err.message || 'Could not sign in.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      if (mode === 'signup') {
        if (!schoolName.trim()) { setError('Please enter your school name'); setIsLoading(false); return; }
        if (codeStatus !== 'ok' || !normalizedCode) {
          setError('Please pick an available school code before continuing.');
          setIsLoading(false); return;
        }
        const { data, error: err } = await supabase.auth.signUp({
          email, password,
          options: { data: { school_name: schoolName, school_login_code: normalizedCode } },
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

  const cardStyle = {
    background: '#fff',
    borderRadius: 20,
    padding: '40px 36px',
    boxShadow: '0 12px 40px rgba(42,36,33,0.08), 0 2px 8px rgba(42,36,33,0.04)',
    border: '1px solid #ece5db',
    width: '100%',
    maxWidth: 460,
    boxSizing: 'border-box',
  };

  const backBtnStyle = {
    background: 'transparent', border: 'none', cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 6,
    color: '#8a8fa8', fontSize: 13, fontWeight: 600, padding: 0,
    marginBottom: 20,
  };

  const primaryBtn = (loading) => ({
    width: '100%', padding: 16, background: loading ? '#bfb89c' : '#D4AF37',
    color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 800,
    cursor: loading ? 'not-allowed' : 'pointer', boxShadow: '0 4px 16px rgba(212,175,55,0.3)',
    transition: 'all 0.2s', marginTop: 4, letterSpacing: '0.02em',
  });

  const errorBlock = error && (
    <div style={{
      padding: '12px 16px', borderRadius: 10, background: '#FDF0ED',
      border: '1px solid #FADBD8', color: '#C0392B', fontSize: 13,
      fontWeight: 600, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8,
    }}>
      <span>⚠️</span> {error}
    </div>
  );

  const Header = ({ title, subtitle }) => (
    <div style={{ textAlign: 'center', marginBottom: 28 }}>
      <img src={logo} alt="LOGIQ" style={{ width: 56, height: 'auto', borderRadius: 12, marginBottom: 14, boxShadow: '0 4px 14px rgba(212,175,55,0.18)' }} />
      <div style={{ fontSize: 11, fontWeight: 800, color: '#D4AF37', letterSpacing: '0.18em', marginBottom: 14 }}>LOGIQ</div>
      <h2 style={{ fontSize: 24, fontWeight: 800, color: '#2a2421', margin: '0 0 6px' }}>{title}</h2>
      {subtitle && <p style={{ fontSize: 14, color: '#8a8fa8', margin: 0, lineHeight: 1.5 }}>{subtitle}</p>}
    </div>
  );

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f5f2eb',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 20px',
      fontFamily: "'Inter', sans-serif",
    }}>
      <div style={{ width: '100%', maxWidth: 460 }}>

        {/* ───────── CHOOSER ───────── */}
        {view === 'chooser' && (
          <div style={cardStyle}>
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
              <img src={logo} alt="LOGIQ" style={{ width: 72, height: 'auto', borderRadius: 14, marginBottom: 16, boxShadow: '0 6px 20px rgba(212,175,55,0.22)' }} />
              <h1 style={{ fontSize: 30, fontWeight: 800, color: '#D4AF37', margin: '0 0 6px', letterSpacing: '0.08em' }}>LOGIQ</h1>
              <p style={{ fontSize: 13, color: '#8a8fa8', margin: 0, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 600 }}>
                Online School Management
              </p>
            </div>

            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#2a2421', textAlign: 'center', margin: '0 0 6px' }}>
              How would you like to continue?
            </h2>
            <p style={{ fontSize: 13, color: '#8a8fa8', textAlign: 'center', margin: '0 0 24px' }}>
              Choose the option that fits you best.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <ChooserCard
                icon="🏫"
                title="Admin Sign In"
                body="Access your school dashboard, manage students, teachers and finances."
                onClick={() => { setView('admin'); setError(''); }}
                accent="#D4AF37"
              />
              <ChooserCard
                icon="👩‍🏫"
                title="Teacher Sign In"
                body="Pick your school, select your name and enter your password."
                onClick={() => { setView('teacher'); setError(''); }}
                accent="#1B6B3A"
              />
              <ChooserCard
                icon="👨‍👩‍👧"
                title="Parent / Guardian"
                body="Check your child's results and fee balance with your phone number."
                onClick={() => { setView('parent'); setError(''); }}
                accent="#1A5F9C"
              />
              <ChooserCard
                icon="✨"
                title="Register a New School"
                body="Set up your school on LOGIQ in a few minutes."
                onClick={() => { setView('register'); setError(''); }}
                accent="#2a2421"
              />
            </div>

            <p style={{ textAlign: 'center', fontSize: 11, color: '#a0a4b0', marginTop: 28, letterSpacing: '0.05em' }}>
              🇰🇪 Built for Kenyan Schools · CBC Aligned
            </p>
          </div>
        )}

        {/* ───────── ADMIN SIGN IN ───────── */}
        {view === 'admin' && (
          <div style={cardStyle}>
            <button onClick={goChooser} style={backBtnStyle}>← Back</button>
            <Header title="Welcome back" subtitle="Sign in to access your school dashboard" />
            {errorBlock}
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <label style={labelBase}>Email Address</label>
                <div style={{ position: 'relative' }}>
                  <span style={iconPos}>📧</span>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@school.ac.ke" required style={inputBase}
                    onFocus={e => e.target.style.borderColor = '#D4AF37'} onBlur={e => e.target.style.borderColor = '#e6dfd8'} />
                </div>
              </div>
              <div>
                <label style={labelBase}>Password</label>
                <div style={{ position: 'relative' }}>
                  <span style={iconPos}>🔒</span>
                  <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="Enter your password" required minLength={6}
                    style={{ ...inputBase, paddingRight: 48 }}
                    onFocus={e => e.target.style.borderColor = '#D4AF37'} onBlur={e => e.target.style.borderColor = '#e6dfd8'} />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, opacity: 0.5 }}>
                    {showPassword ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>
              <button type="submit" disabled={isLoading} style={primaryBtn(isLoading)}>
                {isLoading ? '⏳ Please wait...' : 'Sign In →'}
              </button>
            </form>
            <p style={{ textAlign: 'center', fontSize: 12, color: '#8a8fa8', marginTop: 24 }}>
              Forgot password? Contact support@logiq.co.ke
            </p>
          </div>
        )}

        {/* ───────── REGISTER SCHOOL ───────── */}
        {view === 'register' && (
          <div style={cardStyle}>
            <button onClick={goChooser} style={backBtnStyle}>← Back</button>
            <Header title="Register your school" subtitle="Set up your school on LOGIQ" />
            {errorBlock}
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <label style={labelBase}>School Name</label>
                <div style={{ position: 'relative' }}>
                  <span style={iconPos}>🏫</span>
                  <input type="text" value={schoolName} onChange={e => setSchoolName(e.target.value)} placeholder="e.g. Mwanga Academy" style={inputBase}
                    onFocus={e => e.target.style.borderColor = '#D4AF37'} onBlur={e => e.target.style.borderColor = '#e6dfd8'} />
                </div>
              </div>
              <div>
                <label style={labelBase}>School Code</label>
                <div style={{ position: 'relative' }}>
                  <span style={iconPos}>🏷️</span>
                  <input
                    type="text"
                    value={proposedCode}
                    onChange={e => { setProposedCode(e.target.value.toUpperCase()); setCodeEdited(true); }}
                    placeholder="e.g. MWANGA-ACADEMY"
                    required
                    style={{ ...inputBase, textTransform: 'uppercase', letterSpacing: '0.04em' }}
                    onFocus={e => e.target.style.borderColor = '#D4AF37'}
                    onBlur={e => e.target.style.borderColor = '#e6dfd8'}
                  />
                </div>
                <div style={{
                  fontSize: 11, marginTop: 6, display: 'flex', alignItems: 'center', gap: 6,
                  color: codeStatus === 'ok' ? '#1B6B3A'
                       : codeStatus === 'checking' ? '#8a8fa8'
                       : codeStatus === 'idle' ? '#8a8fa8'
                       : '#C0392B',
                  fontWeight: 600,
                }}>
                  {codeStatus === 'ok' && '✓'}
                  {codeStatus === 'checking' && '⏳'}
                  {(codeStatus === 'taken' || codeStatus === 'invalid') && '✗'}
                  {codeStatus === 'idle' && '💡'}
                  <span>{codeMessage || 'Teachers will type this code on their sign-in page.'}</span>
                </div>
              </div>
              <div>
                <label style={labelBase}>Email Address</label>
                <div style={{ position: 'relative' }}>
                  <span style={iconPos}>📧</span>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@school.ac.ke" required style={inputBase}
                    onFocus={e => e.target.style.borderColor = '#D4AF37'} onBlur={e => e.target.style.borderColor = '#e6dfd8'} />
                </div>
              </div>
              <div>
                <label style={labelBase}>Password</label>
                <div style={{ position: 'relative' }}>
                  <span style={iconPos}>🔒</span>
                  <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="Min 6 characters" required minLength={6}
                    style={{ ...inputBase, paddingRight: 48 }}
                    onFocus={e => e.target.style.borderColor = '#D4AF37'} onBlur={e => e.target.style.borderColor = '#e6dfd8'} />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, opacity: 0.5 }}>
                    {showPassword ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>
              <button type="submit" disabled={isLoading || codeStatus !== 'ok'} style={primaryBtn(isLoading || codeStatus !== 'ok')}>
                {isLoading ? '⏳ Please wait...' : 'Create Account →'}
              </button>
            </form>
            <p style={{ textAlign: 'center', fontSize: 12, color: '#8a8fa8', marginTop: 24, lineHeight: 1.6 }}>
              By creating an account, you agree to our Terms of Service.
            </p>
          </div>
        )}

        {/* ───────── TEACHER SIGN IN ───────── */}
        {view === 'teacher' && (
          <div style={cardStyle}>
            <button onClick={goChooser} style={backBtnStyle}>← Back</button>
            <Header title="Teacher sign in" subtitle="Enter your school code, pick your name, and sign in" />
            {errorBlock}
            <form onSubmit={handleTeacherSignIn} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <label style={labelBase}>School Code</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <span style={iconPos}>🏷️</span>
                    <input
                      type="text"
                      value={schoolCode}
                      onChange={e => { setSchoolCode(e.target.value.toUpperCase()); setTeacherList([]); setSelectedTeacherEmail(''); }}
                      placeholder="e.g. TABOLWA-HIGH"
                      style={{ ...inputBase, textTransform: 'uppercase' }}
                      onFocus={e => e.target.style.borderColor = '#D4AF37'}
                      onBlur={e => e.target.style.borderColor = '#e6dfd8'}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleLookupSchool}
                    disabled={isLookingUp}
                    style={{
                      padding: '0 18px', borderRadius: 12, border: '1.5px solid #1B6B3A',
                      background: isLookingUp ? '#8A8FA8' : '#fff', color: isLookingUp ? '#fff' : '#1B6B3A',
                      fontWeight: 700, fontSize: 13, cursor: isLookingUp ? 'wait' : 'pointer', whiteSpace: 'nowrap',
                    }}
                  >{isLookingUp ? '…' : 'Find'}</button>
                </div>
                {schoolNameLookup && (
                  <div style={{ fontSize: 12, color: '#1B6B3A', fontWeight: 700, marginTop: 6 }}>✓ {schoolNameLookup}</div>
                )}
              </div>

              {teacherList.length > 0 && (
                <>
                  <div>
                    <label style={labelBase}>Your Name</label>
                    <div style={{ position: 'relative' }}>
                      <span style={iconPos}>👤</span>
                      <select
                        value={selectedTeacherEmail}
                        onChange={e => setSelectedTeacherEmail(e.target.value)}
                        style={{ ...inputBase, appearance: 'auto' }}
                        required
                      >
                        <option value="">— Select your name —</option>
                        {teacherList.map(t => (
                          <option key={t.id} value={t.email}>{t.full_name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label style={labelBase}>Password</label>
                    <div style={{ position: 'relative' }}>
                      <span style={iconPos}>🔒</span>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="Enter your password"
                        required
                        style={{ ...inputBase, paddingRight: 48 }}
                        onFocus={e => e.target.style.borderColor = '#D4AF37'}
                        onBlur={e => e.target.style.borderColor = '#e6dfd8'}
                      />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, opacity: 0.5 }}>
                        {showPassword ? '🙈' : '👁️'}
                      </button>
                    </div>
                  </div>

                  <button type="submit" disabled={isLoading} style={{
                    width: '100%', padding: 16, background: isLoading ? '#8a8fa8' : '#1B6B3A',
                    color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 800,
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    boxShadow: '0 4px 16px rgba(27,107,58,0.3)', transition: 'all 0.2s', marginTop: 4,
                  }}>{isLoading ? '⏳ Signing in…' : 'Sign In →'}</button>
                </>
              )}
            </form>
          </div>
        )}

        {/* ───────── PARENT / GUARDIAN ───────── */}
        {view === 'parent' && (
          <div style={cardStyle}>
            <button onClick={goChooser} style={backBtnStyle}>← Back</button>
            <Header title="Parent / Guardian" subtitle="Enter your school code, phone number and your child's admission number" />
            {errorBlock}
            <form onSubmit={handleParentSignIn} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <label style={labelBase}>School Code</label>
                <div style={{ position: 'relative' }}>
                  <span style={iconPos}>🏷️</span>
                  <input
                    type="text"
                    value={parentSchoolCode}
                    onChange={e => setParentSchoolCode(e.target.value.toUpperCase())}
                    placeholder="e.g. TABOLWA-HIGH"
                    required
                    style={{ ...inputBase, textTransform: 'uppercase' }}
                    onFocus={e => e.target.style.borderColor = '#1A5F9C'}
                    onBlur={e => e.target.style.borderColor = '#e6dfd8'}
                  />
                </div>
              </div>
              <div>
                <label style={labelBase}>Phone Number</label>
                <div style={{ position: 'relative' }}>
                  <span style={iconPos}>📱</span>
                  <input
                    type="tel"
                    value={parentPhone}
                    onChange={e => setParentPhone(e.target.value)}
                    placeholder="e.g. 0712345678"
                    required
                    style={inputBase}
                    onFocus={e => e.target.style.borderColor = '#1A5F9C'}
                    onBlur={e => e.target.style.borderColor = '#e6dfd8'}
                  />
                </div>
              </div>
              <div>
                <label style={labelBase}>Admission Number</label>
                <div style={{ position: 'relative' }}>
                  <span style={iconPos}>🎓</span>
                  <input
                    type="text"
                    value={parentAdmNo}
                    onChange={e => setParentAdmNo(e.target.value)}
                    placeholder="Your child's admission number"
                    required
                    style={inputBase}
                    onFocus={e => e.target.style.borderColor = '#1A5F9C'}
                    onBlur={e => e.target.style.borderColor = '#e6dfd8'}
                  />
                </div>
              </div>
              <button type="submit" disabled={isLoading} style={{
                width: '100%', padding: 16, background: isLoading ? '#8a8fa8' : '#1A5F9C',
                color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 800,
                cursor: isLoading ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 16px rgba(26,95,156,0.3)', transition: 'all 0.2s', marginTop: 4,
              }}>{isLoading ? '⏳ Checking…' : 'View My Child →'}</button>
            </form>
            <p style={{ textAlign: 'center', fontSize: 12, color: '#8a8fa8', marginTop: 24, lineHeight: 1.6 }}>
              Use the phone number you gave the school. If your details don't work, contact the school office.
            </p>
          </div>
        )}

      </div>
    </div>
  );
};

const ChooserCard = ({ icon, title, body, onClick, accent }) => {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '16px 18px',
        background: hover ? '#fafaf5' : '#fff',
        border: `1.5px solid ${hover ? accent : '#ece5db'}`,
        borderRadius: 14,
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'all 0.18s ease',
        boxShadow: hover ? '0 4px 14px rgba(42,36,33,0.06)' : 'none',
      }}
    >
      <div style={{
        width: 44, height: 44, borderRadius: 12,
        background: `${accent}15`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22, flexShrink: 0,
      }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#2a2421', marginBottom: 2 }}>{title}</div>
        <div style={{ fontSize: 12, color: '#8a8fa8', lineHeight: 1.4 }}>{body}</div>
      </div>
      <div style={{ color: accent, fontSize: 18, fontWeight: 700, flexShrink: 0 }}>→</div>
    </button>
  );
};

export default LoginPage;

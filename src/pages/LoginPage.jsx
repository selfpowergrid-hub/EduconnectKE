import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import logo from '../assets/logo.jpg';

const LoginPage = ({ onParentLogin }) => {
  const [view, setView] = useState('chooser'); // 'chooser' | 'admin' | 'register' | 'teacher' | 'parent'
  const mode = view === 'register' ? 'signup' : 'signin';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Teacher login state
  const [schoolCode, setSchoolCode] = useState(() => localStorage.getItem('teacher_school_code') || '');
  const [teacherList, setTeacherList] = useState([]);
  const [schoolNameLookup, setSchoolNameLookup] = useState('');
  const [selectedTeacherEmail, setSelectedTeacherEmail] = useState('');
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [codeNotFound, setCodeNotFound] = useState(false);

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
      onParentLogin?.(data, { school_code: code, phone: parentPhone.trim(), adm_no: parentAdmNo.trim() });
    } catch (err) {
      setError(err.message || 'Could not sign in.');
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-resolve the school (and its teacher list) as the code is typed, so the
  // whole form is filled in one pass — no separate "Find" step. Debounced.
  useEffect(() => {
    if (view !== 'teacher') return;
    const code = schoolCode.trim().toUpperCase();
    setTeacherList([]);
    setSelectedTeacherEmail('');
    setSchoolNameLookup('');
    setCodeNotFound(false);
    if (code.length < 4) { setIsLookingUp(false); return; }

    let cancelled = false;
    setIsLookingUp(true);
    const handle = setTimeout(async () => {
      try {
        const { data, error: err } = await supabase.functions.invoke('list-school-teachers', { body: { school_code: code } });
        if (cancelled) return;
        if (err || data?.error) throw new Error(data?.error || 'not found');
        setSchoolNameLookup(data.school_name || '');
        setTeacherList(data.teachers || []);
        localStorage.setItem('teacher_school_code', code);
        setError((data.teachers || []).length === 0
          ? 'No teacher logins have been created for this school yet. Ask your admin.'
          : '');
      } catch {
        if (cancelled) return;
        setTeacherList([]);
        setSchoolNameLookup('');
        setCodeNotFound(true);   // shown quietly under the field
      } finally {
        if (!cancelled) setIsLookingUp(false);
      }
    }, 500);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [schoolCode, view]);

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
        // The school's code (SCH-###) is assigned automatically by the database
        // on first registration — no code picker at signup.
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
      <div style={{ width: 76, height: 76, margin: '0 auto 12px', borderRadius: 16, background: '#fff', border: '1px solid #ece5db', boxShadow: '0 4px 14px rgba(42,36,33,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 10, boxSizing: 'border-box' }}>
        <img src={logo} alt="LogiQ-Taaluma" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
      </div>
      <div style={{ fontSize: 11, fontWeight: 800, color: '#D4AF37', letterSpacing: '0.06em', marginBottom: 14 }}>LogiQ-Taaluma</div>
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
              <div style={{ width: 128, height: 128, margin: '0 auto 16px', borderRadius: 22, background: '#fff', border: '1px solid #ece5db', boxShadow: '0 8px 24px rgba(42,36,33,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18, boxSizing: 'border-box' }}>
                <img src={logo} alt="LogiQ-Taaluma" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
              </div>
              <h1 style={{ fontSize: 30, fontWeight: 800, color: '#D4AF37', margin: '0 0 6px', letterSpacing: '0.02em' }}>LogiQ-Taaluma</h1>
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
                body="Set up your school on LogiQ-Taaluma in a few minutes."
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
            <Header title="Register your school" subtitle="Set up your school on LogiQ-Taaluma" />
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
              <div style={{
                fontSize: 12, color: '#8A6A1F', background: '#fefbf2',
                border: '1px solid #e6d28a', borderRadius: 10, padding: '10px 14px',
                display: 'flex', alignItems: 'center', gap: 8, lineHeight: 1.5,
              }}>
                <span>🏷️</span>
                <span>Your school code (e.g. <strong>SCH-001</strong>) is assigned automatically and shown in Settings after you sign in. Teachers and parents type it to reach your school.</span>
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
              <button type="submit" disabled={isLoading} style={primaryBtn(isLoading)}>
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
            <Header title="Teacher sign in" subtitle="Enter your school code, name and password, then sign in" />
            {errorBlock}
            <form onSubmit={handleTeacherSignIn} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <label style={labelBase}>School Code</label>
                <div style={{ position: 'relative' }}>
                  <span style={iconPos}>🏷️</span>
                  <input
                    type="text"
                    value={schoolCode}
                    onChange={e => setSchoolCode(e.target.value.toUpperCase())}
                    placeholder="e.g. SCH-001"
                    style={{ ...inputBase, textTransform: 'uppercase' }}
                    onFocus={e => e.target.style.borderColor = '#D4AF37'}
                    onBlur={e => e.target.style.borderColor = '#e6dfd8'}
                  />
                </div>
                {isLookingUp && (
                  <div style={{ fontSize: 12, color: '#8a8fa8', fontWeight: 600, marginTop: 6 }}>⏳ Checking…</div>
                )}
                {!isLookingUp && schoolNameLookup && (
                  <div style={{ fontSize: 12, color: '#1B6B3A', fontWeight: 700, marginTop: 6 }}>✓ {schoolNameLookup}</div>
                )}
                {!isLookingUp && codeNotFound && (
                  <div style={{ fontSize: 12, color: '#C0392B', fontWeight: 700, marginTop: 6 }}>✗ School code not recognised</div>
                )}
              </div>

              <div>
                <label style={labelBase}>Your Name</label>
                <div style={{ position: 'relative' }}>
                  <span style={iconPos}>👤</span>
                  <select
                    value={selectedTeacherEmail}
                    onChange={e => setSelectedTeacherEmail(e.target.value)}
                    disabled={teacherList.length === 0}
                    style={{ ...inputBase, appearance: 'auto', cursor: teacherList.length ? 'pointer' : 'not-allowed', opacity: teacherList.length ? 1 : 0.6 }}
                    required
                  >
                    <option value="">{teacherList.length ? '— Select your name —' : 'Enter your school code first'}</option>
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
                <div style={{ fontSize: 11.5, color: '#8a8fa8', marginTop: 6, lineHeight: 1.5 }}>
                  Your admin sets your password and can reset it if you forget.
                </div>
              </div>

              <button type="submit" disabled={isLoading || !selectedTeacherEmail || !password} style={{
                width: '100%', padding: 16,
                background: (isLoading || !selectedTeacherEmail || !password) ? '#8a8fa8' : '#1B6B3A',
                color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 800,
                cursor: (isLoading || !selectedTeacherEmail || !password) ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 16px rgba(27,107,58,0.3)', transition: 'all 0.2s', marginTop: 4,
              }}>{isLoading ? '⏳ Signing in…' : 'Sign In →'}</button>
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
                    placeholder="e.g. SCH-001"
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

import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import SchoolCodeCard from '../components/school/SchoolCodeCard';

const GRADES_BY_LEVEL = {
  "Pre-Primary": ["PP1", "PP2"],
  "Primary": ["Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6"],
  "Junior Secondary": ["Grade 7", "Grade 8", "Grade 9"],
  "Senior Secondary": ["Grade 10", "Grade 11", "Grade 12"]
};

const GRADE_NAME_TO_CODE = {
  "PP1": "pp1", "PP2": "pp2",
  "Grade 1": "g1", "Grade 2": "g2", "Grade 3": "g3", "Grade 4": "g4", "Grade 5": "g5", "Grade 6": "g6",
  "Grade 7": "g7", "Grade 8": "g8", "Grade 9": "g9",
  "Grade 10": "g10", "Grade 11": "g11", "Grade 12": "g12"
};
const GRADE_CODE_TO_NAME = Object.fromEntries(Object.entries(GRADE_NAME_TO_CODE).map(([k, v]) => [v, k]));

const labelStyle = { display: "block", fontSize: 10, fontWeight: 800, color: "#4A4A6A", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" };
const inputStyle = { width: "100%", padding: "10px 14px", borderRadius: 8, border: "1.5px solid #e6dfd8", fontSize: 13, boxSizing: "border-box", background: "#ffffff", outline: "none" };

const TeacherAllocations = ({ schoolConfig }) => {
  const [teachers, setTeachers] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [streams, setStreams] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTeacher, setSelectedTeacher] = useState(null);

  useEffect(() => {
    if (schoolConfig?.id) fetchAll();
  }, [schoolConfig?.id]);

  const fetchAll = async () => {
    setIsLoading(true);
    try {
      const [t, s, st, a] = await Promise.all([
        supabase.from('staff').select('*').eq('school_id', schoolConfig.id).eq('type', 'Teaching').order('full_name'),
        supabase.from('subjects').select('*').eq('school_id', schoolConfig.id),
        supabase.from('streams').select('*').eq('school_id', schoolConfig.id),
        supabase.from('teacher_assignments').select('*').eq('school_id', schoolConfig.id),
      ]);
      setTeachers(t.data || []);
      setSubjects(s.data || []);
      setStreams(st.data || []);
      setAssignments(a.data || []);
    } catch (err) {
      console.error('Failed to load teacher allocations:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const subjectById = useMemo(() => Object.fromEntries(subjects.map(s => [s.id, s])), [subjects]);
  const streamById = useMemo(() => Object.fromEntries(streams.map(s => [s.id, s])), [streams]);
  const assignmentsByTeacher = useMemo(() => {
    const map = {};
    assignments.forEach(a => {
      (map[a.teacher_staff_id] = map[a.teacher_staff_id] || []).push(a);
    });
    return map;
  }, [assignments]);

  return (
    <div style={{ paddingBottom: 40 }}>
      <div style={{ marginBottom: 16 }}>
        <SchoolCodeCard
          schoolId={schoolConfig?.id}
          currentCode={schoolConfig?.login_code}
          dense
        />
      </div>

      <div style={{ background: "#fff", border: "1px solid #e6dfd8", borderRadius: 12, padding: 24, marginBottom: 24 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#1A1A2E" }}>Teacher Allocations</h3>
        <p style={{ margin: "8px 0 0", fontSize: 13, color: "#8A8FA8", lineHeight: 1.5 }}>
          Assign subjects and classes to each teacher, and create their login so they can enter marks.
          A teacher will only see students and exams that match the assignments below.
        </p>
      </div>

      <div style={{ background: "#fff", border: "1px solid #e6dfd8", borderRadius: 12, overflow: "hidden" }}>
        {isLoading ? (
          <div style={{ padding: 40, textAlign: "center", color: "#8A8FA8" }}>Loading teachers…</div>
        ) : teachers.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "#8A8FA8" }}>
            No teaching staff yet. Add staff under <strong>Staff &amp; Teachers</strong> first.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead style={{ background: "#F8FAFC", borderBottom: "2px solid #E8EAF0" }}>
              <tr>
                <th style={{ padding: "14px 18px", textAlign: "left", color: "#8A8FA8", fontSize: 11, fontWeight: 700 }}>TEACHER</th>
                <th style={{ padding: "14px 18px", textAlign: "left", color: "#8A8FA8", fontSize: 11, fontWeight: 700 }}>LOGIN</th>
                <th style={{ padding: "14px 18px", textAlign: "left", color: "#8A8FA8", fontSize: 11, fontWeight: 700 }}>ASSIGNMENTS</th>
                <th style={{ padding: "14px 18px", textAlign: "right", color: "#8A8FA8", fontSize: 11, fontWeight: 700 }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {teachers.map((t, idx) => {
                const myAssigns = assignmentsByTeacher[t.id] || [];
                return (
                  <tr key={t.id} style={{ borderBottom: "1px solid #F0F2F5", background: idx % 2 === 0 ? "#fff" : "#fafafa" }}>
                    <td style={{ padding: "14px 18px" }}>
                      <div style={{ fontWeight: 700, color: "#1A1A2E" }}>{t.full_name}</div>
                      <div style={{ fontSize: 11, color: "#8A8FA8" }}>{t.role || '—'} · {t.email || 'no email'}</div>
                    </td>
                    <td style={{ padding: "14px 18px" }}>
                      {t.auth_user_id ? (
                        <span style={{ padding: "3px 8px", borderRadius: 12, fontSize: 10, fontWeight: 800, background: "#E8F5EE", color: "#1B6B3A" }}>ACTIVE</span>
                      ) : (
                        <span style={{ padding: "3px 8px", borderRadius: 12, fontSize: 10, fontWeight: 800, background: "#F5F6F8", color: "#8A8FA8" }}>NO LOGIN</span>
                      )}
                    </td>
                    <td style={{ padding: "14px 18px" }}>
                      {myAssigns.length === 0 ? (
                        <span style={{ color: "#8A8FA8", fontStyle: "italic", fontSize: 12 }}>No assignments yet</span>
                      ) : (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {myAssigns.map(a => (
                            <span key={a.id} style={{ padding: "3px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600, background: "#F5EEF8", color: "#6C3483" }}>
                              {subjectById[a.subject_id]?.name || '?'} · {GRADE_CODE_TO_NAME[a.level_id] || a.level_id}
                              {a.stream_id ? ` · ${streamById[a.stream_id]?.name || '?'}` : ' · all streams'}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "14px 18px", textAlign: "right" }}>
                      <button
                        onClick={() => setSelectedTeacher(t)}
                        style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #1B6B3A", background: "#fff", color: "#1B6B3A", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                      >Manage</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {selectedTeacher && (
        <TeacherModal
          teacher={selectedTeacher}
          schoolConfig={schoolConfig}
          subjects={subjects}
          streams={streams}
          assignments={assignmentsByTeacher[selectedTeacher.id] || []}
          onClose={() => setSelectedTeacher(null)}
          onSaved={() => { fetchAll(); }}
        />
      )}
    </div>
  );
};

// ----------------------------------------------------------------------

const TeacherModal = ({ teacher, schoolConfig, subjects, streams, assignments, onClose, onSaved }) => {
  const [newAssign, setNewAssign] = useState({
    subject_id: subjects[0]?.id || '',
    level: 'Senior Secondary',
    grade: 'Grade 10',
    stream_id: '',
  });
  const [isAdding, setIsAdding] = useState(false);
  const [email, setEmail] = useState(teacher.email || '');
  const [password, setPassword] = useState('');
  const [isCreatingLogin, setIsCreatingLogin] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [feedback, setFeedback] = useState({ kind: 'idle', message: '', detail: '' });
  // After a successful create/reset we remember the credentials that landed
  // so the admin can copy them to the teacher without retyping.
  const [savedCreds, setSavedCreds] = useState(null);

  const myStreams = streams.filter(s => s.level_id === GRADE_NAME_TO_CODE[newAssign.grade]);
  const subjectById = Object.fromEntries(subjects.map(s => [s.id, s]));
  const streamById = Object.fromEntries(streams.map(s => [s.id, s]));

  const handleAddAssignment = async () => {
    if (!newAssign.subject_id) { setFeedback('Pick a subject first.'); return; }
    setFeedback('');
    setIsAdding(true);
    try {
      const payload = {
        school_id: schoolConfig.id,
        teacher_staff_id: teacher.id,
        subject_id: newAssign.subject_id,
        level_id: GRADE_NAME_TO_CODE[newAssign.grade],
        stream_id: newAssign.stream_id || null,
      };
      const { error } = await supabase.from('teacher_assignments').insert([payload]);
      if (error) throw error;
      onSaved();
    } catch (err) {
      setFeedback('Failed to add: ' + err.message);
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveAssignment = async (id) => {
    if (!confirm('Remove this assignment?')) return;
    try {
      const { error } = await supabase.from('teacher_assignments').delete().eq('id', id);
      if (error) throw error;
      onSaved();
    } catch (err) {
      alert('Failed to remove: ' + err.message);
    }
  };

  const invokeEdgeFn = async (fnName, body) => {
    const { data, error } = await supabase.functions.invoke(fnName, { body });
    if (error) {
      // Supabase wraps non-2xx responses in a FunctionsHttpError whose body
      // we need to read manually for the actual server message.
      let serverMsg = error.message || 'Unknown error';
      try {
        const ctx = error.context;
        if (ctx && typeof ctx.json === 'function') {
          const body = await ctx.json();
          if (body?.error) serverMsg = body.error;
        }
      } catch { /* ignore */ }
      const e = new Error(serverMsg);
      e.original = error;
      throw e;
    }
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const friendlyError = (err) => {
    const m = err?.message || 'Unknown error';
    if (m.includes('Failed to send a request')) {
      return `Couldn't reach the server. Deploy the Edge Function: supabase functions deploy ${err?.fnName || 'reset-teacher-password'}`;
    }
    return m;
  };

  const handleCreateLogin = async () => {
    if (!email || !password) { setFeedback({ kind: 'error', message: 'Email and password are required.' }); return; }
    if (password.length < 6) { setFeedback({ kind: 'error', message: 'Password must be at least 6 characters.' }); return; }
    setFeedback({ kind: 'idle', message: '' });
    setIsCreatingLogin(true);
    try {
      await invokeEdgeFn('create-teacher-user', { staff_id: teacher.id, email, password });
      const creds = { email, password };
      setSavedCreds(creds);
      setFeedback({
        kind: 'success',
        message: `✓ Login created for ${teacher.full_name}.`,
        detail: 'Share the credentials below with the teacher. They sign in on the Teacher Sign-In page using the school code.',
      });
      onSaved();
    } catch (err) {
      err.fnName = 'create-teacher-user';
      console.error('create-teacher-user failed:', err.original || err);
      setFeedback({ kind: 'error', message: 'Failed: ' + friendlyError(err) });
    } finally {
      setIsCreatingLogin(false);
    }
  };

  const handleResetPassword = async () => {
    if (!password) { setFeedback({ kind: 'error', message: 'Enter the new password first.' }); return; }
    if (password.length < 6) { setFeedback({ kind: 'error', message: 'Password must be at least 6 characters.' }); return; }
    setFeedback({ kind: 'idle', message: '' });
    setIsResetting(true);
    try {
      await invokeEdgeFn('reset-teacher-password', { staff_id: teacher.id, password });
      const creds = { email: teacher.email || email, password };
      setSavedCreds(creds);
      setFeedback({
        kind: 'success',
        message: `✓ Password updated for ${teacher.full_name}.`,
        detail: 'The teacher must sign in with the credentials below. The old password no longer works.',
      });
    } catch (err) {
      err.fnName = 'reset-teacher-password';
      console.error('reset-teacher-password failed:', err.original || err);
      setFeedback({ kind: 'error', message: 'Failed: ' + friendlyError(err) });
    } finally {
      setIsResetting(false);
    }
  };

  const copyCreds = () => {
    if (!savedCreds) return;
    const txt = `Email: ${savedCreds.email}\nPassword: ${savedCreds.password}\nSchool code: ${schoolConfig?.login_code || ''}`;
    navigator.clipboard?.writeText(txt);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(42,36,33,0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20,
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, width: '100%', maxWidth: 700,
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15)', overflow: 'hidden',
      }}>
        <div style={{
          padding: '20px 24px', borderBottom: '1px solid #E8EAF0', background: '#f5f2eb',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{teacher.full_name}</h3>
            <div style={{ fontSize: 12, color: '#8A8FA8', marginTop: 2 }}>{teacher.role || 'Teacher'} · {teacher.tsc_no || 'no TSC'}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#8A8FA8' }}>&times;</button>
        </div>

        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          {/* Login section */}
          <section style={{ marginBottom: 24 }}>
            <h4 style={{ margin: '0 0 12px', fontSize: 13, color: '#1A1A2E', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Login</h4>
            <div style={{ padding: 14, background: '#F8FAFC', border: '1px solid #E8EAF0', borderRadius: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={labelStyle}>Email</label>
                  <input
                    type="email"
                    value={email}
                    disabled={!!teacher.auth_user_id}
                    onChange={(e) => setEmail(e.target.value)}
                    style={{ ...inputStyle, background: teacher.auth_user_id ? '#f5f5f5' : '#fff' }}
                    placeholder="teacher@example.com"
                  />
                </div>
                <div>
                  <label style={labelStyle}>{teacher.auth_user_id ? 'New Password' : 'Initial Password'}</label>
                  <input
                    type="text"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    style={inputStyle}
                    placeholder="At least 6 characters"
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                {teacher.auth_user_id ? (
                  <button
                    onClick={handleResetPassword}
                    disabled={isResetting}
                    style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: isResetting ? '#8A8FA8' : '#1A5F9C', color: '#fff', fontSize: 12, fontWeight: 700, cursor: isResetting ? 'not-allowed' : 'pointer' }}
                  >{isResetting ? 'Resetting…' : 'Reset Password'}</button>
                ) : (
                  <button
                    onClick={handleCreateLogin}
                    disabled={isCreatingLogin}
                    style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: isCreatingLogin ? '#8A8FA8' : '#1B6B3A', color: '#fff', fontSize: 12, fontWeight: 700, cursor: isCreatingLogin ? 'not-allowed' : 'pointer' }}
                  >{isCreatingLogin ? 'Creating…' : 'Create Login'}</button>
                )}
              </div>

              {feedback.kind !== 'idle' && (
                <div style={{
                  marginTop: 12, padding: '12px 14px', borderRadius: 10,
                  background: feedback.kind === 'success' ? '#E8F5EE' : '#FDF0ED',
                  border: `1.5px solid ${feedback.kind === 'success' ? '#1B6B3A' : '#C0392B'}`,
                  color: feedback.kind === 'success' ? '#1B6B3A' : '#C0392B',
                  fontSize: 13, fontWeight: 700, lineHeight: 1.5,
                }}>
                  <div>{feedback.message}</div>
                  {feedback.detail && (
                    <div style={{ marginTop: 4, fontWeight: 500, fontSize: 12, opacity: 0.85 }}>{feedback.detail}</div>
                  )}
                </div>
              )}

              {savedCreds && feedback.kind === 'success' && (
                <div style={{
                  marginTop: 10, padding: 12, borderRadius: 10,
                  background: '#fefbf2', border: '1.5px dashed #D4AF37',
                  display: 'flex', flexDirection: 'column', gap: 6,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: '#8A6A1F', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Credentials to share
                    </div>
                    <button
                      type="button"
                      onClick={copyCreds}
                      style={{
                        padding: '4px 10px', borderRadius: 6, border: '1px solid #D4AF37',
                        background: '#fff', color: '#8A6A1F', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                      }}
                    >📋 Copy all</button>
                  </div>
                  <div style={{ fontSize: 12, color: '#2a2421', fontFamily: 'monospace', lineHeight: 1.7 }}>
                    <div><strong>Email:</strong> {savedCreds.email}</div>
                    <div><strong>Password:</strong> {savedCreds.password}</div>
                    {schoolConfig?.login_code && (
                      <div><strong>School code:</strong> {schoolConfig.login_code}</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Assignments section */}
          <section>
            <h4 style={{ margin: '0 0 12px', fontSize: 13, color: '#1A1A2E', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Assignments</h4>

            <div style={{ padding: 14, background: '#F8FAFC', border: '1px solid #E8EAF0', borderRadius: 10, marginBottom: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: 10, alignItems: 'flex-end' }}>
                <div>
                  <label style={labelStyle}>Subject</label>
                  <select value={newAssign.subject_id} onChange={(e) => setNewAssign({ ...newAssign, subject_id: e.target.value })} style={inputStyle}>
                    {subjects.length === 0 && <option value="">No subjects configured</option>}
                    {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Level</label>
                  <select
                    value={newAssign.level}
                    onChange={(e) => setNewAssign({ ...newAssign, level: e.target.value, grade: GRADES_BY_LEVEL[e.target.value][0], stream_id: '' })}
                    style={inputStyle}
                  >
                    {Object.keys(GRADES_BY_LEVEL).map(l => <option key={l}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Grade</label>
                  <select value={newAssign.grade} onChange={(e) => setNewAssign({ ...newAssign, grade: e.target.value, stream_id: '' })} style={inputStyle}>
                    {GRADES_BY_LEVEL[newAssign.level].map(g => <option key={g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Stream</label>
                  <select value={newAssign.stream_id} onChange={(e) => setNewAssign({ ...newAssign, stream_id: e.target.value })} style={inputStyle}>
                    <option value="">All streams</option>
                    {myStreams.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <button
                  onClick={handleAddAssignment}
                  disabled={isAdding || !newAssign.subject_id}
                  style={{ padding: '10px 14px', borderRadius: 8, border: 'none', background: (isAdding || !newAssign.subject_id) ? '#8A8FA8' : '#1B6B3A', color: '#fff', fontSize: 12, fontWeight: 700, cursor: (isAdding || !newAssign.subject_id) ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', height: 41 }}
                >+ Add</button>
              </div>
            </div>

            {assignments.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: '#8A8FA8', fontStyle: 'italic', fontSize: 13 }}>
                No assignments yet. Add one above.
              </div>
            ) : (
              <div style={{ border: '1px solid #E8EAF0', borderRadius: 10, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead style={{ background: '#F8FAFC' }}>
                    <tr>
                      <th style={{ padding: '10px 14px', textAlign: 'left', color: '#8A8FA8', fontSize: 10, fontWeight: 700 }}>SUBJECT</th>
                      <th style={{ padding: '10px 14px', textAlign: 'left', color: '#8A8FA8', fontSize: 10, fontWeight: 700 }}>GRADE</th>
                      <th style={{ padding: '10px 14px', textAlign: 'left', color: '#8A8FA8', fontSize: 10, fontWeight: 700 }}>STREAM</th>
                      <th style={{ padding: '10px 14px', textAlign: 'right' }} />
                    </tr>
                  </thead>
                  <tbody>
                    {assignments.map(a => (
                      <tr key={a.id} style={{ borderTop: '1px solid #F0F2F5' }}>
                        <td style={{ padding: '10px 14px', fontWeight: 600 }}>{subjectById[a.subject_id]?.name || '—'}</td>
                        <td style={{ padding: '10px 14px' }}>{GRADE_CODE_TO_NAME[a.level_id] || a.level_id}</td>
                        <td style={{ padding: '10px 14px' }}>{a.stream_id ? (streamById[a.stream_id]?.name || '—') : <em style={{ color: '#8A8FA8' }}>all</em>}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                          <button onClick={() => handleRemoveAssignment(a.id)} style={{ background: 'none', border: 'none', color: '#C0392B', cursor: 'pointer', fontSize: 14 }} title="Remove">✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <div style={{ padding: '14px 24px', background: '#f5f2eb', borderTop: '1px solid #E8EAF0', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: '#1B6B3A', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
          >Done</button>
        </div>
      </div>
    </div>
  );
};

export default TeacherAllocations;

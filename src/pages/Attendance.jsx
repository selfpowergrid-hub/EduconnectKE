import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { GRADE_NAME_TO_CODE, gradesByLevelForSchool } from '../lib/schoolLevels';
import PrintSizer, { printCellFont, usePageEstimate } from '../components/PrintSizer';

// Daily class attendance register + termly summary report.
// One row per student per day in attendance_records (upsert on re-mark).

const STATUSES = [
  { key: 'present', label: 'Present', color: '#1B6B3A', bg: '#E8F5EE' },
  { key: 'late', label: 'Late', color: '#D97706', bg: '#FEF3E2' },
  { key: 'absent', label: 'Absent', color: '#C0392B', bg: '#FDEDEC' },
];

const card = { background: '#fff', border: '1px solid #e6dfd8', borderRadius: 12, padding: 18, marginBottom: 16 };
const th = { border: '1px solid #e6dfd8', padding: '8px 10px', textAlign: 'left', fontWeight: 700, background: '#faf8f5', fontSize: 11.5, textTransform: 'uppercase' };
const td = { border: '1px solid #e6dfd8', padding: '6px 10px', fontSize: 12.5 };

const todayStr = () => new Date().toISOString().slice(0, 10);

const Attendance = ({ schoolConfig, userEmail }) => {
  const gradesByLevel = useMemo(() => gradesByLevelForSchool(schoolConfig?.schoolType), [schoolConfig?.schoolType]);
  const [selectedLevel, setSelectedLevel] = useState(() => Object.keys(gradesByLevelForSchool(schoolConfig?.schoolType))[0] || 'Senior Secondary');
  const [selectedClass, setSelectedClass] = useState(() => {
    const first = Object.values(gradesByLevelForSchool(schoolConfig?.schoolType))[0]?.[0];
    return GRADE_NAME_TO_CODE[first] || 'g10';
  });
  const [selectedStream, setSelectedStream] = useState('all');
  const [date, setDate] = useState(todayStr());
  const [viewMode, setViewMode] = useState('register'); // register | summary
  const [rangeFrom, setRangeFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10); });
  const [rangeTo, setRangeTo] = useState(todayStr());

  const [students, setStudents] = useState([]);
  const [dbStreams, setDbStreams] = useState([]);
  const [dayRecords, setDayRecords] = useState({});      // studentId -> status (selected date)
  const [rangeRecords, setRangeRecords] = useState([]);  // rows in [from,to]
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const classesForLevel = useMemo(
    () => (gradesByLevel[selectedLevel] || []).map(name => ({ code: GRADE_NAME_TO_CODE[name], name })),
    [gradesByLevel, selectedLevel]
  );

  useEffect(() => {
    const levels = Object.keys(gradesByLevel);
    if (!levels.length) return;
    if (!levels.includes(selectedLevel)) {
      setSelectedLevel(levels[0]);
      setSelectedClass(GRADE_NAME_TO_CODE[gradesByLevel[levels[0]][0]]);
      return;
    }
    const codes = (gradesByLevel[selectedLevel] || []).map(n => GRADE_NAME_TO_CODE[n]);
    if (codes.length && !codes.includes(selectedClass)) setSelectedClass(codes[0]);
  }, [gradesByLevel, selectedLevel, selectedClass]);

  useEffect(() => {
    if (!schoolConfig?.id) return;
    (async () => {
      const [st, str] = await Promise.all([
        supabase.from('students').select('*').eq('school_id', schoolConfig.id).eq('level_id', selectedClass),
        supabase.from('streams').select('*').eq('school_id', schoolConfig.id),
      ]);
      setStudents(st.data || []);
      setDbStreams(str.data || []);
    })();
  }, [schoolConfig?.id, selectedClass]);

  // Load the selected day's records.
  useEffect(() => {
    if (!schoolConfig?.id || !students.length) { setDayRecords({}); return; }
    (async () => {
      const { data } = await supabase.from('attendance_records').select('*')
        .eq('school_id', schoolConfig.id).eq('att_date', date)
        .in('student_id', students.map(s => s.id));
      const map = {};
      (data || []).forEach(r => { map[r.student_id] = r.status; });
      setDayRecords(map);
    })();
  }, [schoolConfig?.id, students, date]);

  // Load range records for the summary.
  useEffect(() => {
    if (!schoolConfig?.id || viewMode !== 'summary' || !students.length) return;
    (async () => {
      const { data } = await supabase.from('attendance_records').select('*')
        .eq('school_id', schoolConfig.id)
        .gte('att_date', rangeFrom).lte('att_date', rangeTo)
        .in('student_id', students.map(s => s.id));
      setRangeRecords(data || []);
    })();
  }, [schoolConfig?.id, viewMode, students, rangeFrom, rangeTo]);

  const scoped = useMemo(
    () => (selectedStream === 'all' ? students : students.filter(s => s.stream_id === selectedStream))
      .sort((a, b) => (a.first_name || '').localeCompare(b.first_name || '')),
    [students, selectedStream]
  );
  // Streams are school-wide (no grade column); a stream belongs to this class
  // only if one of its students is actually assigned to it.
  const classStreams = useMemo(() => {
    const ids = new Set(students.map(s => s.stream_id).filter(Boolean));
    return dbStreams.filter(s => ids.has(s.id));
  }, [dbStreams, students]);

  const setStatus = (studentId, status) => setDayRecords(prev => ({ ...prev, [studentId]: status }));
  const markAll = (status) => {
    const next = { ...dayRecords };
    scoped.forEach(s => { next[s.id] = status; });
    setDayRecords(next);
  };

  const saveRegister = async () => {
    if (!schoolConfig?.id) return;
    const rows = scoped.filter(s => dayRecords[s.id]).map(s => ({
      school_id: schoolConfig.id,
      student_id: s.id,
      att_date: date,
      status: dayRecords[s.id],
      level_id: selectedClass,
      marked_by: userEmail || null,
    }));
    if (!rows.length) { alert('Mark at least one student first.'); return; }
    setSaving(true);
    try {
      const { data, error } = await supabase.from('attendance_records')
        .upsert(rows, { onConflict: 'student_id,att_date' }).select();
      if (error) throw error;
      if (!data || data.length !== rows.length) throw new Error(`Save was not persisted (expected ${rows.length}, stored ${data?.length || 0}).`);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2500);
    } catch (err) {
      alert('Failed to save register: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const dayStats = useMemo(() => {
    const marked = scoped.filter(s => dayRecords[s.id]);
    const count = (k) => marked.filter(s => dayRecords[s.id] === k).length;
    return { marked: marked.length, present: count('present'), late: count('late'), absent: count('absent') };
  }, [scoped, dayRecords]);

  // Summary: per-student attendance over the range.
  const summaryRows = useMemo(() => {
    const byStudent = {};
    rangeRecords.forEach(r => { (byStudent[r.student_id] = byStudent[r.student_id] || []).push(r); });
    const schoolDays = new Set(rangeRecords.map(r => r.att_date)).size;
    const rows = scoped.map(s => {
      const recs = byStudent[s.id] || [];
      const present = recs.filter(r => r.status === 'present').length;
      const late = recs.filter(r => r.status === 'late').length;
      const absent = recs.filter(r => r.status === 'absent').length;
      const attended = present + late;
      const rate = recs.length ? Math.round(attended / recs.length * 100) : null;
      return { student: s, present, late, absent, marked: recs.length, rate };
    });
    rows.sort((a, b) => (a.rate ?? 101) - (b.rate ?? 101));
    return { rows, schoolDays };
  }, [rangeRecords, scoped]);

  const [printScale, setPrintScale] = useState(100);
  const [printFont, setPrintFont] = useState('auto');
  const estPages = usePageEstimate({
    containerId: 'attendance-print',
    scale: printScale, font: printFont, autoPx: 11,
    deps: [viewMode, scoped, dayRecords, rangeRecords],
  });

  const handlePrint = () => {
    const el = document.getElementById('attendance-print');
    if (!el) return;
    const win = window.open('', '_blank');
    const label = viewMode === 'register' ? `Class Register — ${date}` : `Attendance Summary — ${rangeFrom} to ${rangeTo}`;
    const cls = classesForLevel.find(c => c.code === selectedClass)?.name || '';
    const cellFont = printCellFont(printFont, 11);
    win.document.write(`<html><head><title>${label}</title><style>
      body{font-family:Arial,sans-serif;font-size:12px;padding:16px;color:#111;zoom:${printScale / 100}}
      h1{font-size:18px;margin:0 0 2px}.sub{color:#555;margin-bottom:14px}
      table{width:100%;border-collapse:collapse}th,td{border:1px solid #333;padding:${cellFont <= 8 ? '2px 4px' : '5px 8px'};font-size:${cellFont}px}th{background:#eee;text-align:left}
      button{display:none}
      @media print{@page{margin:12mm}}
    </style></head><body>
      <h1>${(schoolConfig?.schoolName || '').toUpperCase()}</h1>
      <div class="sub">${label} · ${cls}</div>
      ${el.innerHTML}
    </body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 400);
  };

  const filterLabel = { display: 'block', fontSize: 11, fontWeight: 800, color: '#2a2421', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' };
  const filterSelect = { width: '100%', padding: '9px 10px', borderRadius: 8, border: '1px solid #e6dfd8', fontSize: 13, background: '#fff', fontWeight: 600, outline: 'none' };

  return (
    <div style={{ paddingBottom: 40 }}>
      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: 0, borderRadius: 8, overflow: 'hidden', border: '1px solid #e6dfd8', width: 'fit-content', marginBottom: 16 }}>
        {[['register', '📋 Daily Register'], ['summary', '📈 Attendance Summary']].map(([mode, label]) => (
          <button key={mode} onClick={() => setViewMode(mode)} style={{
            padding: '9px 22px', fontSize: 12.5, fontWeight: 700, border: 'none', cursor: 'pointer',
            background: viewMode === mode ? '#D4AF37' : '#fff', color: viewMode === mode ? '#fff' : '#2a2421',
          }}>{label}</button>
        ))}
      </div>

      {/* Filters */}
      <div style={{ background: '#fff', border: '1px solid #e6dfd8', borderRadius: 12, padding: 16, marginBottom: 16, display: 'grid', gridTemplateColumns: viewMode === 'register' ? 'repeat(4, 1fr) auto auto' : 'repeat(3, 1fr) 1fr 1fr auto', gap: 12, alignItems: 'end' }}>
        <div>
          <label style={filterLabel}>Level</label>
          <select value={selectedLevel} onChange={e => { setSelectedLevel(e.target.value); setSelectedClass(GRADE_NAME_TO_CODE[(gradesByLevel[e.target.value] || [])[0]]); setSelectedStream('all'); }} style={filterSelect}>
            {Object.keys(gradesByLevel).map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div>
          <label style={filterLabel}>Class</label>
          <select value={selectedClass} onChange={e => { setSelectedClass(e.target.value); setSelectedStream('all'); }} style={filterSelect}>
            {classesForLevel.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label style={filterLabel}>Stream</label>
          <select value={selectedStream} onChange={e => setSelectedStream(e.target.value)} style={filterSelect}>
            <option value="all">All Streams</option>
            {classStreams.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        {viewMode === 'register' ? (
          <>
            <div>
              <label style={filterLabel}>Date</label>
              <input type="date" value={date} max={todayStr()} onChange={e => setDate(e.target.value)} style={filterSelect} />
            </div>
            <button onClick={saveRegister} disabled={saving} style={{ padding: '10px 20px', background: savedFlash ? '#1B6B3A' : '#D35400', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: saving ? 'wait' : 'pointer', height: 40, whiteSpace: 'nowrap' }}>
              {saving ? '⌛ Saving…' : savedFlash ? '✓ Saved' : '💾 Save Register'}
            </button>
          </>
        ) : (
          <>
            <div>
              <label style={filterLabel}>From</label>
              <input type="date" value={rangeFrom} onChange={e => setRangeFrom(e.target.value)} style={filterSelect} />
            </div>
            <div>
              <label style={filterLabel}>To</label>
              <input type="date" value={rangeTo} max={todayStr()} onChange={e => setRangeTo(e.target.value)} style={filterSelect} />
            </div>
          </>
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <PrintSizer scale={printScale} setScale={setPrintScale} font={printFont} setFont={setPrintFont} pages={estPages} />
          <button onClick={handlePrint} style={{ padding: '10px 18px', background: '#1B6B3A', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', height: 40, whiteSpace: 'nowrap' }}>🖨️ Print</button>
        </div>
      </div>

      <div id="attendance-print">
        {viewMode === 'register' ? (
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#2a2421' }}>
                Register — {date} <span style={{ fontWeight: 600, color: '#8a8fa8', fontSize: 12 }}>({dayStats.marked}/{scoped.length} marked · {dayStats.present} present · {dayStats.late} late · {dayStats.absent} absent)</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => markAll('present')} style={{ padding: '6px 14px', background: '#E8F5EE', color: '#1B6B3A', border: '1px solid #cfe8d9', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>✓ All Present</button>
                <button onClick={() => markAll('absent')} style={{ padding: '6px 14px', background: '#FDEDEC', color: '#C0392B', border: '1px solid #f2cfcb', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>✗ All Absent</button>
              </div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>#</th><th style={th}>ADM</th><th style={th}>Student</th><th style={{ ...th, textAlign: 'center' }}>Status</th></tr></thead>
              <tbody>
                {scoped.map((s, i) => {
                  const current = dayRecords[s.id];
                  return (
                    <tr key={s.id} style={{ background: i % 2 ? '#fafafa' : '#fff' }}>
                      <td style={{ ...td, color: '#8a8fa8', width: 40 }}>{i + 1}</td>
                      <td style={{ ...td, width: 90 }}>{s.adm_no}</td>
                      <td style={{ ...td, fontWeight: 600 }}>{s.first_name} {s.last_name}</td>
                      <td style={{ ...td, textAlign: 'center', width: 300 }}>
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          {STATUSES.map(st => (
                            <button key={st.key} onClick={() => setStatus(s.id, st.key)} style={{
                              padding: '5px 14px', borderRadius: 20, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                              border: current === st.key ? `2px solid ${st.color}` : '1px solid #e6dfd8',
                              background: current === st.key ? st.bg : '#fff',
                              color: current === st.key ? st.color : '#8a8fa8',
                            }}>{st.label}</button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {scoped.length === 0 && <tr><td colSpan={4} style={{ ...td, textAlign: 'center', color: '#8a8fa8', padding: 24 }}>No students in this selection.</td></tr>}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={card}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#2a2421', marginBottom: 4 }}>Attendance Summary — {rangeFrom} → {rangeTo}</div>
            <div style={{ fontSize: 12, color: '#8a8fa8', marginBottom: 14 }}>{summaryRows.schoolDays} school day{summaryRows.schoolDays === 1 ? '' : 's'} with registers in this range. Sorted lowest attendance first.</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>ADM</th><th style={th}>Student</th><th style={{ ...th, textAlign: 'center' }}>Present</th><th style={{ ...th, textAlign: 'center' }}>Late</th><th style={{ ...th, textAlign: 'center' }}>Absent</th><th style={{ ...th, textAlign: 'center' }}>Days Marked</th><th style={{ ...th, textAlign: 'center' }}>Attendance %</th></tr></thead>
              <tbody>
                {summaryRows.rows.map(r => (
                  <tr key={r.student.id}>
                    <td style={td}>{r.student.adm_no}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{r.student.first_name} {r.student.last_name}</td>
                    <td style={{ ...td, textAlign: 'center', color: '#1B6B3A', fontWeight: 700 }}>{r.present}</td>
                    <td style={{ ...td, textAlign: 'center', color: '#D97706', fontWeight: 700 }}>{r.late}</td>
                    <td style={{ ...td, textAlign: 'center', color: '#C0392B', fontWeight: 700 }}>{r.absent}</td>
                    <td style={{ ...td, textAlign: 'center' }}>{r.marked}</td>
                    <td style={{ ...td, textAlign: 'center', fontWeight: 800, color: r.rate === null ? '#8a8fa8' : r.rate >= 90 ? '#1B6B3A' : r.rate >= 75 ? '#D97706' : '#C0392B' }}>{r.rate === null ? '—' : `${r.rate}%`}</td>
                  </tr>
                ))}
                {summaryRows.rows.length === 0 && <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: '#8a8fa8', padding: 24 }}>No students in this selection.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Attendance;

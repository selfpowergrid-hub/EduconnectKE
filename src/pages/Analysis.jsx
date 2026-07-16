import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { defaultGradesFor } from '../data/mockData';
import { LEVELS, GRADE_CODE_TO_NAME, GRADE_NAME_TO_CODE, gradesByLevelForSchool } from '../lib/schoolLevels';
import { applyAggregationPolicy } from '../lib/aggregation';
import Letterhead from '../components/Letterhead';

const levelNameForClass = (classId) => {
  const name = GRADE_CODE_TO_NAME[classId];
  for (const [lvl, grades] of Object.entries(LEVELS)) if (grades.includes(name)) return lvl;
  return null;
};

const TERMS = ['Term 1', 'Term 2', 'Term 3'];

// Report catalogue (grouped) shown in the picker.
const REPORTS = [
  { group: 'Students', items: [
    { id: 'merit', label: 'Class Merit List (Rank Order)' },
    { id: 'topbottom', label: 'Top & Bottom Performers' },
    { id: 'improved', label: 'Most Improved / Most Dropped' },
    { id: 'progress', label: 'Individual Student Progress' },
  ]},
  { group: 'Subjects', items: [
    { id: 'subject', label: 'Subject Performance Analysis' },
    { id: 'subjectvs', label: 'Subject vs School Mean' },
    { id: 'teacher', label: 'Teacher / Allocation Performance' },
  ]},
  { group: 'Class & Stream', items: [
    { id: 'distribution', label: 'Grade Distribution Summary' },
    { id: 'streamcmp', label: 'Stream Comparison' },
    { id: 'trend', label: 'Class Mean Trend' },
  ]},
  { group: 'Cross-cutting', items: [
    { id: 'gender', label: 'Gender Analysis' },
    { id: 'projection', label: 'KCSE / KSSEA Projection (Form 3/4)' },
  ]},
];

const GRADE_COLORS = ['#1B6B3A', '#2E8B57', '#1A5F9C', '#3B82C4', '#D4AF37', '#D97706', '#D35400', '#C0392B', '#96281B'];

// A compact horizontal bar chart from [{label,count,color?}].
const DistBar = ({ data }) => {
  const max = Math.max(1, ...data.map(d => d.count));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {data.map((d, i) => (
        <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
          <div style={{ width: 60, fontWeight: 700, color: '#2a2421', textAlign: 'right' }}>{d.label}</div>
          <div style={{ flex: 1, background: '#f1f0ec', borderRadius: 4, height: 18, position: 'relative', overflow: 'hidden' }}>
            <div style={{ width: `${(d.count / max) * 100}%`, background: d.color || GRADE_COLORS[i % GRADE_COLORS.length], height: '100%', borderRadius: 4, transition: 'width .3s' }} />
          </div>
          <div style={{ width: 40, fontWeight: 700, color: '#2a2421' }}>{d.count}</div>
        </div>
      ))}
    </div>
  );
};

const th = { border: '1px solid #e6dfd8', padding: '8px 10px', textAlign: 'left', fontWeight: 700, background: '#faf8f5', fontSize: 12, position: 'sticky', top: 0 };
const td = { border: '1px solid #e6dfd8', padding: '7px 10px', fontSize: 12.5 };
const tdC = { ...td, textAlign: 'center' };
const card = { background: '#fff', border: '1px solid #e6dfd8', borderRadius: 12, padding: 18, marginBottom: 16 };
const sectionTitle = { fontSize: 15, fontWeight: 800, color: '#2a2421', marginBottom: 12 };

const Analysis = ({ schoolConfig, examsList }) => {
  const gradesByLevel = useMemo(() => gradesByLevelForSchool(schoolConfig?.schoolType), [schoolConfig?.schoolType]);
  const [selectedLevel, setSelectedLevel] = useState(() => Object.keys(gradesByLevelForSchool(schoolConfig?.schoolType))[0] || 'Senior Secondary');
  const [selectedClass, setSelectedClass] = useState(() => {
    const first = Object.values(gradesByLevelForSchool(schoolConfig?.schoolType))[0]?.[0];
    return GRADE_NAME_TO_CODE[first] || 'g10';
  });
  const [selectedStream, setSelectedStream] = useState('all');
  const [selectedTerm, setSelectedTerm] = useState('Term 2');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [reportType, setReportType] = useState('merit');
  const [progressStudentId, setProgressStudentId] = useState(null);

  const [students, setStudents] = useState([]);
  const [dbSubjects, setDbSubjects] = useState([]);
  const [dbGrades, setDbGrades] = useState([]);
  const [aggPolicy, setAggPolicy] = useState(null);
  const [dbStreams, setDbStreams] = useState([]);
  const [allMarks, setAllMarks] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [staff, setStaff] = useState([]);
  const [schoolInfo, setSchoolInfo] = useState(null);
  const [loading, setLoading] = useState(false);

  const classesForLevel = useMemo(
    () => (gradesByLevel[selectedLevel] || []).map(name => ({ code: GRADE_NAME_TO_CODE[name], name })),
    [gradesByLevel, selectedLevel]
  );

  // Snap level/class to valid values once schoolConfig loads.
  useEffect(() => {
    const levels = Object.keys(gradesByLevel);
    if (!levels.length) return;
    if (!levels.includes(selectedLevel)) {
      const lvl = levels[0];
      setSelectedLevel(lvl);
      setSelectedClass(GRADE_NAME_TO_CODE[gradesByLevel[lvl][0]]);
      return;
    }
    const codes = (gradesByLevel[selectedLevel] || []).map(n => GRADE_NAME_TO_CODE[n]);
    if (codes.length && !codes.includes(selectedClass)) setSelectedClass(codes[0]);
  }, [gradesByLevel, selectedLevel, selectedClass]);

  useEffect(() => {
    if (!schoolConfig?.id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const id = schoolConfig.id;
      const [st, su, gr, ag, str, mk, asg, staffRows, si] = await Promise.all([
        supabase.from('students').select('*').eq('school_id', id).eq('level_id', selectedClass),
        supabase.from('subjects').select('*').eq('school_id', id),
        supabase.from('grading_systems').select('*').eq('school_id', id),
        supabase.from('aggregation_policies').select('*').eq('school_id', id).eq('level_category', selectedClass).maybeSingle(),
        supabase.from('streams').select('*').eq('school_id', id),
        supabase.from('marks').select('*').eq('level_id', selectedClass).eq('year', selectedYear),
        supabase.from('teacher_assignments').select('*').eq('school_id', id).eq('level_id', selectedClass),
        supabase.from('staff').select('id, full_name').eq('school_id', id),
        supabase.from('school_information').select('*').eq('school_id', id).maybeSingle(),
      ]);
      if (cancelled) return;
      setStudents(st.data || []);
      setDbSubjects(su.data || []);
      setDbGrades(gr.data || []);
      setAggPolicy(ag.data || null);
      setDbStreams(str.data || []);
      setAllMarks(mk.data || []);
      setAssignments(asg.data || []);
      setStaff(staffRows.data || []);
      setSchoolInfo(si.data || null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [schoolConfig?.id, selectedClass, selectedYear]);

  const isForm = selectedClass === 'f3' || selectedClass === 'f4';
  const classSubjects = useMemo(
    () => dbSubjects.filter(s => s.level_category === selectedClass)
      .sort((a, b) => (a.subject_group || 1) - (b.subject_group || 1) || a.name.localeCompare(b.name)),
    [dbSubjects, selectedClass]
  );
  const scopedStudents = useMemo(
    () => selectedStream === 'all' ? students : students.filter(s => s.stream_id === selectedStream),
    [students, selectedStream]
  );
  // Streams are school-wide (no grade column); a stream belongs to this class
  // only if one of its students is actually assigned to it.
  const classStreams = useMemo(() => {
    const ids = new Set(students.map(s => s.stream_id).filter(Boolean));
    return dbStreams.filter(s => ids.has(s.id));
  }, [dbStreams, students]);
  const staffById = useMemo(() => Object.fromEntries(staff.map(s => [s.id, s.full_name])), [staff]);
  const subjectById = useMemo(() => Object.fromEntries(dbSubjects.map(s => [s.id, s])), [dbSubjects]);
  const streamById = useMemo(() => Object.fromEntries(dbStreams.map(s => [s.id, s.name])), [dbStreams]);

  // --- Grade resolution (grade name-matched, level fallback, then defaults) ---
  const gradeScale = useMemo(() => {
    const gradeName = GRADE_CODE_TO_NAME[selectedClass];
    const levelName = levelNameForClass(selectedClass);
    let scale = dbGrades.filter(g => g.school_grade === gradeName);
    if (!scale.length) scale = dbGrades.filter(g => g.school_level === levelName && (g.school_grade === 'All' || !g.school_grade));
    if (!scale.length) scale = dbGrades.filter(g => g.school_level === levelName);
    if (!scale.length) scale = defaultGradesFor(selectedClass);
    return [...scale].sort((a, b) => (b.min_score || 0) - (a.min_score || 0));
  }, [dbGrades, selectedClass]);

  const getGrade = useCallback((pct) => {
    for (const g of gradeScale) if (pct >= (g.min_score || 0)) return g;
    return { grade: '-', points: 0 };
  }, [gradeScale]);

  const gradeByPoints = useCallback((points) => {
    let best = null;
    gradeScale.forEach(g => {
      if (g.points === points) best = g;
    });
    if (best) return best.grade || best.code;
    // nearest points
    let nearest = null, diff = Infinity;
    gradeScale.forEach(g => { const d = Math.abs((g.points || 0) - points); if (d < diff) { diff = d; nearest = g; } });
    return nearest?.grade || nearest?.code || '-';
  }, [gradeScale]);

  const examsForTerm = useCallback(
    (term) => examsList.filter(e => e.level_id === selectedClass && e.term === term),
    [examsList, selectedClass]
  );

  // Weighted term score for a student in one subject (null if no mark).
  const subjectTermScore = useCallback((studentId, subjectId, term) => {
    const exams = examsForTerm(term);
    if (!exams.length) return null;
    let has = false;
    const weighted = exams.reduce((sum, ex) => {
      const m = allMarks.find(mk => mk.student_id === studentId && mk.exam_id === ex.id && mk.subject_id === subjectId && mk.term === term);
      if (m && m.score !== null && m.score !== undefined) has = true;
      const raw = m?.score || 0;
      const outOf = ex.total_marks || 100;
      const pct = outOf > 0 ? (raw / outOf) * 100 : 0;
      return sum + pct * ((ex.weight || 0) / 100);
    }, 0);
    return has ? weighted : null;
  }, [examsForTerm, allMarks]);

  // Policy-aware overall mean for a student in a term.
  const overallMean = useCallback((studentId, term) => {
    const entries = classSubjects
      .map(sub => ({ score: subjectTermScore(studentId, sub.id, term), group: sub.subject_group || 1, sub }))
      .filter(e => e.score !== null);
    const { counted, belowMinimum } = applyAggregationPolicy(aggPolicy, entries);
    const total = counted.reduce((a, e) => a + e.score, 0);
    const mean = counted.length ? total / counted.length : 0;
    return { mean, total, belowMinimum, subjectsCount: entries.length, counted };
  }, [classSubjects, subjectTermScore, aggPolicy]);

  // Merit rows (students with marks) sorted, ranked.
  const buildMerit = useCallback((pool, term) => {
    const rows = pool.map(s => {
      const o = overallMean(s.id, term);
      return { student: s, ...o, grade: o.subjectsCount ? getGrade(o.mean).grade : '-' };
    }).filter(r => r.subjectsCount > 0);
    rows.sort((a, b) => (b.belowMinimum ? -1 : b.mean) - (a.belowMinimum ? -1 : a.mean));
    let rank = 0, prev = null, seen = 0;
    rows.forEach(r => {
      seen++;
      if (r.belowMinimum) { r.rank = '—'; return; }
      if (prev === null || Math.round(r.mean) !== Math.round(prev)) rank = seen;
      r.rank = rank; prev = r.mean;
    });
    return rows;
  }, [overallMean, getGrade]);

  const gradeDistribution = useCallback((means) => {
    const order = gradeScale.map(g => g.grade || g.code);
    const counts = {};
    order.forEach(g => { counts[g] = 0; });
    means.forEach(m => { const g = getGrade(m).grade; if (counts[g] === undefined) counts[g] = 0; counts[g]++; });
    return order.map((g, i) => ({ label: g, count: counts[g] || 0, color: GRADE_COLORS[i % GRADE_COLORS.length] }));
  }, [gradeScale, getGrade]);

  // Set a default progress student when class loads.
  useEffect(() => {
    if (!progressStudentId && students.length) setProgressStudentId(students[0].id);
    if (progressStudentId && !students.find(s => s.id === progressStudentId)) setProgressStudentId(students[0]?.id || null);
  }, [students, progressStudentId]);

  const reportLabel = REPORTS.flatMap(g => g.items).find(r => r.id === reportType)?.label || 'Analysis Report';
  const scopeSubtitle = `${classesForLevel.find(c => c.code === selectedClass)?.name || selectedClass} · ${selectedStream === 'all' ? 'All Streams' : (streamById[selectedStream] || '')} · ${selectedTerm} · ${selectedYear}`;

  const handlePrint = () => {
    const el = document.getElementById('analysis-print');
    if (!el) return;
    const win = window.open('', '_blank');
    // The letterhead is inside the printable container, so it carries over.
    win.document.write(`<html><head><title>${reportLabel}</title><style>
      body{font-family:Arial,sans-serif;font-size:12px;padding:16px;color:#111}
      table{width:100%;border-collapse:collapse;margin-bottom:14px}
      th,td{border:1px solid #333;padding:5px 8px;font-size:11px}
      th{background:#eee;text-align:left}
      img{max-width:80px;max-height:80px}
      @media print{@page{margin:12mm}}
    </style></head><body>
      ${el.innerHTML}
    </body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 400);
  };

  // ---------------------------------------------------------------- Reports
  const renderMerit = (poolOverride, hideHeader) => {
    const rows = buildMerit(poolOverride || scopedStudents, selectedTerm);
    return (
      <div style={card}>
        {!hideHeader && <div style={sectionTitle}>Class Merit List — {selectedTerm}</div>}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={th}>POS</th><th style={th}>ADM</th><th style={th}>NAME</th><th style={th}>STREAM</th>
              <th style={{ ...th, textAlign: 'center' }}>SUBJECTS</th><th style={{ ...th, textAlign: 'center' }}>MEAN %</th><th style={{ ...th, textAlign: 'center' }}>GRADE</th>
            </tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.student.id}>
                  <td style={{ ...tdC, fontWeight: 800, color: '#1B6B3A' }}>{r.rank}</td>
                  <td style={td}>{r.student.adm_no}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{r.student.first_name} {r.student.last_name}</td>
                  <td style={td}>{streamById[r.student.stream_id] || '—'}</td>
                  <td style={tdC}>{r.subjectsCount}</td>
                  <td style={{ ...tdC, fontWeight: 700 }}>{r.belowMinimum ? '—' : Math.round(r.mean)}</td>
                  <td style={{ ...tdC, fontWeight: 700, color: '#d35400' }}>{r.belowMinimum ? 'BELOW MIN' : r.grade}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={7} style={{ ...tdC, color: '#8a8fa8', padding: 24 }}>No marks captured for this selection.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderTopBottom = () => {
    const rows = buildMerit(scopedStudents, selectedTerm).filter(r => !r.belowMinimum);
    const n = Math.min(5, Math.ceil(rows.length / 2) || 5);
    const top = rows.slice(0, n);
    const bottom = rows.slice(-n).reverse();
    const mini = (title, list, color) => (
      <div style={{ ...card, flex: 1, minWidth: 280 }}>
        <div style={{ ...sectionTitle, color }}>{title}</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>POS</th><th style={th}>NAME</th><th style={{ ...th, textAlign: 'center' }}>MEAN %</th><th style={{ ...th, textAlign: 'center' }}>GRADE</th></tr></thead>
          <tbody>
            {list.map(r => (
              <tr key={r.student.id}>
                <td style={{ ...tdC, fontWeight: 800 }}>{r.rank}</td>
                <td style={{ ...td, fontWeight: 600 }}>{r.student.first_name} {r.student.last_name}</td>
                <td style={{ ...tdC, fontWeight: 700 }}>{Math.round(r.mean)}</td>
                <td style={{ ...tdC, fontWeight: 700, color: '#d35400' }}>{r.grade}</td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={4} style={{ ...tdC, color: '#8a8fa8', padding: 16 }}>No data.</td></tr>}
          </tbody>
        </table>
      </div>
    );
    return <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>{mini(`🏆 Top ${n} Performers`, top, '#1B6B3A')}{mini(`⚠️ Bottom ${n} Performers`, bottom, '#C0392B')}</div>;
  };

  const renderImproved = () => {
    const idx = TERMS.indexOf(selectedTerm);
    const prevTerm = idx > 0 ? TERMS[idx - 1] : null;
    if (!prevTerm) return <div style={card}><div style={{ color: '#8a8fa8' }}>Improvement compares a term with the one before it. Select Term 2 or Term 3.</div></div>;
    const rows = scopedStudents.map(s => {
      const now = overallMean(s.id, selectedTerm);
      const before = overallMean(s.id, prevTerm);
      if (!now.subjectsCount || !before.subjectsCount) return null;
      return { student: s, now: now.mean, before: before.mean, delta: now.mean - before.mean };
    }).filter(Boolean);
    rows.sort((a, b) => b.delta - a.delta);
    const table = (title, list, color) => (
      <div style={{ ...card, flex: 1, minWidth: 300 }}>
        <div style={{ ...sectionTitle, color }}>{title}</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>NAME</th><th style={{ ...th, textAlign: 'center' }}>{prevTerm}</th><th style={{ ...th, textAlign: 'center' }}>{selectedTerm}</th><th style={{ ...th, textAlign: 'center' }}>CHANGE</th></tr></thead>
          <tbody>
            {list.map(r => (
              <tr key={r.student.id}>
                <td style={{ ...td, fontWeight: 600 }}>{r.student.first_name} {r.student.last_name}</td>
                <td style={tdC}>{Math.round(r.before)}</td>
                <td style={tdC}>{Math.round(r.now)}</td>
                <td style={{ ...tdC, fontWeight: 800, color: r.delta >= 0 ? '#1B6B3A' : '#C0392B' }}>{r.delta >= 0 ? '▲ +' : '▼ '}{Math.round(r.delta)}</td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={4} style={{ ...tdC, color: '#8a8fa8', padding: 16 }}>No students with marks in both terms.</td></tr>}
          </tbody>
        </table>
      </div>
    );
    return <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>{table('📈 Most Improved', rows.slice(0, 8), '#1B6B3A')}{table('📉 Most Dropped', rows.slice(-8).reverse(), '#C0392B')}</div>;
  };

  const renderProgress = () => {
    const student = students.find(s => s.id === progressStudentId);
    if (!student) return <div style={card}><div style={{ color: '#8a8fa8' }}>No student selected.</div></div>;
    const termMeans = TERMS.map(t => ({ term: t, ...overallMean(student.id, t) }));
    const maxMean = Math.max(1, ...termMeans.map(t => t.mean));
    return (
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
          <div style={sectionTitle}>Progress — {student.first_name} {student.last_name} ({student.adm_no})</div>
          <select value={progressStudentId} onChange={e => setProgressStudentId(e.target.value)} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #e6dfd8', fontSize: 12, fontWeight: 600 }}>
            {students.map(s => <option key={s.id} value={s.id}>{s.adm_no} — {s.first_name} {s.last_name}</option>)}
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#8a8fa8', marginBottom: 8 }}>OVERALL MEAN BY TERM</div>
            <DistBar data={termMeans.map(t => ({ label: t.term.replace('Term ', 'T'), count: Math.round(t.mean), color: '#1A5F9C' }))} />
            <div style={{ marginTop: 8, fontSize: 11, color: '#8a8fa8' }}>Values are mean %, {maxMean > 0 ? 'higher is better' : 'no marks yet'}.</div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#8a8fa8', marginBottom: 8 }}>PER-SUBJECT SCORE BY TERM</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>SUBJECT</th>{TERMS.map(t => <th key={t} style={{ ...th, textAlign: 'center' }}>{t.replace('Term ', 'T')}</th>)}</tr></thead>
              <tbody>
                {classSubjects.map(sub => (
                  <tr key={sub.id}>
                    <td style={{ ...td, fontWeight: 600 }}>{sub.name}</td>
                    {TERMS.map(t => { const sc = subjectTermScore(student.id, sub.id, t); return <td key={t} style={tdC}>{sc === null ? '-' : Math.round(sc)}</td>; })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const subjectStats = useCallback(() => classSubjects.map(sub => {
    const scores = scopedStudents.map(s => subjectTermScore(s.id, sub.id, selectedTerm)).filter(v => v !== null);
    const mean = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
    return { sub, entries: scores.length, mean, grade: mean === null ? '-' : getGrade(mean).grade, dist: gradeDistribution(scores) };
  }), [classSubjects, scopedStudents, subjectTermScore, selectedTerm, getGrade, gradeDistribution]);

  const renderSubject = () => {
    const stats = subjectStats().filter(s => s.entries > 0).sort((a, b) => (b.mean || 0) - (a.mean || 0));
    return (
      <div style={card}>
        <div style={sectionTitle}>Subject Performance — {selectedTerm}</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={th}>RANK</th><th style={th}>SUBJECT</th><th style={{ ...th, textAlign: 'center' }}>ENTRIES</th>
              <th style={{ ...th, textAlign: 'center' }}>MEAN %</th><th style={{ ...th, textAlign: 'center' }}>GRADE</th>
              {gradeScale.map(g => <th key={g.grade || g.code} style={{ ...th, textAlign: 'center', minWidth: 34 }}>{g.grade || g.code}</th>)}
            </tr></thead>
            <tbody>
              {stats.map((s, i) => (
                <tr key={s.sub.id}>
                  <td style={{ ...tdC, fontWeight: 800, color: '#1B6B3A' }}>{i + 1}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{s.sub.name}</td>
                  <td style={tdC}>{s.entries}</td>
                  <td style={{ ...tdC, fontWeight: 800 }}>{Math.round(s.mean)}</td>
                  <td style={{ ...tdC, fontWeight: 700, color: '#d35400' }}>{s.grade}</td>
                  {s.dist.map(d => <td key={d.label} style={{ ...tdC, color: d.count ? '#2a2421' : '#c9c4bd' }}>{d.count || ''}</td>)}
                </tr>
              ))}
              {stats.length === 0 && <tr><td colSpan={5 + gradeScale.length} style={{ ...tdC, color: '#8a8fa8', padding: 24 }}>No marks captured.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderSubjectVs = () => {
    const stats = subjectStats().filter(s => s.entries > 0);
    const schoolMean = stats.length ? stats.reduce((a, s) => a + s.mean, 0) / stats.length : 0;
    const sorted = [...stats].sort((a, b) => (b.mean || 0) - (a.mean || 0));
    return (
      <div style={card}>
        <div style={sectionTitle}>Subject vs Class Mean — {selectedTerm} <span style={{ fontWeight: 600, color: '#8a8fa8', fontSize: 12 }}>(class mean {Math.round(schoolMean)}%)</span></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sorted.map(s => {
            const diff = s.mean - schoolMean;
            const above = diff >= 0;
            return (
              <div key={s.sub.id} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12.5 }}>
                <div style={{ width: 170, fontWeight: 600 }}>{s.sub.name}</div>
                <div style={{ flex: 1, position: 'relative', height: 20, background: '#f1f0ec', borderRadius: 4 }}>
                  <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 2, background: '#8a8fa8' }} />
                  <div style={{ position: 'absolute', left: above ? '50%' : `${50 + diff / 2}%`, width: `${Math.min(50, Math.abs(diff) / 2)}%`, top: 0, bottom: 0, background: above ? '#1B6B3A' : '#C0392B', borderRadius: 4 }} />
                </div>
                <div style={{ width: 90, fontWeight: 700, color: above ? '#1B6B3A' : '#C0392B' }}>{Math.round(s.mean)}% ({above ? '+' : ''}{Math.round(diff)})</div>
              </div>
            );
          })}
          {sorted.length === 0 && <div style={{ color: '#8a8fa8' }}>No marks captured.</div>}
        </div>
      </div>
    );
  };

  const renderTeacher = () => {
    const rows = assignments.map(a => {
      const streamStudents = a.stream_id ? scopedStudents.filter(s => s.stream_id === a.stream_id) : scopedStudents;
      const scores = streamStudents.map(s => subjectTermScore(s.id, a.subject_id, selectedTerm)).filter(v => v !== null);
      const mean = scores.length ? scores.reduce((x, y) => x + y, 0) / scores.length : null;
      return {
        teacher: staffById[a.teacher_staff_id] || '—',
        subject: subjectById[a.subject_id]?.name || '—',
        stream: a.stream_id ? (streamById[a.stream_id] || '—') : 'All',
        entries: scores.length, mean, grade: mean === null ? '-' : getGrade(mean).grade,
      };
    }).filter(r => r.entries > 0).sort((a, b) => (b.mean || 0) - (a.mean || 0));
    return (
      <div style={card}>
        <div style={sectionTitle}>Teacher / Allocation Performance — {selectedTerm}</div>
        {assignments.length === 0 && <div style={{ color: '#8a8fa8', marginBottom: 10 }}>No teacher allocations set for this class. Assign subjects under <b>Teacher Allocations</b>.</div>}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>TEACHER</th><th style={th}>SUBJECT</th><th style={th}>STREAM</th><th style={{ ...th, textAlign: 'center' }}>ENTRIES</th><th style={{ ...th, textAlign: 'center' }}>MEAN %</th><th style={{ ...th, textAlign: 'center' }}>GRADE</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td style={{ ...td, fontWeight: 600 }}>{r.teacher}</td>
                  <td style={td}>{r.subject}</td>
                  <td style={td}>{r.stream}</td>
                  <td style={tdC}>{r.entries}</td>
                  <td style={{ ...tdC, fontWeight: 800 }}>{Math.round(r.mean)}</td>
                  <td style={{ ...tdC, fontWeight: 700, color: '#d35400' }}>{r.grade}</td>
                </tr>
              ))}
              {rows.length > 0 ? null : <tr><td colSpan={6} style={{ ...tdC, color: '#8a8fa8', padding: 20 }}>No results to show.</td></tr>}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 8, fontSize: 11, color: '#8a8fa8' }}>Reflects only the allocations entered; unassigned subjects are omitted.</div>
      </div>
    );
  };

  const renderDistribution = () => {
    const merit = buildMerit(scopedStudents, selectedTerm).filter(r => !r.belowMinimum);
    const dist = gradeDistribution(merit.map(r => r.mean));
    const total = merit.length;
    return (
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ ...card, flex: 1, minWidth: 320 }}>
          <div style={sectionTitle}>Grade Distribution — {selectedTerm}</div>
          <DistBar data={dist} />
          <div style={{ marginTop: 10, fontSize: 12, color: '#8a8fa8' }}>{total} student{total === 1 ? '' : 's'} with marks.</div>
        </div>
        <div style={{ ...card, flex: 1, minWidth: 280 }}>
          <div style={sectionTitle}>Breakdown</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>GRADE</th><th style={{ ...th, textAlign: 'center' }}>COUNT</th><th style={{ ...th, textAlign: 'center' }}>%</th></tr></thead>
            <tbody>
              {dist.map(d => (
                <tr key={d.label}><td style={{ ...td, fontWeight: 700, color: '#d35400' }}>{d.label}</td><td style={tdC}>{d.count}</td><td style={tdC}>{total ? Math.round(d.count / total * 100) : 0}%</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderStreamCmp = () => {
    const groups = [...classStreams.map(s => ({ id: s.id, name: s.name })), { id: null, name: 'No stream' }];
    const rows = groups.map(g => {
      const pool = students.filter(s => (s.stream_id || null) === g.id);
      const merit = buildMerit(pool, selectedTerm).filter(r => !r.belowMinimum);
      const mean = merit.length ? merit.reduce((a, r) => a + r.mean, 0) / merit.length : null;
      return { name: g.name, count: merit.length, mean, grade: mean === null ? '-' : getGrade(mean).grade };
    }).filter(r => r.count > 0).sort((a, b) => (b.mean || 0) - (a.mean || 0));
    return (
      <div style={card}>
        <div style={sectionTitle}>Stream Comparison — {selectedTerm}</div>
        <div style={{ marginBottom: 16 }}><DistBar data={rows.map(r => ({ label: r.name, count: Math.round(r.mean), color: '#1A5F9C' }))} /></div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>RANK</th><th style={th}>STREAM</th><th style={{ ...th, textAlign: 'center' }}>STUDENTS</th><th style={{ ...th, textAlign: 'center' }}>MEAN %</th><th style={{ ...th, textAlign: 'center' }}>GRADE</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.name}><td style={{ ...tdC, fontWeight: 800, color: '#1B6B3A' }}>{i + 1}</td><td style={{ ...td, fontWeight: 600 }}>{r.name}</td><td style={tdC}>{r.count}</td><td style={{ ...tdC, fontWeight: 800 }}>{Math.round(r.mean)}</td><td style={{ ...tdC, fontWeight: 700, color: '#d35400' }}>{r.grade}</td></tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} style={{ ...tdC, color: '#8a8fa8', padding: 20 }}>No streams with marks.</td></tr>}
          </tbody>
        </table>
      </div>
    );
  };

  const renderTrend = () => {
    const termMean = (pool, term) => { const m = buildMerit(pool, term).filter(r => !r.belowMinimum); return m.length ? m.reduce((a, r) => a + r.mean, 0) / m.length : null; };
    const overall = TERMS.map(t => ({ term: t, mean: termMean(scopedStudents, t) }));
    return (
      <div style={card}>
        <div style={sectionTitle}>Class Mean Trend — {selectedYear}</div>
        <DistBar data={overall.map(o => ({ label: o.term.replace('Term ', 'T'), count: o.mean === null ? 0 : Math.round(o.mean), color: '#1B6B3A' }))} />
        <div style={{ marginTop: 16, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>STREAM</th>{TERMS.map(t => <th key={t} style={{ ...th, textAlign: 'center' }}>{t}</th>)}</tr></thead>
            <tbody>
              {[...classStreams, { id: 'all', name: 'WHOLE CLASS' }].map(st => (
                <tr key={st.id}>
                  <td style={{ ...td, fontWeight: 600 }}>{st.name}</td>
                  {TERMS.map(t => { const pool = st.id === 'all' ? students : students.filter(s => s.stream_id === st.id); const m = termMean(pool, t); return <td key={t} style={tdC}>{m === null ? '-' : Math.round(m)}</td>; })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderGender = () => {
    const genders = [{ key: 'M', label: 'Boys' }, { key: 'F', label: 'Girls' }];
    const summary = genders.map(g => {
      const pool = scopedStudents.filter(s => (s.gender || 'M') === g.key);
      const merit = buildMerit(pool, selectedTerm).filter(r => !r.belowMinimum);
      const mean = merit.length ? merit.reduce((a, r) => a + r.mean, 0) / merit.length : null;
      return { ...g, count: merit.length, mean, grade: mean === null ? '-' : getGrade(mean).grade };
    });
    return (
      <div style={card}>
        <div style={sectionTitle}>Gender Analysis — {selectedTerm}</div>
        <div style={{ marginBottom: 16 }}><DistBar data={summary.map((g, i) => ({ label: g.label, count: g.mean === null ? 0 : Math.round(g.mean), color: i === 0 ? '#1A5F9C' : '#C0392B' }))} /></div>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
          <thead><tr><th style={th}>GROUP</th><th style={{ ...th, textAlign: 'center' }}>STUDENTS</th><th style={{ ...th, textAlign: 'center' }}>MEAN %</th><th style={{ ...th, textAlign: 'center' }}>GRADE</th></tr></thead>
          <tbody>{summary.map(g => <tr key={g.key}><td style={{ ...td, fontWeight: 600 }}>{g.label}</td><td style={tdC}>{g.count}</td><td style={{ ...tdC, fontWeight: 800 }}>{g.mean === null ? '-' : Math.round(g.mean)}</td><td style={{ ...tdC, fontWeight: 700, color: '#d35400' }}>{g.grade}</td></tr>)}</tbody>
        </table>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#8a8fa8', marginBottom: 6 }}>SUBJECT MEAN BY GENDER</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>SUBJECT</th><th style={{ ...th, textAlign: 'center' }}>BOYS</th><th style={{ ...th, textAlign: 'center' }}>GIRLS</th></tr></thead>
            <tbody>
              {classSubjects.map(sub => {
                const val = (key) => { const arr = scopedStudents.filter(s => (s.gender || 'M') === key).map(s => subjectTermScore(s.id, sub.id, selectedTerm)).filter(v => v !== null); return arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : '-'; };
                return <tr key={sub.id}><td style={{ ...td, fontWeight: 600 }}>{sub.name}</td><td style={tdC}>{val('M')}</td><td style={tdC}>{val('F')}</td></tr>;
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderProjection = () => {
    if (!isForm) return <div style={card}><div style={{ color: '#8a8fa8' }}>The KCSE/KSSEA projection applies to Form 3 and Form 4 (best-7 aggregation). Select Form 3 or Form 4.</div></div>;
    const rows = scopedStudents.map(s => {
      const o = overallMean(s.id, selectedTerm);
      if (!o.subjectsCount) return null;
      const counted = o.counted;
      const points = counted.map(e => getGrade(e.score).points || 0);
      const totalPts = points.reduce((a, b) => a + b, 0);
      const meanPts = counted.length ? totalPts / counted.length : 0;
      return { student: s, subjects: counted.length, mean: o.mean, totalPts, meanPts, meanGrade: gradeByPoints(Math.round(meanPts)) };
    }).filter(Boolean).sort((a, b) => b.meanPts - a.meanPts);
    const distMap = {};
    rows.forEach(r => { distMap[r.meanGrade] = (distMap[r.meanGrade] || 0) + 1; });
    const dist = gradeScale.map((g, i) => ({ label: g.grade || g.code, count: distMap[g.grade || g.code] || 0, color: GRADE_COLORS[i % GRADE_COLORS.length] }));
    return (
      <div>
        <div style={{ ...card }}>
          <div style={sectionTitle}>Projected Mean Grade Distribution — {selectedTerm}</div>
          <DistBar data={dist} />
        </div>
        <div style={card}>
          <div style={sectionTitle}>Projected Grades (best {aggPolicy?.min_subjects || 7})</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>POS</th><th style={th}>ADM</th><th style={th}>NAME</th><th style={{ ...th, textAlign: 'center' }}>SUBJECTS</th><th style={{ ...th, textAlign: 'center' }}>TOTAL PTS</th><th style={{ ...th, textAlign: 'center' }}>MEAN PTS</th><th style={{ ...th, textAlign: 'center' }}>MEAN GRADE</th></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.student.id}><td style={{ ...tdC, fontWeight: 800, color: '#1B6B3A' }}>{i + 1}</td><td style={td}>{r.student.adm_no}</td><td style={{ ...td, fontWeight: 600 }}>{r.student.first_name} {r.student.last_name}</td><td style={tdC}>{r.subjects}</td><td style={{ ...tdC, fontWeight: 700 }}>{r.totalPts}</td><td style={tdC}>{r.meanPts.toFixed(1)}</td><td style={{ ...tdC, fontWeight: 800, color: '#d35400' }}>{r.meanGrade}</td></tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={7} style={{ ...tdC, color: '#8a8fa8', padding: 20 }}>No marks captured.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const renderReport = () => {
    switch (reportType) {
      case 'merit': return renderMerit();
      case 'topbottom': return renderTopBottom();
      case 'improved': return renderImproved();
      case 'progress': return renderProgress();
      case 'subject': return renderSubject();
      case 'subjectvs': return renderSubjectVs();
      case 'teacher': return renderTeacher();
      case 'distribution': return renderDistribution();
      case 'streamcmp': return renderStreamCmp();
      case 'trend': return renderTrend();
      case 'gender': return renderGender();
      case 'projection': return renderProjection();
      default: return null;
    }
  };

  const filterLabel = { display: 'block', fontSize: 11, fontWeight: 800, color: '#2a2421', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' };
  const filterSelect = { width: '100%', padding: '9px 10px', borderRadius: 8, border: '1px solid #e6dfd8', fontSize: 13, background: '#fff', fontWeight: 600, outline: 'none', cursor: 'pointer' };

  return (
    <div style={{ paddingBottom: 40 }}>
      {/* Filter bar */}
      <div style={{ background: '#fff', border: '1px solid #e6dfd8', borderRadius: 12, padding: 16, marginBottom: 16, display: 'grid', gridTemplateColumns: 'repeat(5, 1fr) auto', gap: 12, alignItems: 'end' }}>
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
        <div>
          <label style={filterLabel}>Term</label>
          <select value={selectedTerm} onChange={e => setSelectedTerm(e.target.value)} style={filterSelect}>{TERMS.map(t => <option key={t}>{t}</option>)}</select>
        </div>
        <div>
          <label style={filterLabel}>Year</label>
          <select value={selectedYear} onChange={e => setSelectedYear(parseInt(e.target.value))} style={filterSelect}>{[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}</select>
        </div>
        <div>
          <button onClick={handlePrint} style={{ padding: '10px 20px', background: '#1B6B3A', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', height: 40, whiteSpace: 'nowrap' }}>🖨️ Print</button>
        </div>
      </div>

      {/* Report picker */}
      <div style={{ background: '#fff', border: '1px solid #e6dfd8', borderRadius: 12, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: '#2a2421', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Report</span>
        <select value={reportType} onChange={e => setReportType(e.target.value)} style={{ ...filterSelect, width: 'auto', minWidth: 320, background: '#faf8f5' }}>
          {REPORTS.map(g => (
            <optgroup key={g.group} label={g.group}>
              {g.items.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
            </optgroup>
          ))}
        </select>
      </div>

      {/* Report body */}
      <div id="analysis-print">
        <Letterhead
          schoolConfig={schoolConfig}
          schoolInfo={schoolInfo}
          title={reportLabel}
          subtitle={scopeSubtitle}
        />
        {loading ? <div style={{ ...card, textAlign: 'center', color: '#8a8fa8', padding: 40 }}>Loading…</div> : renderReport()}
      </div>
    </div>
  );
};

export default Analysis;

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { getStudentPhotoUrl } from '../lib/imageProcessing';
import { getClassesByType, defaultGradesFor } from '../data/mockData';
import { LEVELS, GRADE_CODE_TO_NAME, GRADE_NAME_TO_CODE, gradesByLevelForSchool } from '../lib/schoolLevels';
import { applyAggregationPolicy } from '../lib/aggregation';
import { resolveComment, renderCommentTokens } from '../lib/reportComments';

// The academic level ("Senior Secondary") a class id ("f3") belongs to — the
// grading system stores its scales against the level name and/or the class.
const levelNameForClass = (classId) => {
  const name = GRADE_CODE_TO_NAME[classId];
  for (const [lvl, grades] of Object.entries(LEVELS)) {
    if (grades.includes(name)) return lvl;
  }
  return null;
};

const Reports = ({ schoolConfig, examsList }) => {
  const [students, setStudents] = useState([]);
  const [dbSubjects, setDbSubjects] = useState([]);
  const [dbGrades, setDbGrades] = useState([]);
  const [aggPolicy, setAggPolicy] = useState(null); // totalling policy row; null = count all
  const [dbComments, setDbComments] = useState([]); // report_comments rows (general + overrides)
  const [classTeachers, setClassTeachers] = useState([]); // class_teachers rows with staff name
  const [dbStreams, setDbStreams] = useState([]);
  const [allMarks, setAllMarks] = useState([]); // marks for ALL students in grade
  const [schoolInfo, setSchoolInfo] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState(null);
  // Classes scoped to what this school actually teaches (so a secondary school
  // sees Grade 10-12 and Form 3/4, never primary grades).
  const currentTypeClasses = useMemo(
    () => getClassesByType(schoolConfig?.schoolType),
    [schoolConfig?.schoolType]
  );
  // Level → grade names map for the standard Level ▸ Class selection.
  const gradesByLevel = useMemo(
    () => gradesByLevelForSchool(schoolConfig?.schoolType),
    [schoolConfig?.schoolType]
  );
  const [selectedLevel, setSelectedLevel] = useState(
    () => Object.keys(gradesByLevelForSchool(schoolConfig?.schoolType))[0] || 'Senior Secondary'
  );
  const [selectedClass, setSelectedClass] = useState(() => {
    const first = Object.values(gradesByLevelForSchool(schoolConfig?.schoolType))[0]?.[0];
    return GRADE_NAME_TO_CODE[first] || 'g10';
  });
  // Grades available in the chosen level, as { code, name } for the dropdown.
  const classesForLevel = useMemo(
    () => (gradesByLevel[selectedLevel] || []).map(name => ({ code: GRADE_NAME_TO_CODE[name], name })),
    [gradesByLevel, selectedLevel]
  );
  const [selectedStream, setSelectedStream] = useState('all');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedTerm, setSelectedTerm] = useState('Term 1');
  // Class/stream position defaults ON for Form 3/4 (8-4-4 ranking convention)
  // and OFF for CBC grades — the user can still toggle it per selection.
  const [showPositions, setShowPositions] = useState(
    () => selectedClass === 'f3' || selectedClass === 'f4'
  );

  const selectedStudent = useMemo(
    () => students.find(s => s.id === selectedStudentId),
    [students, selectedStudentId]
  );

  // schoolConfig loads asynchronously; once its levels are known, snap the
  // Level/Class selection to valid values for this school.
  useEffect(() => {
    const levels = Object.keys(gradesByLevel);
    if (levels.length === 0) return;
    if (!levels.includes(selectedLevel)) {
      const lvl = levels[0];
      setSelectedLevel(lvl);
      setSelectedClass(GRADE_NAME_TO_CODE[gradesByLevel[lvl][0]]);
      return;
    }
    const validCodes = (gradesByLevel[selectedLevel] || []).map(n => GRADE_NAME_TO_CODE[n]);
    if (validCodes.length && !validCodes.includes(selectedClass)) {
      setSelectedClass(validCodes[0]);
    }
  }, [gradesByLevel, selectedLevel, selectedClass]);

  // Default the position toggle per class: ON for Form 3/4, OFF for CBC grades.
  useEffect(() => {
    setShowPositions(selectedClass === 'f3' || selectedClass === 'f4');
  }, [selectedClass]);

  // Exams for selected grade + term
  const gradeExams = useMemo(
    () => examsList.filter(e => e.level_id === selectedClass && e.term === selectedTerm),
    [examsList, selectedClass, selectedTerm]
  );

  // Subjects for selected grade
  const gradeSubjects = useMemo(
    () => dbSubjects.filter(s => s.level_category === selectedClass),
    [dbSubjects, selectedClass]
  );

  // Students filtered by stream
  const filteredStudents = useMemo(() => {
    if (selectedStream === 'all') return students;
    return students.filter(s => s.stream_id === selectedStream);
  }, [students, selectedStream]);

  // Initial data load
  useEffect(() => {
    if (schoolConfig?.id) {
      fetchSubjects();
      fetchGrades();
      fetchStreams();
      fetchSchoolInfo();
    }
  }, [schoolConfig?.id]);

  // Reload students + marks when class/term/year changes
  useEffect(() => {
    if (schoolConfig?.id) {
      fetchStudents();
      fetchAggPolicy();
      fetchComments();
      fetchClassTeachers();
    }
  }, [schoolConfig?.id, selectedClass]);

  useEffect(() => {
    if (schoolConfig?.id && students.length > 0) {
      fetchAllMarks();
    }
  }, [students, selectedTerm, selectedYear]);

  const fetchStudents = async () => {
    const { data } = await supabase
      .from('students').select('*')
      .eq('school_id', schoolConfig.id)
      .eq('level_id', selectedClass);
    setStudents(data || []);
    setSelectedStudentId(null);
  };

  const fetchSubjects = async () => {
    const { data } = await supabase.from('subjects').select('*').eq('school_id', schoolConfig.id);
    setDbSubjects(data || []);
  };

  const fetchGrades = async () => {
    const { data } = await supabase.from('grading_systems').select('*').eq('school_id', schoolConfig.id);
    setDbGrades(data || []);
  };

  // Totalling policy for this class; null (no row) = count all subjects.
  const fetchAggPolicy = async () => {
    const { data } = await supabase
      .from('aggregation_policies')
      .select('*')
      .eq('school_id', schoolConfig.id)
      .eq('level_category', selectedClass)
      .maybeSingle();
    setAggPolicy(data || null);
  };

  // General comments (class teacher / principal) for report cards.
  const fetchComments = async () => {
    const { data } = await supabase
      .from('report_comments')
      .select('*')
      .eq('school_id', schoolConfig.id);
    setDbComments(data || []);
  };

  // Class teachers (joined with the staff name) — signs the report card.
  const fetchClassTeachers = async () => {
    const { data } = await supabase
      .from('class_teachers')
      .select('*, staff(full_name)')
      .eq('school_id', schoolConfig.id);
    setClassTeachers(data || []);
  };

  // The signing class teacher for a student: stream-specific beats grade-wide.
  const classTeacherName = useCallback((student) => {
    const rows = classTeachers.filter(r => r.level_id === student.level_id);
    const hit = rows.find(r => r.stream_id && r.stream_id === student.stream_id) || rows.find(r => !r.stream_id);
    return hit?.staff?.full_name || '';
  }, [classTeachers]);

  const fetchStreams = async () => {
    const { data } = await supabase.from('streams').select('*').eq('school_id', schoolConfig.id);
    setDbStreams(data || []);
  };

  const fetchSchoolInfo = async () => {
    const { data } = await supabase.from('school_information').select('*')
      .eq('school_id', schoolConfig.id).single();
    if (data) setSchoolInfo(data);
  };

  const fetchAllMarks = async () => {
    if (!students.length || !gradeExams.length) return;
    const studentIds = students.map(s => s.id);
    const examIds = examsList.filter(e => e.level_id === selectedClass && e.term === selectedTerm).map(e => e.id);
    if (!examIds.length) return;
    const { data } = await supabase.from('marks').select('*')
      .in('student_id', studentIds)
      .in('exam_id', examIds)
      .eq('year', selectedYear);
    setAllMarks(data || []);
  };

  // Re-fetch marks when term/year/students change
  useEffect(() => {
    if (students.length > 0) fetchAllMarks();
  }, [selectedTerm, selectedYear, students]);

  // Resolve a score to the school's own grading band. grading_systems stores
  // scales against school_level ("Senior Secondary") and school_grade (a class
  // id like "f3", or "All" for the whole level). Narrowest wins: the scale set
  // for this exact class, else the level-wide one, else a CBC default.
  const getGrade = useCallback((score) => {
    const levelName = levelNameForClass(selectedClass);

    let scale = dbGrades.filter(g => g.school_grade === selectedClass);
    if (!scale.length) {
      scale = dbGrades.filter(g => g.school_level === levelName && (g.school_grade === 'All' || !g.school_grade));
    }
    if (!scale.length) scale = dbGrades.filter(g => g.school_level === levelName);
    if (!scale.length) {
      // Built-in defaults: Form 3/4 → A–E scale, everything else → competency.
      scale = defaultGradesFor(selectedClass);
    }
    const sorted = [...scale].sort((a, b) => (b.min_score || 0) - (a.min_score || 0));
    for (const g of sorted) {
      if (score >= (g.min_score || 0)) return g;
    }
    return { grade: '-', description: '' };
  }, [dbGrades, selectedClass]);

  // The comment the teacher configured against a grade (Grading System →
  // Description / Label), shown as the remark for each subject.
  const gradeComment = (g) => g?.description || g?.label || '';

  // Compute weighted score for a student + subject
  // Each raw mark is normalised to a 0-100 percentage using the exam's total_marks
  // (default 100), then multiplied by the exam's weight share.
  const getStudentSubjectScore = useCallback((studentId, subjectId) => {
    if (!gradeExams.length) return 0;
    const totalWeight = gradeExams.reduce((s, e) => s + (e.weight || 0), 0);
    if (!totalWeight) return 0;
    const weighted = gradeExams.reduce((sum, exam) => {
      const mark = allMarks.find(m => m.student_id === studentId && m.exam_id === exam.id && m.subject_id === subjectId);
      const raw = mark?.score || 0;
      const outOf = exam.total_marks || 100;
      const pct = outOf > 0 ? (raw / outOf) * 100 : 0;
      return sum + pct * ((exam.weight || 0) / 100);
    }, 0);
    return weighted;
  }, [allMarks, gradeExams]);

  // Best score in the grade for a subject (across all students)
  const getBestInGrade = useCallback((subjectId) => {
    const bestStudents = selectedStream === 'all' ? students : filteredStudents;
    let best = 0;
    bestStudents.forEach(st => {
      const s = getStudentSubjectScore(st.id, subjectId);
      if (s > best) best = s;
    });
    return best;
  }, [students, filteredStudents, selectedStream, getStudentSubjectScore]);

  // Form 3 / Form 4 (8-4-4) report cards omit subjects the student didn't sit.
  const isForm = selectedClass === 'f3' || selectedClass === 'f4';

  // Build full report data for a student
  const buildReportData = useCallback((student) => {
    return gradeSubjects.map(sub => {
      const score = getStudentSubjectScore(student.id, sub.id);
      const best = getBestInGrade(sub.id);
      const grade = getGrade(score);
      const examScores = gradeExams.map(exam => {
        const m = allMarks.find(mk => mk.student_id === student.id && mk.exam_id === exam.id && mk.subject_id === sub.id);
        return m?.score ?? '-';
      });
      const hasMark = examScores.some(sc => sc !== '-' && sc !== null && sc !== undefined && sc !== '');
      return { sub, score, best, grade, examScores, hasMark };
    });
  }, [gradeSubjects, gradeExams, allMarks, getStudentSubjectScore, getBestInGrade, getGrade]);

  // Which rows to print: for Form 3/4, drop subjects with no marks entered.
  const reportRowsFor = useCallback((student) => {
    const rows = buildReportData(student);
    return isForm ? rows.filter(r => r.hasMark) : rows;
  }, [buildReportData, isForm]);

  // Overall total/average per the class's totalling policy. Without a policy
  // (or with count_all) every sat subject counts — identical to the old math.
  const computeOverall = useCallback((rows) => {
    const entries = rows
      .filter(r => r.score > 0)
      .map(r => ({ score: r.score, group: r.sub.subject_group || 1 }));
    const { counted, belowMinimum } = applyAggregationPolicy(aggPolicy, entries);
    const total = counted.reduce((a, e) => a + e.score, 0);
    const average = counted.length ? total / counted.length : 0;
    return { total, average, belowMinimum };
  }, [aggPolicy]);

  // Role-specific general comments. A class-specific comment set beats the
  // general ('All') set; the student's id picks a wording variation stably;
  // tokens are filled from the student's actual results. Falls back to the
  // grading band's description (teacher) / blank (principal) when unset.
  const buildRemarks = useCallback((student, rows, { average, belowMinimum }) => {
    if (belowMinimum) {
      return {
        teacherRemark: `Sat fewer than the minimum ${aggPolicy?.min_subjects} subjects required for grading.`,
        principalRemark: '',
      };
    }
    const overallGrade = getGrade(average);
    const sat = rows.filter(r => r.score > 0);
    const best = sat.length ? sat.reduce((a, b) => (b.score > a.score ? b : a)).sub.name : null;
    const weak = sat.length ? sat.reduce((a, b) => (b.score < a.score ? b : a)).sub.name : null;
    const tokens = {
      name: (student.first_name || '').trim().split(' ')[0] || 'The student',
      grade: overallGrade.grade,
      mean: average,
      best,
      weak,
    };
    const args = { band: overallGrade.grade, classCode: selectedClass, studentId: student.id };
    const ct = resolveComment(dbComments, { role: 'class_teacher', ...args });
    const pr = resolveComment(dbComments, { role: 'principal', ...args });
    return {
      teacherRemark: ct ? renderCommentTokens(ct, tokens) : gradeComment(overallGrade),
      principalRemark: pr ? renderCommentTokens(pr, tokens) : '',
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbComments, selectedClass, getGrade, aggPolicy]);

  // Class + stream positions for every student in the class. Ranked by overall
  // total (policy-aware, so it uses the counted subjects). Below-minimum
  // students are excluded from ranking but still counted in the "out of" total.
  const rankings = useMemo(() => {
    const withTotals = students.map(s => {
      const { total, belowMinimum } = computeOverall(reportRowsFor(s));
      return { id: s.id, streamId: s.stream_id || null, total, belowMinimum };
    });
    const assign = (list) => {
      const sorted = [...list].filter(x => !x.belowMinimum).sort((a, b) => b.total - a.total);
      const pos = {};
      let rank = 0, prev = null, seen = 0;
      sorted.forEach(item => {
        seen++;
        if (prev === null || Math.round(item.total) !== Math.round(prev)) rank = seen;
        pos[item.id] = rank;
        prev = item.total;
      });
      return pos;
    };
    const classPos = assign(withTotals);
    const streamPos = {};
    const byStream = {};
    withTotals.forEach(w => { (byStream[w.streamId] = byStream[w.streamId] || []).push(w); });
    Object.values(byStream).forEach(group => Object.assign(streamPos, assign(group)));
    const streamSize = {};
    withTotals.forEach(w => { streamSize[w.streamId] = (streamSize[w.streamId] || 0) + 1; });
    return { classSize: students.length, classPos, streamPos, streamSize };
  }, [students, computeOverall, reportRowsFor]);

  const labelStyle = { fontSize: 10, color: '#8A8FA8', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase' };
  const selectStyle = { width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #E8EAF0', fontSize: 12, background: '#fff', outline: 'none' };

  // Position "n / total", or "—" for below-minimum students.
  const posText = (pos, size) => (pos ? `${pos} / ${size}` : '—');

  // Single report card HTML (used for both preview + bulk PDF)
  const ReportCard = ({ student }) => {
    const rows = reportRowsFor(student);
    const { total, average, belowMinimum } = computeOverall(rows);
    const overallGrade = getGrade(average);
    const { teacherRemark, principalRemark } = buildRemarks(student, rows, { average, belowMinimum });
    const remark = teacherRemark;
    const className = currentTypeClasses.find(c => c.id === student.level_id)?.name || student.level_id;
    const streamName = dbStreams.find(s => s.id === student.stream_id)?.name || '—';
    const classPosition = posText(rankings.classPos[student.id], rankings.classSize);
    const streamPosition = student.stream_id
      ? posText(rankings.streamPos[student.id], rankings.streamSize[student.stream_id] || 0)
      : '—';

    return (
      <div style={{ maxWidth: 750, margin: '0 auto', border: '1px solid #000', padding: '20px', background: '#fff', fontSize: 12 }}>
        {/* Header: photo (left) · school info (centre) · logo (right) */}
        <div style={{
          display: 'grid', gridTemplateColumns: '110px 1fr 110px',
          gap: 16, alignItems: 'center',
          borderBottom: '2px solid #000', paddingBottom: 16, marginBottom: 16,
        }}>
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            {student.photo_path ? (
              <img
                src={getStudentPhotoUrl(student.photo_path, student.id)}
                alt={student.first_name}
                style={{ width: 100, height: 100, objectFit: 'cover', border: '1px solid #000' }}
              />
            ) : (
              <div style={{
                width: 100, height: 100, border: '1px dashed #888',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#888', fontSize: 10, textAlign: 'center', padding: 4,
              }}>STUDENT PHOTO</div>
            )}
          </div>

          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: 1 }}>{schoolConfig?.schoolName?.toUpperCase() || 'INSTITUTION NAME'}</div>
            {schoolConfig?.address && (
              <div style={{ fontSize: 10, marginTop: 4 }}>{schoolConfig.address}{schoolConfig.county ? ` · ${schoolConfig.county}` : ''}</div>
            )}
            <div style={{ fontSize: 11, fontWeight: 700, marginTop: 4 }}>MOTTO: {schoolInfo?.motto?.toUpperCase() || 'EDUCATION FOR EXCELLENCE'}</div>
            <div style={{ fontSize: 10, marginTop: 4 }}>EMAIL: {schoolConfig?.email} · TEL: {schoolConfig?.phone}</div>
            <div style={{ display: 'inline-block', marginTop: 10, padding: '4px 20px', border: '2px solid #000', fontSize: 13, fontWeight: 900 }}>STUDENT PROGRESS REPORT</div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            {schoolInfo?.logo_url ? (
              <img src={schoolInfo.logo_url} alt="School Logo" style={{ width: 100, height: 100, objectFit: 'contain' }} />
            ) : (
              <div style={{
                width: 100, height: 100, border: '1px dashed #888',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#888', fontSize: 10, textAlign: 'center', padding: 4,
              }}>SCHOOL LOGO</div>
            )}
          </div>
        </div>

        {/* Student Info — bordered panel, three logical bands */}
        <div style={{ border: '1px solid #000', marginBottom: 16, fontSize: 13.5 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20, padding: '10px 14px', borderBottom: '1px solid #bbb' }}>
            <div><b style={{ fontWeight: 800 }}>NAME:</b>&nbsp; {student.first_name?.toUpperCase()} {student.last_name?.toUpperCase()}</div>
            <div><b style={{ fontWeight: 800 }}>ADM NO:</b>&nbsp; {student.adm_no}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px 20px', padding: '10px 14px', borderBottom: showPositions ? '1px solid #bbb' : 'none' }}>
            <div><b style={{ fontWeight: 800 }}>CLASS:</b>&nbsp; {className}</div>
            <div><b style={{ fontWeight: 800 }}>STREAM:</b>&nbsp; {streamName}</div>
            <div><b style={{ fontWeight: 800 }}>TERM:</b>&nbsp; {selectedTerm.toUpperCase()}</div>
            <div><b style={{ fontWeight: 800 }}>YEAR:</b>&nbsp; {selectedYear}</div>
          </div>
          {showPositions && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20, padding: '10px 14px', background: '#f2f5f2' }}>
              <div><b style={{ fontWeight: 800 }}>CLASS POSITION:</b>&nbsp; <span style={{ fontWeight: 900 }}>{classPosition}</span></div>
              <div><b style={{ fontWeight: 800 }}>STREAM POSITION:</b>&nbsp; <span style={{ fontWeight: 900 }}>{streamPosition}</span></div>
            </div>
          )}
        </div>

        {/* Marks Table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
          <thead>
            <tr style={{ background: '#F0F2F5' }}>
              <th style={{ border: '1px solid #000', padding: '6px 8px', textAlign: 'left' }}>SUBJECT</th>
              {gradeExams.map(e => (
                <th key={e.id} style={{ border: '1px solid #000', padding: '6px 8px', textAlign: 'center', minWidth: 60 }}>
                  {e.name.toUpperCase()}
                  <div style={{ fontSize: 9, fontWeight: 400, color: '#555' }}>/ {e.total_marks || 100}</div>
                </th>
              ))}
              <th style={{ border: '1px solid #000', padding: '6px 8px', textAlign: 'center', background: '#e8f5ee' }}>TOTAL</th>
              <th style={{ border: '1px solid #000', padding: '6px 8px', textAlign: 'center' }}>GRADE</th>
              <th style={{ border: '1px solid #000', padding: '6px 8px', textAlign: 'center', background: '#fff4e5' }}>CLASS BEST</th>
              <th style={{ border: '1px solid #000', padding: '6px 8px', textAlign: 'left' }}>REMARKS</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ sub, score, best, grade, examScores }) => (
              <tr key={sub.id}>
                <td style={{ border: '1px solid #000', padding: '6px 8px' }}>{sub.name}</td>
                {examScores.map((sc, i) => (
                  <td key={i} style={{ border: '1px solid #000', padding: '6px 8px', textAlign: 'center' }}>{sc}</td>
                ))}
                <td style={{ border: '1px solid #000', padding: '6px 8px', textAlign: 'center', fontWeight: 700, background: '#e8f5ee' }}>{Math.round(score)}</td>
                <td style={{ border: '1px solid #000', padding: '6px 8px', textAlign: 'center', fontWeight: 700 }}>{grade.grade}</td>
                <td style={{ border: '1px solid #000', padding: '6px 8px', textAlign: 'center', background: '#fff4e5', color: '#BF6A02', fontWeight: 700 }}>{Math.round(best)}</td>
                <td style={{ border: '1px solid #000', padding: '6px 8px', color: '#555', fontSize: 11 }}>{gradeComment(grade)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: '#e8f5ee', color: '#1A1A2E' }}>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontWeight: 700 }}>SUMMARY</td>
              {gradeExams.map((_, i) => <td key={i} style={{ border: '1px solid #000' }} />)}
              <td style={{ border: '1px solid #000', padding: '6px 8px', textAlign: 'center', fontWeight: 900 }}>{belowMinimum ? '—' : Math.round(total)}</td>
              <td style={{ border: '1px solid #000', padding: '6px 8px', textAlign: 'center', fontWeight: 900 }}>{belowMinimum ? '—' : overallGrade.grade}</td>
              <td style={{ border: '1px solid #000', padding: '6px 8px', textAlign: 'center' }}>AVG: {belowMinimum ? '—' : `${Math.round(average)}%`}</td>
              <td style={{ border: '1px solid #000', padding: '6px 8px' }}>{belowMinimum ? remark : gradeComment(overallGrade)}</td>
            </tr>
          </tfoot>
        </table>

        {/* Class Teacher's remarks — auto-filled with the overall-grade comment,
            with space + signature line. */}
        <div style={{ border: '1px solid #000', padding: '10px', marginBottom: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 5 }}>CLASS TEACHER'S REMARKS:</div>
          <div style={{ minHeight: 34, background: '#F9F9F9' }}>{remark}</div>
          <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
            <span>Name: <u style={{ display: 'inline-block', minWidth: 150 }}>{classTeacherName(student) || ' '}</u> &nbsp; Sign: <u style={{ display: 'inline-block', minWidth: 70 }}>&nbsp;</u></span>
            <span>Date: <u style={{ display: 'inline-block', minWidth: 90 }}>&nbsp;</u></span>
          </div>
        </div>

        {/* Principal's remarks — from the configured comment set (blank if unset). */}
        <div style={{ border: '1px solid #000', padding: '10px', marginBottom: 20 }}>
          <div style={{ fontWeight: 700, marginBottom: 5 }}>PRINCIPAL'S REMARKS:</div>
          <div style={{ minHeight: 34, background: '#F9F9F9' }}>{principalRemark || ' '}</div>
          <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
            <span>Name: <u style={{ display: 'inline-block', minWidth: 150 }}>{schoolInfo?.principal_name || ' '}</u> &nbsp; Sign: <u style={{ display: 'inline-block', minWidth: 70 }}>&nbsp;</u></span>
            <span>Date: <u style={{ display: 'inline-block', minWidth: 90 }}>&nbsp;</u></span>
          </div>
        </div>
      </div>
    );
  };

  const handleBulkPDF = () => {
    const printStudents = filteredStudents.length ? filteredStudents : students;
    if (!printStudents.length) { alert('No students to print.'); return; }

    const win = window.open('', '_blank');
    win.document.write(`<html><head><title>Bulk Report Cards</title>
    <style>
      body { font-family: Arial, sans-serif; font-size: 12px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
      th, td { border: 1px solid #000; padding: 6px 8px; }
      .page { max-width: 750px; margin: 0 auto; padding: 20px; page-break-after: always; }
      .page:last-child { page-break-after: auto; }
      .header-grid { display: grid; grid-template-columns: 110px 1fr 110px; gap: 16px; align-items: center; border-bottom: 2px solid #000; padding-bottom: 16px; margin-bottom: 16px; }
      .header-school { text-align: center; }
      .header-photo, .header-logo { display: flex; }
      .header-photo { justify-content: flex-start; }
      .header-logo { justify-content: flex-end; }
      .photo-box, .logo-box { width: 100px; height: 100px; }
      .photo-box img { width: 100px; height: 100px; object-fit: cover; border: 1px solid #000; }
      .logo-box img { width: 100px; height: 100px; object-fit: contain; }
      .placeholder { width: 100px; height: 100px; border: 1px dashed #888; display: flex; align-items: center; justify-content: center; color: #888; font-size: 10px; text-align: center; padding: 4px; box-sizing: border-box; }
      .info-panel { border: 1px solid #000; margin-bottom: 16px; font-size: 13.5px; }
      .info-band { padding: 10px 14px; display: grid; gap: 8px 20px; }
      .info-name { grid-template-columns: 2fr 1fr; border-bottom: 1px solid #bbb; }
      .info-mid { grid-template-columns: repeat(3, 1fr); border-bottom: 1px solid #bbb; }
      .info-mid-last { border-bottom: none; }
      .info-pos { grid-template-columns: repeat(2, 1fr); background: #f2f5f2; }
      .info-band b { font-weight: 800; }
      .tfoot-row { background: #e8f5ee; color: #1A1A2E; }
      .remarks { border: 1px solid #000; padding: 10px; margin-bottom: 12px; }
      .rem-sign { margin-top: 10px; display: flex; justify-content: space-between; font-size: 11px; }
      .rem-sign u { display: inline-block; }
      @media print { @page { margin: 10mm; } }
    </style></head><body>`);

    printStudents.forEach(student => {
      const rows = reportRowsFor(student);
      const { total, average, belowMinimum } = computeOverall(rows);
      const overallGrade = getGrade(average);
      const { teacherRemark, principalRemark } = buildRemarks(student, rows, { average, belowMinimum });
      const remark = teacherRemark;
      const className = currentTypeClasses.find(c => c.id === student.level_id)?.name || '';
      const streamName = dbStreams.find(s => s.id === student.stream_id)?.name || '—';
      const classPosition = posText(rankings.classPos[student.id], rankings.classSize);
      const streamPosition = student.stream_id
        ? posText(rankings.streamPos[student.id], rankings.streamSize[student.stream_id] || 0)
        : '—';

      win.document.write(`<div class="page">
        <div class="header-grid">
          <div class="header-photo">
            ${student.photo_path
              ? `<div class="photo-box"><img src="${getStudentPhotoUrl(student.photo_path, student.id)}" alt="" /></div>`
              : `<div class="placeholder">STUDENT PHOTO</div>`}
          </div>
          <div class="header-school">
            <div style="font-size:20px;font-weight:900">${(schoolConfig?.schoolName || '').toUpperCase()}</div>
            ${schoolConfig?.address ? `<div style="font-size:10px;margin-top:4px">${schoolConfig.address}${schoolConfig?.county ? ` · ${schoolConfig.county}` : ''}</div>` : ''}
            <div style="font-size:11px;font-weight:700;margin-top:4px">MOTTO: ${(schoolInfo?.motto || 'EDUCATION FOR EXCELLENCE').toUpperCase()}</div>
            <div style="font-size:10px;margin-top:4px">EMAIL: ${schoolConfig?.email || ''} · TEL: ${schoolConfig?.phone || ''}</div>
            <div style="display:inline-block;margin-top:10px;padding:4px 20px;border:2px solid #000;font-size:13px;font-weight:900">STUDENT PROGRESS REPORT</div>
          </div>
          <div class="header-logo">
            ${schoolInfo?.logo_url
              ? `<div class="logo-box"><img src="${schoolInfo.logo_url}" alt="School Logo" /></div>`
              : `<div class="placeholder">SCHOOL LOGO</div>`}
          </div>
        </div>
        <div class="info-panel">
          <div class="info-band info-name">
            <div><b>NAME:</b>&nbsp; ${student.first_name?.toUpperCase()} ${student.last_name?.toUpperCase()}</div>
            <div><b>ADM NO:</b>&nbsp; ${student.adm_no}</div>
          </div>
          <div class="info-band info-mid${showPositions ? '' : ' info-mid-last'}">
            <div><b>CLASS:</b>&nbsp; ${className}</div>
            <div><b>STREAM:</b>&nbsp; ${streamName}</div>
            <div><b>TERM:</b>&nbsp; ${selectedTerm.toUpperCase()}</div>
            <div><b>YEAR:</b>&nbsp; ${selectedYear}</div>
          </div>
          ${showPositions ? `<div class="info-band info-pos">
            <div><b>CLASS POSITION:</b>&nbsp; <span style="font-weight:900">${classPosition}</span></div>
            <div><b>STREAM POSITION:</b>&nbsp; <span style="font-weight:900">${streamPosition}</span></div>
          </div>` : ''}
        </div>
        <table>
          <thead><tr style="background:#F0F2F5">
            <th style="text-align:left">SUBJECT</th>
            ${gradeExams.map(e => `<th style="text-align:center">${e.name.toUpperCase()}<div style="font-size:9px;font-weight:400;color:#555">/ ${e.total_marks || 100}</div></th>`).join('')}
            <th style="text-align:center;background:#e8f5ee">TOTAL</th>
            <th style="text-align:center">GRADE</th>
            <th style="text-align:center;background:#fff4e5">CLASS BEST</th>
            <th style="text-align:left">REMARKS</th>
          </tr></thead>
          <tbody>
            ${rows.map(({ sub, score, best, grade, examScores }) => `
              <tr>
                <td>${sub.name}</td>
                ${examScores.map(sc => `<td style="text-align:center">${sc}</td>`).join('')}
                <td style="text-align:center;font-weight:700;background:#e8f5ee">${Math.round(score)}</td>
                <td style="text-align:center;font-weight:700">${grade.grade}</td>
                <td style="text-align:center;background:#fff4e5;font-weight:700">${Math.round(best)}</td>
                <td style="font-size:11px;color:#555">${gradeComment(grade)}</td>
              </tr>`).join('')}
          </tbody>
          <tfoot>
            <tr class="tfoot-row">
              <td><b>SUMMARY</b></td>
              ${gradeExams.map(() => '<td></td>').join('')}
              <td style="text-align:center;font-weight:900">${belowMinimum ? '—' : Math.round(total)}</td>
              <td style="text-align:center;font-weight:900">${belowMinimum ? '—' : overallGrade.grade}</td>
              <td style="text-align:center">AVG: ${belowMinimum ? '—' : `${Math.round(average)}%`}</td>
              <td>${belowMinimum ? remark : gradeComment(overallGrade)}</td>
            </tr>
          </tfoot>
        </table>
        <div class="remarks">
          <b>CLASS TEACHER'S REMARKS:</b>
          <div style="min-height:34px;background:#F9F9F9">${remark}</div>
          <div class="rem-sign"><span>Name: <u>&nbsp;&nbsp;${classTeacherName(student) || '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;'}&nbsp;&nbsp;</u> &nbsp; Sign: <u>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</u></span><span>Date: <u>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</u></span></div>
        </div>
        <div class="remarks">
          <b>PRINCIPAL'S REMARKS:</b>
          <div style="min-height:34px;background:#F9F9F9">${principalRemark || '&nbsp;'}</div>
          <div class="rem-sign"><span>Name: <u>&nbsp;&nbsp;${schoolInfo?.principal_name || '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;'}&nbsp;&nbsp;</u> &nbsp; Sign: <u>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</u></span><span>Date: <u>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</u></span></div>
        </div>
      </div>`);
    });

    win.document.write('</body></html>');
    win.document.close();
    setTimeout(() => win.print(), 600);
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16 }}>
      {/* Left Panel */}
      <div style={{ background: '#fff', border: '1px solid #E8EAF0', borderRadius: 12, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: 16, borderBottom: '1px solid #E8EAF0' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1A1A2E', marginBottom: 12 }}>Report Generation</div>

          <div style={{ marginBottom: 10 }}>
            <div style={labelStyle}>LEVEL</div>
            <select
              value={selectedLevel}
              onChange={e => {
                const lvl = e.target.value;
                setSelectedLevel(lvl);
                setSelectedClass(GRADE_NAME_TO_CODE[(gradesByLevel[lvl] || [])[0]]);
                setSelectedStream('all');
                setSelectedStudentId(null);
              }}
              style={selectStyle}
            >
              {Object.keys(gradesByLevel).map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
            <div>
              <div style={labelStyle}>CLASS</div>
              <select value={selectedClass} onChange={e => { setSelectedClass(e.target.value); setSelectedStream('all'); setSelectedStudentId(null); }} style={selectStyle}>
                {classesForLevel.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <div style={labelStyle}>STREAM</div>
              <select value={selectedStream} onChange={e => setSelectedStream(e.target.value)} style={selectStyle}>
                <option value="all">All Streams</option>
                {dbStreams.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
            <div>
              <div style={labelStyle}>YEAR</div>
              <select value={selectedYear} onChange={e => setSelectedYear(parseInt(e.target.value))} style={selectStyle}>
                {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div>
              <div style={labelStyle}>TERM</div>
              <select value={selectedTerm} onChange={e => setSelectedTerm(e.target.value)} style={selectStyle}>
                <option>Term 1</option><option>Term 2</option><option>Term 3</option>
              </select>
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#1A1A2E' }}>
            <input
              type="checkbox"
              checked={showPositions}
              onChange={e => setShowPositions(e.target.checked)}
              style={{ width: 15, height: 15, accentColor: '#1B6B3A', cursor: 'pointer' }}
            />
            Show class &amp; stream position on report
          </label>

          <button
            onClick={handleBulkPDF}
            style={{ width: '100%', padding: 10, background: '#1B6B3A', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
          >
            🖨️ Generate Bulk PDF ({filteredStudents.length || students.length} students)
          </button>
        </div>

        {/* Student List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
          <div style={{ fontSize: 10, color: '#8A8FA8', fontWeight: 700, padding: '8px 8px 4px', textTransform: 'uppercase' }}>
            Learners List ({filteredStudents.length})
          </div>
          {filteredStudents.map(s => (
            <div key={s.id} onClick={() => setSelectedStudentId(s.id)}
              style={{
                padding: '8px 12px', borderRadius: 8, cursor: 'pointer', marginBottom: 2, fontSize: 12,
                background: selectedStudentId === s.id ? '#E8F5EE' : 'transparent',
                color: selectedStudentId === s.id ? '#1B6B3A' : '#1A1A2E',
                fontWeight: selectedStudentId === s.id ? 700 : 500,
              }}
            >
              {s.first_name} {s.last_name}
              <div style={{ fontSize: 10, color: '#8A8FA8', fontWeight: 400 }}>{s.adm_no}</div>
            </div>
          ))}
          {filteredStudents.length === 0 && (
            <div style={{ padding: 16, color: '#8A8FA8', fontSize: 12, textAlign: 'center' }}>No students found.</div>
          )}
        </div>
      </div>

      {/* Preview Panel */}
      <div style={{ background: '#fff', border: '1px solid #E8EAF0', borderRadius: 12, padding: 20, overflowY: 'auto', minHeight: 400 }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
          <button
            onClick={() => {
              if (selectedStudent) {
                const w = window.open('', '_blank');
                w.document.write('<html><head><style>body{font-family:Arial;font-size:12px} table{width:100%;border-collapse:collapse} th,td{border:1px solid #000;padding:6px 8px} @media print{@page{margin:10mm}}</style></head><body>');
                w.document.write(document.getElementById('report-preview').innerHTML);
                w.document.write('</body></html>');
                w.document.close();
                setTimeout(() => w.print(), 400);
              }
            }}
            style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #E8EAF0', background: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          >🖨️ Print Report</button>
        </div>

        {selectedStudent ? (
          <div id="report-preview">
            <ReportCard student={selectedStudent} />
          </div>
        ) : (
          <div style={{ textAlign: 'center', marginTop: 60, color: '#8A8FA8' }}>
            <div style={{ fontSize: 40, marginBottom: 20 }}>📂</div>
            <div>Select a student to preview their report card</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Reports;

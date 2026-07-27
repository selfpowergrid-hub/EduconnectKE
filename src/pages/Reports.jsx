import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { getStudentPhotoUrl } from '../lib/imageProcessing';
import { getClassesByType, defaultGradesFor } from '../data/mockData';
import { LEVELS, GRADE_CODE_TO_NAME, GRADE_NAME_TO_CODE, gradesByLevelForSchool } from '../lib/schoolLevels';
import { applyAggregationPolicy } from '../lib/aggregation';
import { resolveComment, renderCommentTokens } from '../lib/reportComments';
import PrintSizer, { printCellFont, usePageEstimate, BW_FILTER } from '../components/PrintSizer';

// The academic level ("Senior Secondary") a class id ("f3") belongs to — the
// grading system stores its scales against the level name and/or the class.
const levelNameForClass = (classId) => {
  const name = GRADE_CODE_TO_NAME[classId];
  for (const [lvl, grades] of Object.entries(LEVELS)) {
    if (grades.includes(name)) return lvl;
  }
  return null;
};

// The full grade/form band the trend chart draws end to end: a student is
// shown across their WHOLE level, terms and all, filled where marks exist.
// Form 3 → Form 1..4; Grade 10 → Grade 10..12; JSS → Grade 7..9; etc.
const trendBandFor = (levelCode) => {
  const g = (code) => [code, GRADE_CODE_TO_NAME[code] || code];
  if (levelCode === 'pp1' || levelCode === 'pp2') return [['pp1', 'PP1'], ['pp2', 'PP2']];
  if (/^g[1-6]$/.test(levelCode)) return ['g1', 'g2', 'g3', 'g4', 'g5', 'g6'].map(g);
  if (/^g[789]$/.test(levelCode)) return ['g7', 'g8', 'g9'].map(g);
  if (['g10', 'g11', 'g12'].includes(levelCode)) return ['g10', 'g11', 'g12'].map(g);
  if (['f1', 'f2', 'f3', 'f4'].includes(levelCode)) return [['f1', 'Form 1'], ['f2', 'Form 2'], ['f3', 'Form 3'], ['f4', 'Form 4']];
  return [g(levelCode)];
};

const PRINT_COLOR = { WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' };
const TREND_H = 150;              // plot height (px) — stretched for clarity
const TREND_SLOT = 34;           // width per term slot
const TREND_BARW = 20;           // bar width inside a slot
const TREND_BAR = '#6B7280';     // term bars: gray
const TREND_KCPE = '#B4B8C4';    // KCPE baseline bar: lighter gray
const shortGrade = (l) => l.replace('Grade ', 'Gr ');

// Faint horizontal rule at each grade's height, drawn behind the bars so
// every column reads cleanly against the axis.
const GridLines = ({ axis }) => axis.map((a, i) => (
  <div key={`gl${i}`} style={{ position: 'absolute', left: 0, right: 0, bottom: `${a.bottom}%`, borderTop: '1px solid #E5E7EB', ...PRINT_COLOR }} />
));

// Grouped bar chart spanning the whole band (React preview version).
// Centered; bars are plain (no labels) — heights align to the grade axis.
const TrendChart = ({ chart }) => (
  <div style={{ display: 'flex', justifyContent: 'center', overflowX: 'auto', paddingTop: 14 }}>
    <div style={{ display: 'inline-flex', alignItems: 'flex-end' }}>
      {/* Y axis: grades evenly down the points ladder */}
      <div style={{ position: 'relative', width: 36, height: TREND_H, flexShrink: 0 }}>
        {chart.axis.map((a, i) => (
          <div key={i} style={{ position: 'absolute', right: 7, bottom: `calc(${a.bottom}% - 4px)`, fontSize: 9, fontWeight: 700, color: '#333', lineHeight: 1, letterSpacing: 0.3 }}>{a.label}</div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', borderLeft: '1px solid #333' }}>
        {chart.kcpeH > 0 && (
          <div style={{ borderRight: '1px solid #ccc' }}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', height: TREND_H, width: 40, borderBottom: '1px solid #333' }}>
              <GridLines axis={chart.axis} />
              <div style={{ position: 'relative', width: TREND_BARW, height: chart.kcpeH, background: TREND_KCPE, ...PRINT_COLOR }} />
            </div>
            <div style={{ height: 14 }} />
            <div style={{ fontSize: 8, fontWeight: 700, textAlign: 'center', borderTop: '1px solid #999', paddingTop: 2, letterSpacing: 0.3 }}>KCPE</div>
          </div>
        )}
        {chart.groups.map((gp, gi) => (
          <div key={gi} style={{ borderRight: gi < chart.groups.length - 1 ? '1px solid #ccc' : 'none' }}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', height: TREND_H, borderBottom: '1px solid #333' }}>
              <GridLines axis={chart.axis} />
              {gp.terms.map((tm, ti) => (
                <div key={ti} style={{ position: 'relative', width: TREND_SLOT, height: TREND_H, display: 'flex', justifyContent: 'center', alignItems: 'flex-end' }}>
                  {tm.h > 0 && <div style={{ position: 'relative', width: TREND_BARW, height: tm.h, background: TREND_BAR, ...PRINT_COLOR }} />}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', paddingTop: 2 }}>
              {gp.terms.map((tm, ti) => (
                <div key={ti} style={{ width: TREND_SLOT, textAlign: 'center', fontSize: 7.5, fontWeight: 600, color: '#444' }}>T{tm.term}</div>
              ))}
            </div>
            <div style={{ fontSize: 8.5, fontWeight: 800, textAlign: 'center', borderTop: '1px solid #999', paddingTop: 2, letterSpacing: 0.3 }}>{shortGrade(gp.label)}</div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

// Same chart as an HTML string (bulk-print version) — kept byte-identical in
// layout to TrendChart so preview and PDF match.
const trendChartHTML = (chart) => {
  const pc = '-webkit-print-color-adjust:exact;print-color-adjust:exact';
  const axis = chart.axis.map(a => `<div style="position:absolute;right:7px;bottom:calc(${a.bottom}% - 4px);font-size:9px;font-weight:700;color:#333;line-height:1;letter-spacing:0.3px">${a.label}</div>`).join('');
  const grid = chart.axis.map(a => `<div style="position:absolute;left:0;right:0;bottom:${a.bottom}%;border-top:1px solid #E5E7EB;${pc}"></div>`).join('');
  const kcpe = chart.kcpeH > 0 ? `<div style="border-right:1px solid #ccc">
    <div style="position:relative;display:flex;align-items:flex-end;justify-content:center;height:${TREND_H}px;width:40px;border-bottom:1px solid #333">${grid}<div style="position:relative;width:${TREND_BARW}px;height:${chart.kcpeH}px;background:${TREND_KCPE};${pc}"></div></div>
    <div style="height:14px"></div>
    <div style="font-size:8px;font-weight:700;text-align:center;border-top:1px solid #999;padding-top:2px;letter-spacing:0.3px">KCPE</div></div>` : '';
  const groups = chart.groups.map((gp, gi) => {
    const bars = gp.terms.map(tm => `<div style="position:relative;width:${TREND_SLOT}px;height:${TREND_H}px;display:flex;justify-content:center;align-items:flex-end">${tm.h > 0 ? `<div style="position:relative;width:${TREND_BARW}px;height:${tm.h}px;background:${TREND_BAR};${pc}"></div>` : ''}</div>`).join('');
    const terms = gp.terms.map(tm => `<div style="width:${TREND_SLOT}px;text-align:center;font-size:7.5px;font-weight:600;color:#444">T${tm.term}</div>`).join('');
    return `<div style="border-right:${gi < chart.groups.length - 1 ? '1px solid #ccc' : 'none'}">
      <div style="position:relative;display:flex;align-items:flex-end;height:${TREND_H}px;border-bottom:1px solid #333">${grid}${bars}</div>
      <div style="display:flex;padding-top:2px">${terms}</div>
      <div style="font-size:8.5px;font-weight:800;text-align:center;border-top:1px solid #999;padding-top:2px;letter-spacing:0.3px">${shortGrade(gp.label)}</div></div>`;
  }).join('');
  return `<div style="display:flex;justify-content:center;overflow-x:auto;padding-top:14px"><div style="display:inline-flex;align-items:flex-end">
    <div style="position:relative;width:36px;height:${TREND_H}px;flex-shrink:0">${axis}</div>
    <div style="display:flex;align-items:flex-end;border-left:1px solid #333">${kcpe}${groups}</div></div></div>`;
};

const Reports = ({ schoolConfig, examsList }) => {
  const [students, setStudents] = useState([]);
  const [dbSubjects, setDbSubjects] = useState([]);
  const [dbGrades, setDbGrades] = useState([]);
  const [aggPolicy, setAggPolicy] = useState(null); // totalling policy row; null = count all
  const [dbComments, setDbComments] = useState([]); // report_comments rows (general + overrides)
  const [classTeachers, setClassTeachers] = useState([]); // class_teachers rows with staff name
  const [assignments, setAssignments] = useState([]);     // teacher_assignments for this class
  const [staffList, setStaffList] = useState([]);         // staff id -> full_name (initials on subject rows)
  const [trendMarks, setTrendMarks] = useState([]);       // ALL marks (every year/term) for this class's students
  const [feeData, setFeeData] = useState(null);           // fees bundle for the optional fees box
  const [showFees, setShowFees] = useState(false);        // fees box on the card is opt-in
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
  const [printScale, setPrintScale] = useState(100);
  const [printFont, setPrintFont] = useState('auto');
  const [printBW, setPrintBW] = useState(false); // black & white print output
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
      fetchAssignments();
    }
  }, [schoolConfig?.id, selectedClass]);

  // Trend marks follow the loaded student list; fees load only when toggled on.
  useEffect(() => {
    if (schoolConfig?.id) fetchTrendMarks(students.map(s => s.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolConfig?.id, students]);

  useEffect(() => {
    if (schoolConfig?.id && showFees && !feeData) fetchFeeData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolConfig?.id, showFees, selectedYear]);

  useEffect(() => { setFeeData(null); }, [selectedYear]);

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

  // Subject-teacher allocations + staff names, for the initials column.
  const fetchAssignments = async () => {
    const [asg, stf] = await Promise.all([
      supabase.from('teacher_assignments').select('*').eq('school_id', schoolConfig.id).eq('level_id', selectedClass),
      supabase.from('staff').select('id, full_name').eq('school_id', schoolConfig.id),
    ]);
    setAssignments(asg.data || []);
    setStaffList(stf.data || []);
  };

  // Every mark this class's students have EVER scored (all years/terms) —
  // powers the Trend Analysis block.
  const fetchTrendMarks = async (studentIds) => {
    if (!studentIds.length) { setTrendMarks([]); return; }
    const { data } = await supabase.from('marks').select('*').in('student_id', studentIds);
    setTrendMarks(data || []);
  };

  // Fees bundle for the optional fees box (only fetched when toggled on).
  const fetchFeeData = async () => {
    const yr = selectedYear;
    const [structures, vhs, cats, sfc, pays, adjs, burs] = await Promise.all([
      supabase.from('fee_structures').select('fee_level, votehead_id, category_id, t1, t2, t3, status').eq('school_id', schoolConfig.id).eq('year', yr),
      supabase.from('voteheads').select('id, applies_to, is_active').eq('school_id', schoolConfig.id),
      supabase.from('fee_categories').select('id, name, kind').eq('school_id', schoolConfig.id),
      supabase.from('student_fee_categories').select('*').eq('school_id', schoolConfig.id).eq('year', yr),
      supabase.from('fee_payments').select('student_id, amount, status').eq('school_id', schoolConfig.id).eq('year', yr),
      supabase.from('fee_adjustments').select('student_id, amount, status').eq('school_id', schoolConfig.id).eq('year', yr),
      supabase.from('fee_bursary_awards').select('student_id, amount, status').eq('school_id', schoolConfig.id).eq('year', yr),
    ]);
    setFeeData({
      structures: (structures.data || []).filter(r => r.status === 'published'),
      voteheads: vhs.data || [],
      cats: cats.data || [],
      sfc: sfc.data || [],
      pays: (pays.data || []).filter(p => p.status === 'active'),
      concessions: [...(adjs.data || []), ...(burs.data || [])].filter(a => a.status === 'active'),
    });
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
  // NAME like "Form 3", or "All" for the whole level). Narrowest wins: the
  // scale set for this exact class, else the level-wide one, else a default.
  const getGrade = useCallback((score) => {
    const levelName = levelNameForClass(selectedClass);

    let scale = dbGrades.filter(g => g.school_grade === GRADE_CODE_TO_NAME[selectedClass]);
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

  // Report cards only show subjects the student actually has marks in —
  // untouched subjects never print (applies to every class, CBC and 8-4-4).
  const reportRowsFor = useCallback((student) => {
    return buildReportData(student).filter(r => r.hasMark);
  }, [buildReportData]);

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

  // ------- Points, V.A.P, subject positions, teacher initials, trend, fees --

  // The grading scale used by getGrade, exposed for points math.
  const cardScale = useMemo(() => {
    const gradeName = GRADE_CODE_TO_NAME[selectedClass];
    const levelName = levelNameForClass(selectedClass);
    let scale = dbGrades.filter(g => g.school_grade === gradeName);
    if (!scale.length) scale = dbGrades.filter(g => g.school_level === levelName && (g.school_grade === 'All' || !g.school_grade));
    if (!scale.length) scale = dbGrades.filter(g => g.school_level === levelName);
    if (!scale.length) scale = defaultGradesFor(selectedClass);
    return [...scale].sort((a, b) => (b.min_score || 0) - (a.min_score || 0));
  }, [dbGrades, selectedClass]);
  const maxPoints = useMemo(() => Math.max(1, ...cardScale.map(g => g.points || 0)), [cardScale]);
  const gradeByPoints = useCallback((points) => {
    const rounded = Math.round(points);
    const exact = cardScale.find(g => g.points === rounded);
    if (exact) return exact.grade || exact.code || '-';
    let nearest = null, diff = Infinity;
    cardScale.forEach(g => { const d = Math.abs((g.points || 0) - points); if (d < diff) { diff = d; nearest = g; } });
    return nearest?.grade || nearest?.code || '-';
  }, [cardScale]);

  // Points summary for a card: policy-counted subjects → total points, mean
  // grade, and the maximum possible ("out of N").
  const pointsSummaryFor = useCallback((rows) => {
    const entries = rows.filter(r => r.score > 0).map(r => ({ score: r.score, group: r.sub.subject_group || 1 }));
    const { counted } = applyAggregationPolicy(aggPolicy, entries);
    const pts = counted.reduce((a, e) => a + (getGrade(e.score).points || 0), 0);
    const meanPts = counted.length ? pts / counted.length : 0;
    return { pts, meanGrade: counted.length ? gradeByPoints(meanPts) : '-', outOf: counted.length * maxPoints, meanPts };
  }, [aggPolicy, getGrade, gradeByPoints, maxPoints]);

  // V.A.P exactly as broadsheets print it (both sides as percentages).
  const vapFor = useCallback((meanPts, kcpe) => {
    if (!kcpe) return null;
    return (meanPts / maxPoints * 100) - (kcpe / 500 * 100);
  }, [maxPoints]);

  // Per-subject standing: for each subject, students' scores sorted so a
  // card can print "POS n / m" per subject row.
  const subjectStandings = useMemo(() => {
    const map = {};
    gradeSubjects.forEach(sub => {
      const scores = students
        .map(s => ({ id: s.id, score: getStudentSubjectScore(s.id, sub.id) }))
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score);
      map[sub.id] = scores;
    });
    return map;
  }, [gradeSubjects, students, getStudentSubjectScore]);
  const subjectPosFor = useCallback((studentId, subjectId) => {
    const list = subjectStandings[subjectId] || [];
    const mine = list.find(x => x.id === studentId);
    if (!mine) return null;
    const rank = 1 + list.filter(x => Math.round(x.score) > Math.round(mine.score)).length;
    return { pos: rank, outOf: list.length };
  }, [subjectStandings]);

  // Subject teacher initials from Teacher Allocations (stream-specific wins).
  const initialsFor = useCallback((student, subjectId) => {
    const forSubject = assignments.filter(a => a.subject_id === subjectId);
    if (!forSubject.length) return '';
    const match = forSubject.find(a => a.stream_id && a.stream_id === student.stream_id)
      || forSubject.find(a => !a.stream_id) || forSubject[0];
    const name = staffList.find(t => t.id === match.teacher_staff_id)?.full_name || '';
    return name
      .replace(/\b(mr|mrs|ms|miss|dr|prof|rev|fr|sr)\.?\s*/gi, ' ')
      .trim().split(/[\s.]+/).filter(Boolean).map(w => w[0].toUpperCase()).slice(0, 3).join('');
  }, [assignments, staffList]);

  // KCPE entry position within the class (among students with a KCPE score).
  const kcpeEntryPosFor = useCallback((student) => {
    if (!student.kcpe_score) return null;
    const withK = students.filter(s => s.kcpe_score);
    const rank = 1 + withK.filter(s => s.kcpe_score > student.kcpe_score).length;
    return { pos: rank, outOf: withK.length };
  }, [students]);

  // Grading scale for ANY level (trend rows cross levels/years).
  const scaleForLevel = useCallback((levelId) => {
    const gradeName = GRADE_CODE_TO_NAME[levelId];
    const levelName = levelNameForClass(levelId);
    let scale = dbGrades.filter(g => g.school_grade === gradeName);
    if (!scale.length) scale = dbGrades.filter(g => g.school_level === levelName && (g.school_grade === 'All' || !g.school_grade));
    if (!scale.length) scale = dbGrades.filter(g => g.school_level === levelName);
    if (!scale.length) scale = defaultGradesFor(levelId);
    return [...scale].sort((a, b) => (b.min_score || 0) - (a.min_score || 0));
  }, [dbGrades]);

  // Trend Analysis: for each (year, term, level) period the student has marks
  // in — limited to the level band the chart draws — total points + mean grade
  // and position among CURRENT classmates who also sat that period. Scoring is
  // byte-identical to the card: the period's exam set, first mark per exam,
  // pct × weight share, then the aggregation policy picks what counts. The
  // current term's trend column therefore always equals the TOTAL POINTS strip.
  const trendFor = useCallback((student) => {
    const band = trendBandFor(student.level_id).map(([code]) => code);
    const groupOf = (sid) => dbSubjects.find(s => s.id === sid)?.subject_group || 1;
    // periods the student has marks in, inside the band
    const periodsSet = new Map();
    trendMarks.filter(m => m.student_id === student.id && band.includes(m.level_id)).forEach(m => {
      const key = `${m.year}|${m.term}|${m.level_id}`;
      if (!periodsSet.has(key)) periodsSet.set(key, { year: m.year, term: m.term, level: m.level_id });
    });
    const termNo = (t) => parseInt(String(t).replace(/\D/g, ''), 10) || 0;
    const periods = [...periodsSet.values()].sort((a, b) => a.year - b.year || termNo(a.term) - termNo(b.term));

    const pointsIn = (sid, p) => {
      const exams = examsList.filter(e => e.level_id === p.level && e.term === p.term);
      if (!exams.length) return null;
      const scale = scaleForLevel(p.level);
      const gradeOf = (pct) => { for (const g of scale) if (pct >= (g.min_score || 0)) return g; return { points: 0 }; };
      const mine = trendMarks.filter(m => m.student_id === sid && m.year === p.year && m.term === p.term && m.level_id === p.level);
      if (!mine.length) return null;
      // Per subject, the card's exact math: iterate the exam set, first mark
      // per exam wins, missing exams contribute zero.
      const entries = [...new Set(mine.map(m => m.subject_id))].map(subId => {
        const score = exams.reduce((sum, ex) => {
          const mk = mine.find(m => m.exam_id === ex.id && m.subject_id === subId);
          const outOf = ex.total_marks || 100;
          const pct = outOf > 0 ? ((mk?.score || 0) / outOf) * 100 : 0;
          return sum + pct * ((ex.weight || 0) / 100);
        }, 0);
        return { score, group: groupOf(subId) };
      }).filter(e => e.score > 0);
      if (!entries.length) return null;
      const { counted } = applyAggregationPolicy(aggPolicy, entries);
      if (!counted.length) return null;
      const pts = counted.reduce((a, e) => a + (gradeOf(e.score).points || 0), 0);
      const meanPts = pts / counted.length;
      const scaleMax = Math.max(1, ...scale.map(g => g.points || 0));
      return { pts, meanPts, grade: (() => { const r = Math.round(meanPts); const ex2 = scale.find(g => g.points === r); if (ex2) return ex2.grade || ex2.code; let n = null, d = Infinity; scale.forEach(g => { const dd = Math.abs((g.points || 0) - meanPts); if (dd < d) { d = dd; n = g; } }); return n?.grade || '-'; })(), pctOfMax: meanPts / scaleMax * 100 };
    };

    return periods.map(p => {
      const mine = pointsIn(student.id, p);
      if (!mine) return null;
      const cohort = students.map(s => pointsIn(s.id, p)).filter(Boolean);
      const pos = 1 + cohort.filter(c => c.pts > mine.pts).length;
      return { ...p, ...mine, pos, outOf: cohort.length };
    }).filter(Boolean);
  }, [trendMarks, examsList, students, scaleForLevel, dbSubjects, aggPolicy]);

  // Shapes trendFor() output into the full-band grouped bar chart: every grade
  // in the student's level, three terms each, filled where data exists. Both
  // the y-axis grade labels AND the bar heights are placed on the points
  // ladder (lowest grade → highest grade), so with consecutive point values
  // the grades space evenly down the axis and every bar top sits exactly at
  // its grade's line. Bars carry no labels — the axis reads the value.
  const trendChartFor = useCallback((student, trend) => {
    const band = trendBandFor(student.level_id);
    const termNo = (t) => parseInt(String(t).replace(/\D/g, ''), 10) || 0;
    const bySlot = {};
    trend.forEach(t => {
      const key = `${t.level}|${termNo(t.term)}`;
      if (!bySlot[key] || (t.year || 0) > (bySlot[key].year || 0)) bySlot[key] = t;
    });
    const ptsList = cardScale.map(g => g.points || 0);
    const maxP = Math.max(...ptsList), minP = Math.min(...ptsList);
    const span = Math.max(1, maxP - minP);
    const frac = (p) => Math.min(1, Math.max(0, (p - minP) / span));
    const groups = band.map(([code, label]) => ({
      label,
      terms: [1, 2, 3].map(n => {
        const d = bySlot[`${code}|${n}`];
        return d ? { term: n, h: Math.max(6, Math.round(frac(d.meanPts) * TREND_H)) } : { term: n, h: 0 };
      }),
    }));
    const axis = [...cardScale]
      .sort((a, b) => (b.points || 0) - (a.points || 0))
      .map(g => ({ label: g.grade || g.code || '', bottom: frac(g.points || 0) * 100 }));
    // KCPE baseline: entry % → the scale's grade → that grade's points height.
    let kcpeH = 0;
    if (student.kcpe_score) {
      const pctK = student.kcpe_score / 500 * 100;
      const gK = cardScale.find(g => pctK >= (g.min_score || 0)); // cardScale is sorted desc
      kcpeH = Math.max(6, Math.round(frac(gK?.points ?? minP) * TREND_H));
    }
    return { groups, axis, kcpeH, band, bySlot };
  }, [cardScale]);

  // Fees box numbers: arrears to date, next term's bill, total.
  const feesFor = useCallback((student) => {
    if (!feeData) return null;
    const vhById = Object.fromEntries(feeData.voteheads.map(v => [v.id, v]));
    const boarderCat = feeData.cats.find(c => c.kind === 'boarder')?.id || null;
    const isBoarder = (s) => (s.boarding_status || '').toLowerCase() === 'boarder';
    const catForTerm = (t) => {
      const sfc = feeData.sfc.find(x => x.student_id === student.id && x[`t${t}`]);
      if (sfc) return sfc.category_id;
      if (student.fee_category_id) return student.fee_category_id;
      if (isBoarder(student)) return boarderCat;
      return null;
    };
    const billedTerm = (t) => {
      const cat = catForTerm(t);
      const merged = new Map();
      [false, true].forEach(sp => feeData.structures.forEach(r => {
        if (r.fee_level !== student.level_id) return;
        const isSpec = !!r.category_id;
        if (isSpec !== sp) return;
        if (isSpec && r.category_id !== cat) return;
        const vh = vhById[r.votehead_id];
        if (vh) {
          if (vh.is_active === false) return;
          const sc = vh.applies_to || 'all';
          if (sc === 'boarders' && !isBoarder(student)) return;
          if (sc === 'day' && isBoarder(student)) return;
        }
        merged.set(r.votehead_id, Number(r[`t${t}`]) || 0);
      }));
      return [...merged.values()].reduce((a, b) => a + b, 0);
    };
    const cur = parseInt(String(selectedTerm).replace(/\D/g, ''), 10) || 1;
    let billedToDate = 0;
    for (let t = 1; t <= cur; t++) billedToDate += billedTerm(t);
    const paid = feeData.pays.filter(p => p.student_id === student.id).reduce((a, p) => a + Number(p.amount), 0);
    const conc = feeData.concessions.filter(c => c.student_id === student.id).reduce((a, c) => a + Number(c.amount), 0);
    const arrears = billedToDate - paid - conc;
    const nextTermFees = cur < 3 ? billedTerm(cur + 1) : 0;
    return { arrears, nextTermFees, total: arrears + nextTermFees };
  }, [feeData, selectedTerm]);

  // Position "n / total", or "—" for below-minimum students.
  const posText = (pos, size) => (pos ? `${pos} / ${size}` : '—');

  // Live page estimate for the previewed card (each student prints on its own
  // page(s), so bulk pages ≈ this × number of students).
  const estPages = usePageEstimate({
    containerId: 'report-preview',
    scale: printScale, font: printFont, autoPx: 12,
    deps: [selectedStudentId, allMarks, showPositions],
  });

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
    const psum = pointsSummaryFor(rows);
    const vap = vapFor(psum.meanPts, student.kcpe_score);
    const kEntry = kcpeEntryPosFor(student);
    const trend = trendFor(student);
    const fees = showFees ? feesFor(student) : null;
    const fmtKes = (n) => `KES ${Math.round(n).toLocaleString()}`;

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
            {student.kcpe_score && <div><b style={{ fontWeight: 800 }}>KCPE:</b>&nbsp; {student.kcpe_score}</div>}
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
              <th style={{ border: '1px solid #000', padding: '6px 8px', textAlign: 'center' }} title="Position in subject">POS</th>
              <th style={{ border: '1px solid #000', padding: '6px 8px', textAlign: 'left' }}>REMARKS</th>
              <th style={{ border: '1px solid #000', padding: '6px 8px', textAlign: 'center' }} title="Subject teacher">TR</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ sub, score, best, grade, examScores }) => {
              const sp = subjectPosFor(student.id, sub.id);
              return (
              <tr key={sub.id}>
                <td style={{ border: '1px solid #000', padding: '6px 8px', color: '#1A1A2E' }}>{sub.name}</td>
                {examScores.map((sc, i) => (
                  <td key={i} style={{ border: '1px solid #000', padding: '6px 8px', textAlign: 'center', color: '#1A1A2E', fontWeight: 600 }}>{sc}</td>
                ))}
                <td style={{ border: '1px solid #000', padding: '6px 8px', textAlign: 'center', fontWeight: 700, background: '#e8f5ee' }}>{Math.round(score)}</td>
                <td style={{ border: '1px solid #000', padding: '6px 8px', textAlign: 'center', fontWeight: 700 }}>{grade.grade}</td>
                <td style={{ border: '1px solid #000', padding: '6px 8px', textAlign: 'center', background: '#fff4e5', color: '#BF6A02', fontWeight: 700 }}>{Math.round(best)}</td>
                <td style={{ border: '1px solid #000', padding: '6px 8px', textAlign: 'center', fontWeight: 700 }}>{sp ? `${sp.pos}/${sp.outOf}` : '—'}</td>
                <td style={{ border: '1px solid #000', padding: '6px 8px', color: '#1A1A2E', fontSize: 11, fontWeight: 500 }}>{gradeComment(grade)}</td>
                <td style={{ border: '1px solid #000', padding: '6px 8px', textAlign: 'center', fontSize: 10.5, color: '#1A1A2E', fontWeight: 600 }}>{initialsFor(student, sub.id)}</td>
              </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ background: '#e8f5ee', color: '#1A1A2E' }}>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontWeight: 700 }}>SUMMARY</td>
              {gradeExams.map((_, i) => <td key={i} style={{ border: '1px solid #000' }} />)}
              <td style={{ border: '1px solid #000', padding: '6px 8px', textAlign: 'center', fontWeight: 900 }}>{belowMinimum ? '—' : Math.round(total)}</td>
              <td style={{ border: '1px solid #000', padding: '6px 8px', textAlign: 'center', fontWeight: 900 }}>{belowMinimum ? '—' : overallGrade.grade}</td>
              <td style={{ border: '1px solid #000', padding: '6px 8px', textAlign: 'center' }}>AVG: {belowMinimum ? '—' : `${Math.round(average)}%`}</td>
              <td style={{ border: '1px solid #000' }} />
              <td style={{ border: '1px solid #000', padding: '6px 8px', color: '#1A1A2E', fontWeight: 500 }} colSpan={2}>{belowMinimum ? remark : gradeComment(overallGrade)}</td>
            </tr>
          </tfoot>
        </table>

        {/* Points · KCPE entry · V.A.P strip */}
        <div style={{ border: '1px solid #000', marginBottom: 12, display: 'grid', gridTemplateColumns: kEntry ? 'repeat(3, 1fr)' : '1fr', fontSize: 12.5 }}>
          <div style={{ padding: '8px 12px', borderRight: kEntry ? '1px solid #bbb' : 'none' }}>
            <b style={{ fontWeight: 800 }}>TOTAL POINTS:</b>&nbsp; <span style={{ fontWeight: 900 }}>{belowMinimum ? '—' : `${psum.pts} ${psum.meanGrade}`}</span>
            <span style={{ color: '#555' }}> out of {psum.outOf} points</span>
          </div>
          {kEntry && (
            <div style={{ padding: '8px 12px', borderRight: '1px solid #bbb' }}>
              <b style={{ fontWeight: 800 }}>KCPE ENTRY POSITION:</b>&nbsp; <span style={{ fontWeight: 900 }}>{kEntry.pos} / {kEntry.outOf}</span>
            </div>
          )}
          {kEntry && (
            <div style={{ padding: '8px 12px' }}>
              <b style={{ fontWeight: 800 }}>V.A.P:</b>&nbsp;
              <span style={{ fontWeight: 900, color: vap >= 0 ? '#1B6B3A' : '#C0392B' }}>{vap === null ? '—' : `${vap >= 0 ? '+' : ''}${vap.toFixed(1)}`}</span>
              <span style={{ color: '#555', fontSize: 10.5 }}> (value added vs entry)</span>
            </div>
          )}
        </div>

        {/* Trend Analysis — full-band table (every grade × 3 terms) + chart */}
        {trend.length > 0 && (() => {
          const chart = trendChartFor(student, trend);
          const bandLabel = `${chart.groups[0].label} – ${chart.groups[chart.groups.length - 1].label}`;
          const thT = { border: '1px solid #999', padding: '3px 4px', background: '#f0f0f0', textAlign: 'center', fontSize: 9.5 };
          const tdT = { border: '1px solid #999', padding: '3px 4px', textAlign: 'center', fontSize: 9.5 };
          const slot = (code, n) => chart.bySlot[`${code}|${n}`];
          const row = (label, fn) => (
            <tr>
              <td style={{ ...tdT, fontWeight: 700, textAlign: 'left', whiteSpace: 'nowrap' }}>{label}</td>
              {chart.band.map(([code]) => [1, 2, 3].map(n => {
                const d = slot(code, n);
                return <td key={`${code}${n}`} style={{ ...tdT, color: d ? '#000' : '#bbb' }}>{d ? fn(d) : '—'}</td>;
              }))}
            </tr>
          );
          return (
            <div style={{ border: '1px solid #000', padding: 10, marginBottom: 12 }}>
              <div style={{ fontWeight: 800, marginBottom: 6, fontSize: 12 }}>TREND ANALYSIS — {bandLabel.toUpperCase()}</div>
              <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed' }}>
                <thead>
                  <tr>
                    <th rowSpan={2} style={{ ...thT, width: 66 }}></th>
                    {chart.band.map(([code, label]) => (
                      <th key={code} colSpan={3} style={thT}>{shortGrade(label)}</th>
                    ))}
                  </tr>
                  <tr>
                    {chart.band.map(([code]) => [1, 2, 3].map(n => <th key={`${code}${n}`} style={thT}>T{n}</th>))}
                  </tr>
                </thead>
                <tbody>
                  {row('Points', d => d.pts)}
                  {row('Position', d => `${d.pos}/${d.outOf}`)}
                  {row('Mean Grade', d => d.grade)}
                </tbody>
              </table>
              <TrendChart chart={chart} />
            </div>
          );
        })()}

        {/* School fees box (opt-in) + next-term date */}
        {(fees || schoolInfo?.next_term_begins) && (
          <div style={{ display: 'flex', gap: 12, marginBottom: 12, alignItems: 'stretch', flexWrap: 'wrap' }}>
            {schoolInfo?.next_term_begins && (
              <div style={{ flex: 1, minWidth: 200, border: '1px solid #000', padding: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontWeight: 800 }}>NEXT TERM BEGINS:&nbsp;</span>
                <span style={{ fontWeight: 900, textDecoration: 'underline' }}>{new Date(schoolInfo.next_term_begins).toLocaleDateString('en-GB')}</span>
              </div>
            )}
            {fees && (
              <div style={{ flex: 1.4, minWidth: 240, border: '2px solid #000', padding: '8px 12px' }}>
                <div style={{ fontWeight: 900, fontSize: 12.5, borderBottom: '1px solid #999', paddingBottom: 4, marginBottom: 4 }}>SCHOOL FEES (KSHS)</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}><span>Outstanding arrears</span><b style={{ fontFamily: 'monospace' }}>{fmtKes(fees.arrears)}</b></div>
                {fees.nextTermFees > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}><span>Next term fees</span><b style={{ fontFamily: 'monospace' }}>{fmtKes(fees.nextTermFees)}</b></div>}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderTop: '1px solid #999', fontWeight: 900 }}><span>Total amount</span><span style={{ fontFamily: 'monospace' }}>{fmtKes(fees.total)}</span></div>
              </div>
            )}
          </div>
        )}

        {/* Class Teacher's remarks — auto-filled with the overall-grade comment,
            with space + signature line. */}
        <div style={{ border: '1px solid #000', padding: '10px', marginBottom: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 5 }}>CLASS TEACHER'S REMARKS:</div>
          <div style={{ minHeight: 34, background: '#F9F9F9', color: '#1A1A2E', fontWeight: 500, padding: '2px 4px' }}>{remark}</div>
          <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
            <span>Name: <u style={{ display: 'inline-block', minWidth: 150 }}>{classTeacherName(student) || ' '}</u> &nbsp; Sign: <u style={{ display: 'inline-block', minWidth: 70 }}>&nbsp;</u></span>
            <span>Date: <u style={{ display: 'inline-block', minWidth: 90 }}>&nbsp;</u></span>
          </div>
        </div>

        {/* Principal's remarks — from the configured comment set (blank if unset). */}
        <div style={{ border: '1px solid #000', padding: '10px', marginBottom: 20 }}>
          <div style={{ fontWeight: 700, marginBottom: 5 }}>PRINCIPAL'S REMARKS:</div>
          <div style={{ minHeight: 34, background: '#F9F9F9', color: '#1A1A2E', fontWeight: 500, padding: '2px 4px' }}>{principalRemark || ' '}</div>
          <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
            <span>Name: <u style={{ display: 'inline-block', minWidth: 150 }}>{schoolInfo?.principal_name || ' '}</u> &nbsp; Sign: <u style={{ display: 'inline-block', minWidth: 70 }}>&nbsp;</u></span>
            <span>Date: <u style={{ display: 'inline-block', minWidth: 90 }}>&nbsp;</u></span>
          </div>
        </div>

        {/* Parent / Guardian acknowledgement */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, padding: '4px 2px 0', marginBottom: 8 }}>
          <span><b style={{ fontWeight: 800 }}>Parent / Guardian:</b> Name: <u style={{ display: 'inline-block', minWidth: 150 }}>&nbsp;</u> &nbsp; Sign: <u style={{ display: 'inline-block', minWidth: 80 }}>&nbsp;</u></span>
          <span>Date: <u style={{ display: 'inline-block', minWidth: 90 }}>&nbsp;</u></span>
        </div>
      </div>
    );
  };

  const handleBulkPDF = () => {
    const printStudents = filteredStudents.length ? filteredStudents : students;
    if (!printStudents.length) { alert('No students to print.'); return; }

    const win = window.open('', '_blank');
    const cellFont = printCellFont(printFont, 12);
    win.document.write(`<html><head><title>Bulk Report Cards</title>
    <style>
      body { font-family: Arial, sans-serif; font-size: ${cellFont}px; zoom: ${printScale / 100}; ${printBW ? `filter: ${BW_FILTER};` : ''} }
      table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
      th, td { border: 1px solid #000; padding: ${cellFont <= 10 ? '3px 5px' : '6px 8px'}; font-size: ${cellFont}px; }
      .page { max-width: 750px; margin: 0 auto; padding: calc(20px + 10mm); page-break-after: always; }
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
      .pts-strip { border: 1px solid #000; margin-bottom: 12px; display: flex; flex-wrap: wrap; font-size: 12px; }
      .pts-strip > div { padding: 7px 12px; border-right: 1px solid #bbb; }
      .pts-strip > div:last-child { border-right: none; }
      .trend { border: 1px solid #000; padding: 8px 10px; margin-bottom: 12px; }
      .trend table td, .trend table th { border: 1px solid #999; padding: 2px 7px; }
      * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      @media print { @page { margin: 0; } }
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
      const psum = pointsSummaryFor(rows);
      const vap = vapFor(psum.meanPts, student.kcpe_score);
      const kEntry = kcpeEntryPosFor(student);
      const trend = trendFor(student);
      const fees = showFees ? feesFor(student) : null;
      const fmtKes = (n) => `KES ${Math.round(n).toLocaleString()}`;

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
            ${student.kcpe_score ? `<div><b>KCPE:</b>&nbsp; ${student.kcpe_score}</div>` : ''}
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
            <th style="text-align:center">POS</th>
            <th style="text-align:left">REMARKS</th>
            <th style="text-align:center">TR</th>
          </tr></thead>
          <tbody>
            ${rows.map(({ sub, score, best, grade, examScores }) => {
              const sp = subjectPosFor(student.id, sub.id);
              return `
              <tr>
                <td style="color:#1A1A2E">${sub.name}</td>
                ${examScores.map(sc => `<td style="text-align:center;color:#1A1A2E;font-weight:600">${sc}</td>`).join('')}
                <td style="text-align:center;font-weight:700;background:#e8f5ee">${Math.round(score)}</td>
                <td style="text-align:center;font-weight:700">${grade.grade}</td>
                <td style="text-align:center;background:#fff4e5;font-weight:700">${Math.round(best)}</td>
                <td style="text-align:center;font-weight:700">${sp ? `${sp.pos}/${sp.outOf}` : '—'}</td>
                <td style="font-size:11px;color:#1A1A2E;font-weight:500">${gradeComment(grade)}</td>
                <td style="text-align:center;font-size:10px;color:#1A1A2E;font-weight:600">${initialsFor(student, sub.id)}</td>
              </tr>`;
            }).join('')}
          </tbody>
          <tfoot>
            <tr class="tfoot-row">
              <td><b>SUMMARY</b></td>
              ${gradeExams.map(() => '<td></td>').join('')}
              <td style="text-align:center;font-weight:900">${belowMinimum ? '—' : Math.round(total)}</td>
              <td style="text-align:center;font-weight:900">${belowMinimum ? '—' : overallGrade.grade}</td>
              <td style="text-align:center">AVG: ${belowMinimum ? '—' : `${Math.round(average)}%`}</td>
              <td></td>
              <td colspan="2" style="color:#1A1A2E;font-weight:500">${belowMinimum ? remark : gradeComment(overallGrade)}</td>
            </tr>
          </tfoot>
        </table>
        <div class="pts-strip">
          <div><b>TOTAL POINTS:</b>&nbsp; <span style="font-weight:900">${belowMinimum ? '—' : `${psum.pts} ${psum.meanGrade}`}</span> <span style="color:#555">out of ${psum.outOf} points</span></div>
          ${kEntry ? `<div><b>KCPE ENTRY POSITION:</b>&nbsp; <span style="font-weight:900">${kEntry.pos} / ${kEntry.outOf}</span></div>` : ''}
          ${kEntry ? `<div><b>V.A.P:</b>&nbsp; <span style="font-weight:900;color:${vap >= 0 ? '#1B6B3A' : '#C0392B'}">${vap === null ? '—' : `${vap >= 0 ? '+' : ''}${vap.toFixed(1)}`}</span></div>` : ''}
        </div>
        ${trend.length > 0 ? (() => {
          const chart = trendChartFor(student, trend);
          const bandLabel = `${chart.groups[0].label} – ${chart.groups[chart.groups.length - 1].label}`;
          const cell = (code, n, fn) => {
            const d = chart.bySlot[`${code}|${n}`];
            return `<td style="text-align:center;${d ? '' : 'color:#bbb'}">${d ? fn(d) : '—'}</td>`;
          };
          const row = (label, fn) => `<tr><td style="font-weight:700;white-space:nowrap">${label}</td>${chart.band.map(([code]) => [1, 2, 3].map(n => cell(code, n, fn)).join('')).join('')}</tr>`;
          return `
        <div class="trend">
          <b style="font-size:11px">TREND ANALYSIS — ${bandLabel.toUpperCase()}</b>
          <table style="width:100%;table-layout:fixed;font-size:9px;margin-top:5px">
            <thead>
              <tr><th rowspan="2" style="width:60px"></th>${chart.band.map(([, label]) => `<th colspan="3" style="text-align:center">${shortGrade(label)}</th>`).join('')}</tr>
              <tr>${chart.band.map(() => [1, 2, 3].map(n => `<th style="text-align:center">T${n}</th>`).join('')).join('')}</tr>
            </thead>
            <tbody>
              ${row('Points', d => d.pts)}
              ${row('Position', d => `${d.pos}/${d.outOf}`)}
              ${row('Mean Grade', d => d.grade)}
            </tbody>
          </table>
          ${trendChartHTML(chart)}
        </div>`;
        })() : ''}
        ${(fees || schoolInfo?.next_term_begins) ? `
        <div style="display:flex;gap:12px;margin-bottom:12px;flex-wrap:wrap">
          ${schoolInfo?.next_term_begins ? `<div style="flex:1;min-width:200px;border:1px solid #000;padding:10px;display:flex;align-items:center;justify-content:center"><b>NEXT TERM BEGINS:&nbsp;</b><span style="font-weight:900;text-decoration:underline">${new Date(schoolInfo.next_term_begins).toLocaleDateString('en-GB')}</span></div>` : ''}
          ${fees ? `<div style="flex:1.4;min-width:240px;border:2px solid #000;padding:8px 12px">
            <div style="font-weight:900;font-size:12px;border-bottom:1px solid #999;padding-bottom:4px;margin-bottom:4px">SCHOOL FEES (KSHS)</div>
            <div style="display:flex;justify-content:space-between;padding:2px 0"><span>Outstanding arrears</span><b style="font-family:monospace">${fmtKes(fees.arrears)}</b></div>
            ${fees.nextTermFees > 0 ? `<div style="display:flex;justify-content:space-between;padding:2px 0"><span>Next term fees</span><b style="font-family:monospace">${fmtKes(fees.nextTermFees)}</b></div>` : ''}
            <div style="display:flex;justify-content:space-between;padding:3px 0;border-top:1px solid #999;font-weight:900"><span>Total amount</span><span style="font-family:monospace">${fmtKes(fees.total)}</span></div>
          </div>` : ''}
        </div>` : ''}
        <div class="remarks">
          <b>CLASS TEACHER'S REMARKS:</b>
          <div style="min-height:34px;background:#F9F9F9;color:#1A1A2E;font-weight:500;padding:2px 4px">${remark}</div>
          <div class="rem-sign"><span>Name: <u>&nbsp;&nbsp;${classTeacherName(student) || '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;'}&nbsp;&nbsp;</u> &nbsp; Sign: <u>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</u></span><span>Date: <u>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</u></span></div>
        </div>
        <div class="remarks">
          <b>PRINCIPAL'S REMARKS:</b>
          <div style="min-height:34px;background:#F9F9F9;color:#1A1A2E;font-weight:500;padding:2px 4px">${principalRemark || '&nbsp;'}</div>
          <div class="rem-sign"><span>Name: <u>&nbsp;&nbsp;${schoolInfo?.principal_name || '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;'}&nbsp;&nbsp;</u> &nbsp; Sign: <u>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</u></span><span>Date: <u>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</u></span></div>
        </div>
        <div class="rem-sign" style="padding:4px 2px 0"><span><b>Parent / Guardian:</b> Name: <u>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</u> &nbsp; Sign: <u>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</u></span><span>Date: <u>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</u></span></div>
      </div>`);
    });

    win.document.write('</body></html>');
    win.document.close();
    setTimeout(() => win.print(), 600);
  };

  // ---- Download / Email the previewed card as a real PDF -------------------
  const [isDownloading, setIsDownloading] = useState(false);
  const [isEmailing, setIsEmailing] = useState(false);

  const cardFileName = (student) =>
    `${student.adm_no || 'card'}_${(student.first_name || '').trim().replace(/\s+/g, '_')}_${String(selectedTerm).replace(/\s+/g, '')}_${selectedYear}_report_card.pdf`;

  // Rasterise the on-screen preview into an A4 PDF (multi-page when long).
  // Honours the PrintSizer settings exactly like printing does: the % scale
  // (and any font override, folded in as a proportional shrink) reduces the
  // card's size on the page — centered — so "≈ 1 page" on screen is 1 page
  // in the file. Libraries load on demand so the main bundle stays lean.
  const buildCardPdf = async () => {
    const el = document.getElementById('report-preview');
    if (!el) throw new Error('Preview not ready');
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import('html2canvas'),
      import('jspdf'),
    ]);
    const canvas = await html2canvas(el, {
      scale: 2, backgroundColor: '#fff', useCORS: true,
      onclone: (doc) => { if (printBW) { const n = doc.getElementById('report-preview'); if (n) n.style.filter = BW_FILTER; } },
    });
    const pdf = new jsPDF('p', 'mm', 'a4');
    const fontRatio = printFont === 'auto' ? 1 : Math.max(0.5, Number(printFont) / 12);
    const shrink = Math.min(1, ((printScale || 100) / 100) * fontRatio);
    const pageW = 210, pageH = 297, margin = 8;
    const imgW = (pageW - margin * 2) * shrink;
    const x = (pageW - imgW) / 2; // centered when shrunk
    const imgH = canvas.height * imgW / canvas.width;
    const img = canvas.toDataURL('image/jpeg', 0.92);
    let heightLeft = imgH, position = margin;
    pdf.addImage(img, 'JPEG', x, position, imgW, imgH);
    heightLeft -= pageH - margin * 2;
    while (heightLeft > 0) {
      pdf.addPage();
      position = margin - (imgH - heightLeft);
      pdf.addImage(img, 'JPEG', x, position, imgW, imgH);
      heightLeft -= pageH - margin * 2;
    }
    return pdf;
  };

  const handleDownloadPdf = async () => {
    if (!selectedStudent) return;
    setIsDownloading(true);
    try {
      const pdf = await buildCardPdf();
      pdf.save(cardFileName(selectedStudent));
    } catch (err) {
      alert('Failed to build the PDF: ' + err.message);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleEmailCard = async () => {
    if (!selectedStudent) return;
    setIsEmailing(true);
    try {
      const s = selectedStudent;
      // Primary guardian with an email wins; else any guardian that has one.
      const { data: gs } = await supabase
        .from('student_guardians')
        .select('full_name, email, is_primary')
        .eq('student_id', s.id)
        .order('is_primary', { ascending: false });
      const g = (gs || []).find(x => (x.email || '').trim());
      if (!g) {
        alert(`No parent/guardian email on file for ${s.first_name}.\n\nAdd one under Students & Admission → edit the student → Parents / Guardians.`);
        return;
      }
      const to = g.email.trim();
      if (!window.confirm(`Email ${s.first_name}'s ${selectedTerm} ${selectedYear} report card to:\n\n${g.full_name || 'Guardian'} <${to}>?`)) return;
      const pdf = await buildCardPdf();
      const pdfB64 = pdf.output('datauristring').split(',')[1];
      const { data, error } = await supabase.functions.invoke('send-report-card', {
        body: {
          student_id: s.id,
          to,
          subject: `${s.first_name} ${s.last_name || ''}`.trim() + ` — ${selectedTerm} ${selectedYear} Report Card — ${schoolInfo?.school_name || schoolConfig?.schoolName || ''}`.trim(),
          pdf_base64: pdfB64,
          filename: cardFileName(s),
        },
      });
      if (error) {
        // Edge functions put the useful message in the response body.
        let msg = error.message || 'send failed';
        try { const j = await error.context.json(); if (j?.error) msg = j.error; } catch { /* keep default */ }
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);
      alert(`✅ Report card emailed to ${to}`);
    } catch (err) {
      alert('Failed to email the report card: ' + err.message);
    } finally {
      setIsEmailing(false);
    }
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

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#1A1A2E' }}>
            <input
              type="checkbox"
              checked={showFees}
              onChange={e => setShowFees(e.target.checked)}
              style={{ width: 15, height: 15, accentColor: '#1B6B3A', cursor: 'pointer' }}
            />
            Show school fees box on report
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
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
          <PrintSizer scale={printScale} setScale={setPrintScale} font={printFont} setFont={setPrintFont} pages={estPages} bw={printBW} setBw={setPrintBW} />
          <button
            onClick={() => {
              if (selectedStudent) {
                const cellFont = printCellFont(printFont, 12);
                const w = window.open('', '_blank');
                w.document.write(`<html><head><title>Report Card</title><style>body{font-family:Arial;font-size:${cellFont}px;zoom:${printScale / 100};padding:10mm;box-sizing:border-box;${printBW ? `filter:${BW_FILTER};` : ''}} table{width:100%;border-collapse:collapse} th,td{border:1px solid #000;padding:${cellFont <= 10 ? '3px 5px' : '6px 8px'};font-size:${cellFont}px} @media print{@page{margin:0}}</style></head><body>`);
                w.document.write(document.getElementById('report-preview').innerHTML);
                w.document.write('</body></html>');
                w.document.close();
                setTimeout(() => w.print(), 400);
              }
            }}
            style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #E8EAF0', background: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          >🖨️ Print Report</button>
          <button
            onClick={handleDownloadPdf}
            disabled={isDownloading || !selectedStudent}
            title="Save this report card as a PDF file"
            style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #1A5F9C', background: '#fff', color: '#1A5F9C', fontSize: 12, fontWeight: 700, cursor: isDownloading ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          >{isDownloading ? '⌛ Building…' : '⬇️ Download PDF'}</button>
          <button
            onClick={handleEmailCard}
            disabled={isEmailing || !selectedStudent}
            title="Email this report card (PDF attached) to the parent/guardian on file"
            style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: isEmailing ? '#8a8fa8' : '#1B6B3A', color: '#fff', fontSize: 12, fontWeight: 700, cursor: isEmailing ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          >{isEmailing ? '⌛ Sending…' : '✉️ Email Parent'}</button>
        </div>

        {selectedStudent ? (
          <div id="report-preview" style={{ filter: printBW ? BW_FILTER : 'none' }}>
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

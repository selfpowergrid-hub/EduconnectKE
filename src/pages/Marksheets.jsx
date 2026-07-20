import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { getClassesByType, defaultGradesFor } from '../data/mockData';
import { applyAggregationPolicy } from '../lib/aggregation';
import { LEVELS, GRADE_CODE_TO_NAME } from '../lib/schoolLevels';
import PrintSizer, { printCellFont, usePageEstimate } from '../components/PrintSizer';

// Class-type → level label, so the Level dropdown only offers types the
// school actually teaches.
const TYPE_LABEL = { Primary: 'Primary', JSS: 'Junior Secondary', Secondary: 'Senior Secondary' };

// The academic level name ("Senior Secondary") a class code ("f3") belongs to.
const levelNameForClass = (classId) => {
  const name = GRADE_CODE_TO_NAME[classId];
  for (const [lvl, grades] of Object.entries(LEVELS)) if (grades.includes(name)) return lvl;
  return null;
};

const Marksheets = ({ schoolConfig, examsList }) => {
  const [students, setStudents] = useState([]);
  const [dbSubjects, setDbSubjects] = useState([]);
  const [aggPolicy, setAggPolicy] = useState(null); // totalling policy row; null = count all
  const [dbGrades, setDbGrades] = useState([]);
  const [dbStreams, setDbStreams] = useState([]);
  const [allMarks, setAllMarks] = useState([]);
  const [schoolInfo, setSchoolInfo] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // Classes scoped to what this school actually teaches.
  const currentTypeClasses = useMemo(() => getClassesByType(schoolConfig?.schoolType), [schoolConfig]);
  // Distinct class types available at this school, in canonical order.
  const availableTypes = useMemo(() => {
    const order = ['Primary', 'JSS', 'Secondary'];
    return order.filter(t => currentTypeClasses.some(c => c.type === t));
  }, [currentTypeClasses]);

  // Filters
  const [selectedLevel, setSelectedLevel] = useState(() => {
    const scoped = getClassesByType(schoolConfig?.schoolType);
    return scoped[0]?.type || 'All';
  });
  const [selectedClass, setSelectedClass] = useState(() => {
    const scoped = getClassesByType(schoolConfig?.schoolType);
    return scoped[0]?.id || '';
  });
  const [selectedStream, setSelectedStream] = useState('all');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedTerm, setSelectedTerm] = useState('Term 1');
  const [selectedExamId, setSelectedExamId] = useState('average'); // 'average' or specific exam.id
  const [displayMode, setDisplayMode] = useState('broadsheet'); // 'broadsheet' | 'marks' | 'grades'
  // Print sizing: zoom scales everything (font + row height) so a long sheet
  // can be squeezed onto one page; font is an explicit override on top.
  const [printScale, setPrintScale] = useState(100);   // 50–120 %
  const [printFont, setPrintFont] = useState('auto');  // 'auto' | px number

  // Filter Classes by Level
  const filteredClasses = useMemo(() => {
    if (selectedLevel === 'All') return currentTypeClasses;
    return currentTypeClasses.filter(c => c.type === selectedLevel);
  }, [currentTypeClasses, selectedLevel]);

  // Make sure selectedClass is valid when level changes
  useEffect(() => {
    if (filteredClasses.length > 0 && !filteredClasses.find(c => c.id === selectedClass)) {
      setSelectedClass(filteredClasses[0].id);
    }
  }, [filteredClasses, selectedClass]);

  // Filtered Exams (by grade/term)
  const gradeExams = useMemo(
    () => examsList.filter(e => e.level_id === selectedClass && e.term === selectedTerm),
    [examsList, selectedClass, selectedTerm]
  );

  // Filtered Subjects (by grade)
  const gradeSubjects = useMemo(
    () => dbSubjects.filter(s => s.level_category === selectedClass),
    [dbSubjects, selectedClass]
  );

  // Filtered Students (by stream)
  const filteredStudents = useMemo(() => {
    if (selectedStream === 'all') return students;
    return students.filter(s => s.stream_id === selectedStream);
  }, [students, selectedStream]);

  useEffect(() => {
    if (schoolConfig?.id) {
      fetchSubjects();
      fetchGrades();
      fetchStreams();
      fetchSchoolInfo();
    }
  }, [schoolConfig?.id]);

  useEffect(() => {
    if (schoolConfig?.id) {
      fetchStudents();
      fetchAggPolicy();
    }
  }, [schoolConfig?.id, selectedClass]);

  useEffect(() => {
    if (schoolConfig?.id && students.length > 0) {
      fetchAllMarks();
    }
  }, [students, selectedTerm, selectedYear]);

  // Make sure selectedExamId is valid when term/exams change
  useEffect(() => {
    if (selectedExamId !== 'average' && !gradeExams.find(e => e.id === selectedExamId)) {
      setSelectedExamId('average');
    }
  }, [gradeExams, selectedExamId]);

  const fetchStudents = async () => {
    setIsLoading(true);
    const { data } = await supabase.from('students').select('*')
      .eq('school_id', schoolConfig.id)
      .eq('level_id', selectedClass);
    setStudents(data || []);
    setIsLoading(false);
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
    setIsLoading(true);
    if (!students.length || !gradeExams.length) {
      setAllMarks([]);
      setIsLoading(false);
      return;
    }
    const studentIds = students.map(s => s.id);
    const examIds = gradeExams.map(e => e.id);
    const { data } = await supabase.from('marks').select('*')
      .in('student_id', studentIds)
      .in('exam_id', examIds)
      .eq('year', selectedYear);
    setAllMarks(data || []);
    setIsLoading(false);
  };

  // The grading scale for THIS class: exact grade match → level-wide rows →
  // any rows for the level → built-in defaults. (Previously filtered on a
  // non-existent level_group column, which silently mixed every scale the
  // school has.)
  const gradeScale = useMemo(() => {
    const gradeName = GRADE_CODE_TO_NAME[selectedClass];
    const levelName = levelNameForClass(selectedClass);
    let scale = dbGrades.filter(g => g.school_grade === gradeName);
    if (!scale.length) scale = dbGrades.filter(g => g.school_level === levelName && (g.school_grade === 'All' || !g.school_grade));
    if (!scale.length) scale = dbGrades.filter(g => g.school_level === levelName);
    if (!scale.length) scale = defaultGradesFor(selectedClass);
    return [...scale].sort((a, b) => (b.min_score || 0) - (a.min_score || 0));
  }, [dbGrades, selectedClass]);

  const getGrade = useCallback((score) => {
    for (const g of gradeScale) {
      if (score >= (g.min_score || 0)) return g;
    }
    return { grade: '-', points: 0 };
  }, [gradeScale]);

  // Points helpers for the broadsheet: grade for a mean-points value, and the
  // top of the points scale (12 on the standard scale) for V.A.P normalising.
  const gradeByPoints = useCallback((points) => {
    const rounded = Math.round(points);
    const exact = gradeScale.find(g => g.points === rounded);
    if (exact) return exact.grade || exact.code || '-';
    let nearest = null, diff = Infinity;
    gradeScale.forEach(g => { const d = Math.abs((g.points || 0) - points); if (d < diff) { diff = d; nearest = g; } });
    return nearest?.grade || nearest?.code || '-';
  }, [gradeScale]);

  // Calculate score for one student + one subject based on selected mode.
  // All scores are returned as a 0-100 percentage so columns are comparable
  // regardless of whether each exam was out of 30, 50, 100, etc.
  const getSubjectScore = useCallback((studentId, subjectId) => {
    if (selectedExamId === 'average') {
      if (!gradeExams.length) return null;
      let hasAnyMark = false;
      const weighted = gradeExams.reduce((sum, exam) => {
        const mark = allMarks.find(m => m.student_id === studentId && m.exam_id === exam.id && m.subject_id === subjectId);
        if (mark && mark.score !== null) hasAnyMark = true;
        const raw = mark?.score || 0;
        const outOf = exam.total_marks || 100;
        const pct = outOf > 0 ? (raw / outOf) * 100 : 0;
        return sum + pct * ((exam.weight || 0) / 100);
      }, 0);
      return hasAnyMark ? weighted : null;
    } else {
      const mark = allMarks.find(m => m.student_id === studentId && m.exam_id === selectedExamId && m.subject_id === subjectId);
      if (!mark || mark.score === null) return null;
      const exam = gradeExams.find(e => e.id === selectedExamId);
      const outOf = exam?.total_marks || 100;
      return outOf > 0 ? (mark.score / outOf) * 100 : 0;
    }
  }, [selectedExamId, gradeExams, allMarks]);

  // Build grid data
  const gridData = useMemo(() => {
    if (!filteredStudents.length) return [];

    let data = filteredStudents.map(student => {
      const subjectScores = {};
      const entries = [];

      gradeSubjects.forEach(sub => {
        const score = getSubjectScore(student.id, sub.id);
        subjectScores[sub.id] = score;
        if (score !== null) entries.push({ score, group: sub.subject_group || 1 });
      });

      // Total/average over the policy-counted subjects only (all of them
      // when no policy is set — identical to the old behavior).
      const { counted, belowMinimum } = applyAggregationPolicy(aggPolicy, entries);
      const total = counted.reduce((s, e) => s + e.score, 0);
      const average = counted.length > 0 ? total / counted.length : 0;
      const meanGrade = getGrade(average).grade;

      return {
        ...student,
        subjectScores,
        total,
        average,
        meanGrade,
        belowMinimum,
        subjectsCount: entries.length
      };
    });

    // Sort by total score descending; below-minimum students sink to the end.
    data.sort((a, b) => (b.belowMinimum ? -1 : b.total) - (a.belowMinimum ? -1 : a.total));

    // Assign ranks (handle ties)
    let currentRank = 1;
    let skip = 0;
    let prevTotal = null;

    data.forEach((student, index) => {
      if (prevTotal === null) {
        student.rank = currentRank;
      } else if (Math.round(student.total) === Math.round(prevTotal)) {
        student.rank = currentRank; // Tie
        skip++;
      } else {
        currentRank += 1 + skip;
        student.rank = currentRank;
        skip = 0;
      }
      prevTotal = student.total;
    });

    return data;
  }, [filteredStudents, gradeSubjects, getSubjectScore, getGrade, aggPolicy]);

  // Bottom summary: per-subject mean (only over students who actually have a
  // mark for that subject — nulls excluded so absentees don't drag it down),
  // plus overall class total/average across students who sat at least one
  // subject. Grades are derived from those means.
  const footerStats = useMemo(() => {
    const mean = arr => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
    const perSubject = {};
    gradeSubjects.forEach(sub => {
      const vals = gridData.map(s => s.subjectScores[sub.id]).filter(v => v !== null && v !== undefined);
      perSubject[sub.id] = mean(vals);
    });
    const withMarks = gridData.filter(s => gradeSubjects.some(sub => s.subjectScores[sub.id] !== null));
    const classTotal = mean(withMarks.map(s => s.total));
    const classAvg = mean(withMarks.map(s => s.average));
    return { perSubject, classTotal, classAvg, count: withMarks.length };
  }, [gridData, gradeSubjects]);

  // ---------------------------------------------------------------------
  // BROADSHEET (modelled on the classic KCSE merit broadsheet):
  // score+grade per subject, SUB, PTS (policy-aware "point cluster
  // selection"), M.SC (PTS÷SUB), GR, CL Pos (within stream), POS (overall,
  // whole class), KCPE + V.A.P, and a PTS/POS mini-block per exam sitting.
  // Computed over the WHOLE class so POS is real; the stream filter only
  // decides which rows are displayed.
  const bsData = useMemo(() => {
    if (!students.length || !gradeSubjects.length) return { rows: [] };

    // Competition ranking (1,2,2,4...) on a numeric key, descending.
    const rankInto = (list, keyFn, field) => {
      const ranked = list.filter(r => keyFn(r) !== null && !r.belowMinimum)
        .sort((a, b) => keyFn(b) - keyFn(a));
      let rank = 0, prev = null, seen = 0;
      ranked.forEach(r => {
        seen++;
        const v = Math.round(keyFn(r) * 100) / 100;
        if (prev === null || v !== prev) rank = seen;
        r[field] = rank; prev = v;
      });
    };

    const rows = students.map(student => {
      const subjectDetail = {};
      const entries = [];
      gradeSubjects.forEach(sub => {
        const score = getSubjectScore(student.id, sub.id);
        if (score !== null) {
          const g = getGrade(score);
          subjectDetail[sub.id] = { score: Math.round(score), grade: g.grade || g.code || '-' };
          entries.push({ score, group: sub.subject_group || 1 });
        }
      });
      const { counted, belowMinimum } = applyAggregationPolicy(aggPolicy, entries);
      const pts = counted.reduce((a, e) => a + (getGrade(e.score).points || 0), 0);
      const meanPts = counted.length ? pts / counted.length : 0;

      return {
        student, subjectDetail,
        sat: entries.length,
        pts, meanPts,
        meanGrade: counted.length ? gradeByPoints(meanPts) : '-',
        belowMinimum,
      };
    }).filter(r => r.sat > 0);

    // Overall position (whole class) and per-stream class position.
    rankInto(rows, r => r.pts + r.meanPts / 1000, 'pos');
    const byStream = {};
    rows.forEach(r => { (byStream[r.student.stream_id || 'none'] = byStream[r.student.stream_id || 'none'] || []).push(r); });
    Object.values(byStream).forEach(group => rankInto(group, r => r.pts + r.meanPts / 1000, 'clPos'));

    rows.sort((a, b) => (a.belowMinimum ? 1 : 0) - (b.belowMinimum ? 1 : 0) || (a.pos || 9999) - (b.pos || 9999));
    return { rows };
  }, [students, gradeSubjects, aggPolicy, getSubjectScore, getGrade, gradeByPoints]);

  // Broadsheet rows actually shown (stream filter applies to display only).
  const bsRows = useMemo(
    () => selectedStream === 'all' ? bsData.rows : bsData.rows.filter(r => r.student.stream_id === selectedStream),
    [bsData, selectedStream]
  );

  // Class averages for the broadsheet footer. Per subject: the mean of the
  // students who actually sat it (blank AND zero marks excluded, per request),
  // shown as score + grade. Overall: mean PTS, mean of the mean-points, and the
  // grade for that — computed only over students who count (not below-minimum).
  const bsFooter = useMemo(() => {
    const rows = bsRows.filter(r => !r.belowMinimum);
    if (!rows.length) return null;
    const subj = {};
    gradeSubjects.forEach(sub => {
      const vals = rows
        .map(r => r.subjectDetail[sub.id]?.score)
        .filter(v => v !== undefined && v !== null && v > 0);
      if (vals.length) {
        const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
        const g = getGrade(mean);
        subj[sub.id] = { mean, grade: g.grade || g.code || '-', n: vals.length };
      } else {
        subj[sub.id] = null;
      }
    });
    const avgPts = rows.reduce((a, r) => a + r.pts, 0) / rows.length;
    const avgMeanPts = rows.reduce((a, r) => a + r.meanPts, 0) / rows.length;
    return { subj, avgPts, avgMeanPts, meanGrade: gradeByPoints(avgMeanPts), n: rows.length };
  }, [bsRows, gradeSubjects, getGrade, gradeByPoints]);

  // Live estimate of printed pages (landscape A4) at the current settings.
  const estPages = usePageEstimate({
    containerId: 'marksheet-table-container',
    scale: printScale, font: printFont,
    autoPx: displayMode === 'broadsheet' ? 8 : 11,
    landscape: true,
    headerPx: 110, // school header + title block added by the print window
    deps: [displayMode, bsRows, gridData, isLoading],
  });

  const handlePrint = () => {
    const win = window.open('', '_blank');
    const baseTitle = selectedExamId === 'average' ? 'OVERALL AVERAGE MARKSHEET' : `${gradeExams.find(e => e.id === selectedExamId)?.name.toUpperCase()} MARKSHEET`;
    const title = displayMode === 'broadsheet'
      ? `EXAM RESULTS ${(currentTypeClasses.find(c => c.id === selectedClass)?.name || '').toUpperCase()} — ${selectedExamId === 'average' ? 'OVERALL AVERAGE' : (gradeExams.find(e => e.id === selectedExamId)?.name || '').toUpperCase()}`
      : displayMode === 'grades' ? `${baseTitle} (GRADES)` : baseTitle;
    const className = currentTypeClasses.find(c => c.id === selectedClass)?.name || selectedClass;
    const streamName = selectedStream === 'all' ? 'All Streams' : dbStreams.find(s => s.id === selectedStream)?.name || '';
    const clusterNote = displayMode === 'broadsheet' && aggPolicy && aggPolicy.count_all === false
      ? '<div style="font-weight:bold;font-size:12px;margin-top:4px">RANKING BY POINT CLUSTER SELECTION</div>' : '';
    const stamp = displayMode === 'broadsheet'
      ? `<div style="margin-top:10px;font-size:9px;color:#555">${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}</div>` : '';

    const cellFont = printCellFont(printFont, displayMode === 'broadsheet' ? 8 : 11);
    const cellPad = displayMode === 'broadsheet'
      ? (cellFont <= 7 ? '1px 2px' : '2px 3px')
      : (cellFont <= 9 ? '3px' : '5px');
    win.document.write(`<html><head><title>Exam Marksheet</title>
      <style>
        @page { size: landscape; margin: 8mm; }
        body { font-family: Arial, sans-serif; font-size: 11px; color: #000; zoom: ${printScale / 100}; }
        .header { text-align: center; margin-bottom: 14px; }
        .school-name { font-size: 20px; font-weight: bold; margin: 5px 0; }
        .report-title { font-size: 16px; font-weight: bold; margin: 8px 0; text-decoration: underline; }
        .meta-info { display: flex; justify-content: space-between; margin-bottom: 10px; font-weight: bold; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #000; padding: ${cellPad}; text-align: center; font-size: ${cellFont}px; }
        th { background: #f0f0f0; }
        .text-left { text-align: left; }
        .bold { font-weight: bold; }
      </style>
    </head><body>
      <div class="header">
        ${schoolInfo?.logo_url ? `<img src="${schoolInfo.logo_url}" style="height:60px; object-fit:contain;" />` : ''}
        <div class="school-name">${(schoolConfig?.schoolName || '').toUpperCase()}</div>
        <div class="report-title">${title}</div>
        ${clusterNote}
      </div>
      <div class="meta-info">
        <div>CLASS: ${className} ${streamName}</div>
        <div>TERM: ${selectedTerm}</div>
        <div>YEAR: ${selectedYear}</div>
      </div>
      ${document.getElementById('marksheet-table-container').innerHTML}
      ${stamp}
    </body></html>`);
    
    win.document.close();
    setTimeout(() => win.print(), 500);
  };

  const labelStyle = { fontSize: 10, color: '#8A8FA8', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase' };
  const selectStyle = { width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #E8EAF0', fontSize: 12, background: '#fff', outline: 'none' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 16 }}>
      {/* Top Filter Bar */}
      <div style={{ background: '#fff', border: '1px solid #E8EAF0', borderRadius: 12, padding: '16px 24px', display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end' }}>
        <div style={{ flex: 1, minWidth: 120 }}>
          <div style={labelStyle}>Level</div>
          <select value={selectedLevel} onChange={e => setSelectedLevel(e.target.value)} style={selectStyle}>
            {availableTypes.length > 1 && <option value="All">All Levels</option>}
            {availableTypes.map(t => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 120 }}>
          <div style={labelStyle}>Class</div>
          <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)} style={selectStyle}>
            {filteredClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 120 }}>
          <div style={labelStyle}>Stream</div>
          <select value={selectedStream} onChange={e => setSelectedStream(e.target.value)} style={selectStyle}>
            <option value="all">All Streams</option>
            {dbStreams.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 100 }}>
          <div style={labelStyle}>Year</div>
          <select value={selectedYear} onChange={e => setSelectedYear(parseInt(e.target.value))} style={selectStyle}>
            {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 100 }}>
          <div style={labelStyle}>Term</div>
          <select value={selectedTerm} onChange={e => setSelectedTerm(e.target.value)} style={selectStyle}>
            <option>Term 1</option><option>Term 2</option><option>Term 3</option>
          </select>
        </div>
        <div style={{ flex: 1.5, minWidth: 160 }}>
          <div style={labelStyle}>Exam / Report Type</div>
          <select value={selectedExamId} onChange={e => setSelectedExamId(e.target.value)} style={{...selectStyle, background: '#f5f8fa', borderColor: '#d1dee5', fontWeight: 700 }}>
            <option value="average">🌟 Overall Average Marksheet</option>
            {gradeExams.map(e => <option key={e.id} value={e.id}>📄 {e.name}</option>)}
          </select>
        </div>
        <div>
          <div style={labelStyle}>Display</div>
          <div style={{ display: 'flex', border: '1px solid #d1dee5', borderRadius: 8, overflow: 'hidden', height: 36 }}>
            {[['broadsheet', 'Broadsheet'], ['marks', 'Marks'], ['grades', 'Grades']].map(([mode, label], i) => (
              <button
                key={mode}
                onClick={() => setDisplayMode(mode)}
                style={{
                  padding: '0 14px', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700,
                  background: displayMode === mode ? '#1B6B3A' : '#fff',
                  color: displayMode === mode ? '#fff' : '#2a2421',
                  borderLeft: i > 0 ? '1px solid #d1dee5' : 'none',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div style={labelStyle} title="Scale and font for the printout — the badge estimates printed pages">Print Size</div>
          <PrintSizer scale={printScale} setScale={setPrintScale} font={printFont} setFont={setPrintFont} pages={estPages} />
        </div>
        <div>
          <div style={labelStyle}>&nbsp;</div>
          <button onClick={handlePrint} disabled={displayMode === 'broadsheet' ? !bsRows.length : !gridData.length} style={{ padding: '8px 24px', background: (displayMode === 'broadsheet' ? bsRows.length : gridData.length) ? '#1B6B3A' : '#8A8FA8', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: (displayMode === 'broadsheet' ? bsRows.length : gridData.length) ? 'pointer' : 'not-allowed', height: 36, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>🖨️</span> Print Marksheet
          </button>
        </div>
      </div>

      {/* Marksheet Grid */}
      <div style={{ flex: 1, background: '#fff', border: '1px solid #E8EAF0', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {isLoading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8A8FA8' }}>Loading marks...</div>
        ) : (displayMode === 'broadsheet' ? !bsRows.length : !gridData.length) ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8A8FA8', flexDirection: 'column', gap: 10 }}>
            <span style={{ fontSize: 40 }}>📄</span>
            <span>No data available for this selection.</span>
          </div>
        ) : displayMode === 'broadsheet' ? (
          <div id="marksheet-table-container" style={{ flex: 1, overflow: 'auto' }}>
            {(() => {
              const showStr = selectedStream === 'all';
              const thB = { border: '1px solid #d8d2c8', padding: '5px 4px', textAlign: 'center', fontWeight: 800, fontSize: 10, background: '#faf8f5', whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 5 };
              const tdB = { border: '1px solid #e6dfd8', padding: '4px 4px', textAlign: 'center', fontSize: 11, whiteSpace: 'nowrap' };
              const shortName = (n) => (n || '').length > 5 ? n.slice(0, 4).toUpperCase() : (n || '').toUpperCase();
              return (
                <>
                  <div style={{ padding: '10px 14px 6px', textAlign: 'center' }}>
                    <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: 0.5, color: '#1A1A2E' }}>
                      EXAM RESULTS {(currentTypeClasses.find(c => c.id === selectedClass)?.name || '').toUpperCase()}
                      {selectedStream !== 'all' ? ` ${(dbStreams.find(s => s.id === selectedStream)?.name || '').toUpperCase()}` : ''} · {selectedTerm.toUpperCase()} {selectedYear} · {selectedExamId === 'average' ? 'OVERALL AVERAGE' : (gradeExams.find(e => e.id === selectedExamId)?.name || '').toUpperCase()}
                    </div>
                    {aggPolicy && aggPolicy.count_all === false && (
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: '#8A6A1F', marginTop: 2 }}>RANKING BY POINT CLUSTER SELECTION</div>
                    )}
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                    <thead>
                      <tr>
                        <th style={thB}>ADM</th>
                        <th style={{ ...thB, textAlign: 'left', minWidth: 140 }}>NAME</th>
                        {showStr && <th style={thB}>STR</th>}
                        <th style={thB} title="Subjects sat">SUB</th>
                        {gradeSubjects.map(sub => (
                          <th key={sub.id} style={{ ...thB, background: '#f0efe8' }} title={sub.name}>{shortName(sub.name)}</th>
                        ))}
                        <th style={{ ...thB, background: '#e8f5ee', color: '#1B6B3A' }} title="Total points">PTS</th>
                        <th style={{ ...thB, background: '#e8f5ee', color: '#1B6B3A' }} title="Mean points (points ÷ subjects)">M.PTS</th>
                        <th style={{ ...thB, background: '#e8f5ee', color: '#1B6B3A' }} title="Mean grade">M.GR</th>
                        <th style={{ ...thB, background: '#eef3ee' }} title="Class position (within the stream)">CLp</th>
                        <th style={{ ...thB, background: '#eef3ee' }} title="Overall position (whole class)">POS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bsRows.map((r, idx) => (
                        <tr key={r.student.id} style={{ background: idx % 2 === 0 ? '#fff' : '#faf8f5' }}>
                          <td style={{ ...tdB, fontSize: 10 }}>{r.student.adm_no}</td>
                          <td style={{ ...tdB, textAlign: 'left', fontWeight: 600, fontSize: 10.5 }}>{r.student.first_name} {r.student.last_name}</td>
                          {showStr && <td style={{ ...tdB, fontSize: 10 }}>{dbStreams.find(s => s.id === r.student.stream_id)?.name || '—'}</td>}
                          <td style={{ ...tdB, fontWeight: 700 }}>{r.sat}</td>
                          {gradeSubjects.map(sub => {
                            const d = r.subjectDetail[sub.id];
                            return (
                              <td key={sub.id} style={{ ...tdB, fontSize: 10, color: d ? '#2a2421' : '#c9c4bd' }}>
                                {d ? `${d.score} ${d.grade}` : '—'}
                              </td>
                            );
                          })}
                          <td style={{ ...tdB, fontWeight: 800, background: '#f0faf3' }}>{r.belowMinimum ? '—' : r.pts}</td>
                          <td style={{ ...tdB, fontWeight: 700, background: '#f0faf3' }}>{r.belowMinimum ? '—' : r.meanPts.toFixed(2)}</td>
                          <td style={{ ...tdB, fontWeight: 800, color: '#d35400', background: '#f0faf3' }}>{r.belowMinimum ? 'BM' : r.meanGrade}</td>
                          <td style={{ ...tdB, fontWeight: 700, background: '#f4f7f4' }}>{r.belowMinimum ? '—' : (r.clPos || '—')}</td>
                          <td style={{ ...tdB, fontWeight: 800, color: '#1B6B3A', background: '#f4f7f4' }}>{r.belowMinimum ? '—' : r.pos}</td>
                        </tr>
                      ))}
                    </tbody>
                    {bsFooter && (
                      <tfoot>
                        <tr>
                          <td colSpan={showStr ? 4 : 3} style={{ ...tdB, textAlign: 'right', fontWeight: 800, background: '#e8f5ee', color: '#1B6B3A' }}>
                            SUBJECT MEAN →
                          </td>
                          {gradeSubjects.map(sub => {
                            const m = bsFooter.subj[sub.id];
                            return (
                              <td key={sub.id} style={{ ...tdB, fontSize: 10, fontWeight: 700, background: '#f0efe8', color: m ? '#2a2421' : '#c9c4bd' }}>
                                {m ? `${Math.round(m.mean)} ${m.grade}` : '—'}
                              </td>
                            );
                          })}
                          <td style={{ ...tdB, fontWeight: 800, background: '#e8f5ee', color: '#1B6B3A' }}>{bsFooter.avgPts.toFixed(1)}</td>
                          <td style={{ ...tdB, fontWeight: 700, background: '#e8f5ee', color: '#1B6B3A' }}>{bsFooter.avgMeanPts.toFixed(2)}</td>
                          <td style={{ ...tdB, fontWeight: 800, color: '#d35400', background: '#e8f5ee' }}>{bsFooter.meanGrade}</td>
                          <td style={{ ...tdB, background: '#eef3ee' }}></td>
                          <td style={{ ...tdB, background: '#eef3ee' }}></td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                  <div style={{ padding: '8px 14px', fontSize: 10, color: '#8a8fa8' }}>
                    Printed {new Date().toLocaleDateString()} {new Date().toLocaleTimeString()}
                    {aggPolicy && aggPolicy.count_all === false ? ` · PTS uses the ${aggPolicy.min_subjects ? `best-${aggPolicy.min_subjects}` : 'configured'} point cluster selection` : ''}
                    {' · CLp = class (stream) position · POS = overall position'}
                    {bsFooter ? ` · SUBJECT MEAN over ${bsFooter.n} student${bsFooter.n === 1 ? '' : 's'} who sat (blank & zero marks excluded)` : ''}
                  </div>
                </>
              );
            })()}
          </div>
        ) : (
          <div id="marksheet-table-container" style={{ flex: 1, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 800 }}>
              <thead style={{ position: 'sticky', top: 0, background: '#fafafa', zIndex: 10, boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                <tr>
                  <th style={{ border: '1px solid #e6dfd8', padding: '8px', textAlign: 'center', fontWeight: 800, width: 50, color: '#1B6B3A' }}>POS</th>
                  <th style={{ border: '1px solid #e6dfd8', padding: '8px', textAlign: 'left', fontWeight: 700, width: 80 }}>ADM</th>
                  <th style={{ border: '1px solid #e6dfd8', padding: '8px', textAlign: 'left', fontWeight: 700, minWidth: 150 }}>NAME</th>
                  {gradeSubjects.map(sub => (
                    <th key={sub.id} style={{ border: '1px solid #e6dfd8', padding: '8px', textAlign: 'center', fontWeight: 700, minWidth: 60, textTransform: 'uppercase' }} title={sub.name}>
                      {sub.code || sub.name.substring(0,4)}
                    </th>
                  ))}
                  <th style={{ border: '1px solid #e6dfd8', padding: '8px', textAlign: 'center', fontWeight: 800, background: '#f0f4f8' }}>TOTAL</th>
                  <th style={{ border: '1px solid #e6dfd8', padding: '8px', textAlign: 'center', fontWeight: 800, background: '#f0f4f8' }}>AVG %</th>
                  <th style={{ border: '1px solid #e6dfd8', padding: '8px', textAlign: 'center', fontWeight: 800, background: '#f5efe6' }}>GRADE</th>
                </tr>
              </thead>
              <tbody>
                {gridData.map((student, idx) => (
                  <tr key={student.id} style={{ background: idx % 2 === 0 ? '#fff' : '#f9fafc' }}>
                    <td style={{ border: '1px solid #e6dfd8', padding: '6px 8px', textAlign: 'center', fontWeight: 800, color: '#1B6B3A' }}>{student.belowMinimum ? '—' : student.rank}</td>
                    <td style={{ border: '1px solid #e6dfd8', padding: '6px 8px', color: '#555' }}>{student.adm_no}</td>
                    <td style={{ border: '1px solid #e6dfd8', padding: '6px 8px', fontWeight: 600 }}>{student.first_name} {student.last_name}</td>
                    {gradeSubjects.map(sub => {
                      const score = student.subjectScores[sub.id];
                      const cell = score === null ? '-' : (displayMode === 'grades' ? getGrade(score).grade : Math.round(score));
                      return (
                        <td key={sub.id} style={{ border: '1px solid #e6dfd8', padding: '6px 8px', textAlign: 'center', fontWeight: displayMode === 'grades' ? 700 : 400, color: displayMode === 'grades' && score !== null ? '#d35400' : undefined }}>
                          {cell}
                        </td>
                      );
                    })}
                    <td style={{ border: '1px solid #e6dfd8', padding: '6px 8px', textAlign: 'center', fontWeight: 700, background: '#f0f4f8' }} title={student.belowMinimum ? 'Below minimum subjects required for grading' : undefined}>{student.belowMinimum ? '—' : Math.round(student.total)}</td>
                    <td style={{ border: '1px solid #e6dfd8', padding: '6px 8px', textAlign: 'center', fontWeight: 700, background: '#f0f4f8' }}>{student.belowMinimum ? '—' : Math.round(student.average)}</td>
                    <td style={{ border: '1px solid #e6dfd8', padding: '6px 8px', textAlign: 'center', fontWeight: 700, background: '#f5efe6', color: '#d35400' }}>{student.belowMinimum ? 'BELOW MIN' : student.meanGrade}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                {/* Per-subject class average (marks only; absentees excluded) */}
                <tr style={{ background: '#eef3ee', fontWeight: 800 }}>
                  <td colSpan={3} style={{ border: '1px solid #e6dfd8', padding: '6px 8px', textAlign: 'right', color: '#1B6B3A' }}>
                    SUBJECT AVERAGE
                  </td>
                  {gradeSubjects.map(sub => {
                    const m = footerStats.perSubject[sub.id];
                    const cell = m == null ? '-' : (displayMode === 'grades' ? getGrade(m).grade : Math.round(m));
                    return (
                      <td key={sub.id} style={{ border: '1px solid #e6dfd8', padding: '6px 8px', textAlign: 'center', color: displayMode === 'grades' && m != null ? '#d35400' : '#1A1A2E' }}>
                        {cell}
                      </td>
                    );
                  })}
                  <td style={{ border: '1px solid #e6dfd8', padding: '6px 8px', textAlign: 'center', background: '#f0f4f8' }}>
                    {footerStats.classTotal != null ? Math.round(footerStats.classTotal) : '-'}
                  </td>
                  <td style={{ border: '1px solid #e6dfd8', padding: '6px 8px', textAlign: 'center', background: '#f0f4f8' }}>
                    {footerStats.classAvg != null ? Math.round(footerStats.classAvg) : '-'}
                  </td>
                  <td style={{ border: '1px solid #e6dfd8', padding: '6px 8px', textAlign: 'center', background: '#f5efe6', color: '#d35400' }}>
                    {footerStats.classAvg != null ? getGrade(footerStats.classAvg).grade : '-'}
                  </td>
                </tr>
                {/* Per-subject grade of that average — only in Marks view, since
                    the Grades view already shows grades in the row above. */}
                {displayMode === 'marks' && (
                <tr style={{ background: '#f7faf7', fontWeight: 700 }}>
                  <td colSpan={3} style={{ border: '1px solid #e6dfd8', padding: '6px 8px', textAlign: 'right', color: '#1B6B3A' }}>
                    SUBJECT GRADE
                  </td>
                  {gradeSubjects.map(sub => {
                    const m = footerStats.perSubject[sub.id];
                    return (
                      <td key={sub.id} style={{ border: '1px solid #e6dfd8', padding: '6px 8px', textAlign: 'center', color: '#d35400' }}>
                        {m != null ? getGrade(m).grade : '-'}
                      </td>
                    );
                  })}
                  <td colSpan={3} style={{ border: '1px solid #e6dfd8', padding: '6px 8px', textAlign: 'center', color: '#8A8FA8', fontWeight: 600 }}>
                    Based on {footerStats.count} student{footerStats.count === 1 ? '' : 's'} with marks
                  </td>
                </tr>
                )}
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Marksheets;

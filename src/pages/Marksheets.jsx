import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { CLASSES } from '../data/mockData';

const Marksheets = ({ schoolConfig, examsList }) => {
  const [students, setStudents] = useState([]);
  const [dbSubjects, setDbSubjects] = useState([]);
  const [dbGrades, setDbGrades] = useState([]);
  const [dbStreams, setDbStreams] = useState([]);
  const [allMarks, setAllMarks] = useState([]);
  const [schoolInfo, setSchoolInfo] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // Filters
  const [selectedLevel, setSelectedLevel] = useState('Secondary');
  const [selectedClass, setSelectedClass] = useState('g10');
  const [selectedStream, setSelectedStream] = useState('all');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedTerm, setSelectedTerm] = useState('Term 1');
  const [selectedExamId, setSelectedExamId] = useState('average'); // 'average' or specific exam.id

  const currentTypeClasses = useMemo(() => CLASSES, []);

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

  const getGrade = useCallback((score) => {
    let scale = dbGrades.filter(g => g.level_group === selectedClass);
    if (!scale.length) scale = dbGrades;
    if (!scale.length) {
      scale = [
        { grade: 'EE', min_score: 80 },
        { grade: 'ME', min_score: 50 },
        { grade: 'AE', min_score: 30 },
        { grade: 'BE', min_score: 0 },
      ];
    }
    const sorted = [...scale].sort((a, b) => b.min_score - a.min_score);
    for (const g of sorted) {
      if (score >= g.min_score) return g;
    }
    return { grade: '-' };
  }, [dbGrades, selectedClass]);

  // Calculate score for one student + one subject based on selected mode
  const getSubjectScore = useCallback((studentId, subjectId) => {
    if (selectedExamId === 'average') {
      if (!gradeExams.length) return null;
      let hasAnyMark = false;
      const weighted = gradeExams.reduce((sum, exam) => {
        const mark = allMarks.find(m => m.student_id === studentId && m.exam_id === exam.id && m.subject_id === subjectId);
        if (mark && mark.score !== null) hasAnyMark = true;
        return sum + (mark?.score || 0) * ((exam.weight || 0) / 100);
      }, 0);
      return hasAnyMark ? weighted : null;
    } else {
      const mark = allMarks.find(m => m.student_id === studentId && m.exam_id === selectedExamId && m.subject_id === subjectId);
      return mark && mark.score !== null ? mark.score : null;
    }
  }, [selectedExamId, gradeExams, allMarks]);

  // Build grid data
  const gridData = useMemo(() => {
    if (!filteredStudents.length) return [];

    let data = filteredStudents.map(student => {
      let total = 0;
      let count = 0;
      const subjectScores = {};

      gradeSubjects.forEach(sub => {
        const score = getSubjectScore(student.id, sub.id);
        subjectScores[sub.id] = score;
        if (score !== null) {
          total += score;
          count++;
        }
      });

      const average = count > 0 ? total / count : 0;
      const meanGrade = getGrade(average).grade;

      return {
        ...student,
        subjectScores,
        total,
        average,
        meanGrade,
        subjectsCount: count
      };
    });

    // Sort by total score descending
    data.sort((a, b) => b.total - a.total);

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
  }, [filteredStudents, gradeSubjects, getSubjectScore, getGrade]);

  const handlePrint = () => {
    const win = window.open('', '_blank');
    const title = selectedExamId === 'average' ? 'OVERALL AVERAGE MARKSHEET' : `${gradeExams.find(e => e.id === selectedExamId)?.name.toUpperCase()} MARKSHEET`;
    const className = currentTypeClasses.find(c => c.id === selectedClass)?.name || selectedClass;
    const streamName = selectedStream === 'all' ? 'All Streams' : dbStreams.find(s => s.id === selectedStream)?.name || '';

    win.document.write(`<html><head><title>Exam Marksheet</title>
      <style>
        @page { size: landscape; margin: 10mm; }
        body { font-family: Arial, sans-serif; font-size: 11px; color: #000; }
        .header { text-align: center; margin-bottom: 20px; }
        .school-name { font-size: 20px; font-weight: bold; margin: 5px 0; }
        .report-title { font-size: 16px; font-weight: bold; margin: 10px 0; text-decoration: underline; }
        .meta-info { display: flex; justify-content: space-between; margin-bottom: 15px; font-weight: bold; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #000; padding: 5px; text-align: center; }
        th { background: #f0f0f0; }
        .text-left { text-align: left; }
        .bold { font-weight: bold; }
      </style>
    </head><body>
      <div class="header">
        ${schoolInfo?.logo_url ? `<img src="${schoolInfo.logo_url}" style="height:60px; object-fit:contain;" />` : ''}
        <div class="school-name">${(schoolConfig?.schoolName || '').toUpperCase()}</div>
        <div class="report-title">${title}</div>
      </div>
      <div class="meta-info">
        <div>CLASS: ${className} ${streamName}</div>
        <div>TERM: ${selectedTerm}</div>
        <div>YEAR: ${selectedYear}</div>
      </div>
      ${document.getElementById('marksheet-table-container').innerHTML}
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
            <option value="All">All Levels</option>
            <option value="Primary">Primary</option>
            <option value="JSS">Junior Secondary</option>
            <option value="Secondary">Senior Secondary</option>
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
          <button onClick={handlePrint} disabled={!gridData.length} style={{ padding: '8px 24px', background: gridData.length ? '#1B6B3A' : '#8A8FA8', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: gridData.length ? 'pointer' : 'not-allowed', height: 36, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>🖨️</span> Print Marksheet
          </button>
        </div>
      </div>

      {/* Marksheet Grid */}
      <div style={{ flex: 1, background: '#fff', border: '1px solid #E8EAF0', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {isLoading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8A8FA8' }}>Loading marks...</div>
        ) : !gridData.length ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8A8FA8', flexDirection: 'column', gap: 10 }}>
            <span style={{ fontSize: 40 }}>📄</span>
            <span>No data available for this selection.</span>
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
                    <td style={{ border: '1px solid #e6dfd8', padding: '6px 8px', textAlign: 'center', fontWeight: 800, color: '#1B6B3A' }}>{student.rank}</td>
                    <td style={{ border: '1px solid #e6dfd8', padding: '6px 8px', color: '#555' }}>{student.adm_no}</td>
                    <td style={{ border: '1px solid #e6dfd8', padding: '6px 8px', fontWeight: 600 }}>{student.first_name} {student.last_name}</td>
                    {gradeSubjects.map(sub => {
                      const score = student.subjectScores[sub.id];
                      return (
                        <td key={sub.id} style={{ border: '1px solid #e6dfd8', padding: '6px 8px', textAlign: 'center' }}>
                          {score !== null ? Math.round(score) : '-'}
                        </td>
                      );
                    })}
                    <td style={{ border: '1px solid #e6dfd8', padding: '6px 8px', textAlign: 'center', fontWeight: 700, background: '#f0f4f8' }}>{Math.round(student.total)}</td>
                    <td style={{ border: '1px solid #e6dfd8', padding: '6px 8px', textAlign: 'center', fontWeight: 700, background: '#f0f4f8' }}>{Math.round(student.average)}</td>
                    <td style={{ border: '1px solid #e6dfd8', padding: '6px 8px', textAlign: 'center', fontWeight: 700, background: '#f5efe6', color: '#d35400' }}>{student.meanGrade}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Marksheets;

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { CLASSES } from '../data/mockData';

const Reports = ({ schoolConfig, examsList }) => {
  const [students, setStudents] = useState([]);
  const [dbSubjects, setDbSubjects] = useState([]);
  const [dbGrades, setDbGrades] = useState([]);
  const [dbStreams, setDbStreams] = useState([]);
  const [allMarks, setAllMarks] = useState([]); // marks for ALL students in grade
  const [schoolInfo, setSchoolInfo] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState(null);
  const [selectedClass, setSelectedClass] = useState('g10');
  const [selectedStream, setSelectedStream] = useState('all');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedTerm, setSelectedTerm] = useState('Term 1');

  const currentTypeClasses = useMemo(() => CLASSES, []);

  const selectedStudent = useMemo(
    () => students.find(s => s.id === selectedStudentId),
    [students, selectedStudentId]
  );

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

  const getGrade = useCallback((score) => {
    let scale = dbGrades.filter(g => g.level_group === selectedClass);
    if (!scale.length) scale = dbGrades;
    if (!scale.length) {
      scale = [
        { grade: 'EE', min_score: 80, label: 'Exceeding Expectations' },
        { grade: 'ME', min_score: 50, label: 'Meeting Expectations' },
        { grade: 'AE', min_score: 30, label: 'Approaching Expectations' },
        { grade: 'BE', min_score: 0,  label: 'Below Expectations' },
      ];
    }
    const sorted = [...scale].sort((a, b) => b.min_score - a.min_score);
    for (const g of sorted) {
      if (score >= g.min_score) return g;
    }
    return { grade: '-', label: '' };
  }, [dbGrades, selectedClass]);

  // Compute weighted score for a student + subject
  const getStudentSubjectScore = useCallback((studentId, subjectId) => {
    if (!gradeExams.length) return 0;
    const totalWeight = gradeExams.reduce((s, e) => s + (e.weight || 0), 0);
    if (!totalWeight) return 0;
    const weighted = gradeExams.reduce((sum, exam) => {
      const mark = allMarks.find(m => m.student_id === studentId && m.exam_id === exam.id && m.subject_id === subjectId);
      return sum + (mark?.score || 0) * ((exam.weight || 0) / 100);
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
      return { sub, score, best, grade, examScores };
    });
  }, [gradeSubjects, gradeExams, allMarks, getStudentSubjectScore, getBestInGrade, getGrade]);

  const labelStyle = { fontSize: 10, color: '#8A8FA8', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase' };
  const selectStyle = { width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #E8EAF0', fontSize: 12, background: '#fff', outline: 'none' };

  // Single report card HTML (used for both preview + bulk PDF)
  const ReportCard = ({ student }) => {
    const rows = buildReportData(student);
    const scores = rows.map(r => r.score).filter(s => s > 0);
    const total = scores.reduce((a, b) => a + b, 0);
    const average = scores.length ? total / scores.length : 0;
    const overallGrade = getGrade(average);
    const className = currentTypeClasses.find(c => c.id === student.level_id)?.name || student.level_id;

    return (
      <div style={{ maxWidth: 750, margin: '0 auto', border: '1px solid #000', padding: '20px', background: '#fff', fontSize: 12 }}>
        {/* Header */}
        <div style={{ textAlign: 'center', borderBottom: '2px solid #000', paddingBottom: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: 1 }}>{schoolConfig?.schoolName?.toUpperCase() || 'INSTITUTION NAME'}</div>
          <div style={{ fontSize: 11, fontWeight: 700, marginTop: 4 }}>MOTTO: {schoolInfo?.motto?.toUpperCase() || 'EDUCATION FOR EXCELLENCE'}</div>
          <div style={{ fontSize: 10, marginTop: 4 }}>EMAIL: {schoolConfig?.email} · TEL: {schoolConfig?.phone}</div>
          <div style={{ display: 'inline-block', marginTop: 12, padding: '4px 20px', border: '2px solid #000', fontSize: 13, fontWeight: 900 }}>STUDENT PROGRESS REPORT</div>
        </div>

        {/* Student Info */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div>
            <div style={{ marginBottom: 4 }}><b>NAME:</b> <u>{student.first_name?.toUpperCase()} {student.last_name?.toUpperCase()}</u></div>
            <div style={{ marginBottom: 4 }}><b>ADM NO:</b> <u>{student.adm_no}</u></div>
            <div style={{ marginBottom: 4 }}><b>CLASS:</b> <u>{className}</u></div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ marginBottom: 4 }}><b>TERM:</b> <u>{selectedTerm.toUpperCase()}</u></div>
            <div style={{ marginBottom: 4 }}><b>YEAR:</b> <u>{selectedYear}</u></div>
            <div style={{ marginBottom: 4 }}><b>DATE:</b> <u>{new Date().toLocaleDateString()}</u></div>
          </div>
        </div>

        {/* Marks Table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
          <thead>
            <tr style={{ background: '#F0F2F5' }}>
              <th style={{ border: '1px solid #000', padding: '6px 8px', textAlign: 'left' }}>SUBJECT</th>
              {gradeExams.map(e => (
                <th key={e.id} style={{ border: '1px solid #000', padding: '6px 8px', textAlign: 'center', minWidth: 60 }}>{e.name.toUpperCase()}</th>
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
                <td style={{ border: '1px solid #000', padding: '6px 8px', color: '#555', fontSize: 11 }}>{grade.label || grade.remarks || ''}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: '#1A1A2E', color: '#fff' }}>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontWeight: 700 }}>SUMMARY</td>
              {gradeExams.map((_, i) => <td key={i} style={{ border: '1px solid #000' }} />)}
              <td style={{ border: '1px solid #000', padding: '6px 8px', textAlign: 'center', fontWeight: 900 }}>{Math.round(total)}</td>
              <td style={{ border: '1px solid #000', padding: '6px 8px', textAlign: 'center', fontWeight: 900 }}>{overallGrade.grade}</td>
              <td style={{ border: '1px solid #000', padding: '6px 8px', textAlign: 'center' }}>AVG: {Math.round(average)}%</td>
              <td style={{ border: '1px solid #000', padding: '6px 8px' }}>{overallGrade.label}</td>
            </tr>
          </tfoot>
        </table>

        {/* Remarks */}
        <div style={{ border: '1px solid #000', padding: '10px', marginBottom: 20 }}>
          <div style={{ fontWeight: 700, marginBottom: 5 }}>TEACHER'S REMARKS:</div>
          <div style={{ minHeight: 28, background: '#F9F9F9' }}>A very disciplined and hardworking student. Maintain the consistency.</div>
        </div>

        {/* Signatures */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 40 }}>
          <div style={{ textAlign: 'center' }}><div style={{ borderTop: '1px solid #000', paddingTop: 5, width: 120 }}>Class Teacher</div></div>
          <div style={{ textAlign: 'center' }}><div style={{ borderTop: '1px solid #000', paddingTop: 5, width: 120 }}>Headteacher</div></div>
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
      .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 16px; margin-bottom: 16px; }
      .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
      .info-right { text-align: right; }
      .tfoot-row { background: #1A1A2E; color: #fff; }
      .remarks { border: 1px solid #000; padding: 10px; margin-bottom: 20px; }
      .sigs { display: flex; justify-content: space-between; margin-top: 40px; }
      .sig { text-align: center; border-top: 1px solid #000; padding-top: 5px; width: 120px; }
      @media print { @page { margin: 10mm; } }
    </style></head><body>`);

    printStudents.forEach(student => {
      const rows = buildReportData(student);
      const scores = rows.map(r => r.score).filter(s => s > 0);
      const total = scores.reduce((a, b) => a + b, 0);
      const average = scores.length ? total / scores.length : 0;
      const overallGrade = getGrade(average);
      const className = currentTypeClasses.find(c => c.id === student.level_id)?.name || '';

      win.document.write(`<div class="page">
        <div class="header">
          <div style="font-size:20px;font-weight:900">${(schoolConfig?.schoolName || '').toUpperCase()}</div>
          <div style="font-size:11px;font-weight:700;margin-top:4px">MOTTO: ${(schoolInfo?.motto || 'EDUCATION FOR EXCELLENCE').toUpperCase()}</div>
          <div style="font-size:10px;margin-top:4px">EMAIL: ${schoolConfig?.email || ''} · TEL: ${schoolConfig?.phone || ''}</div>
          <div style="display:inline-block;margin-top:12px;padding:4px 20px;border:2px solid #000;font-size:13px;font-weight:900">STUDENT PROGRESS REPORT</div>
        </div>
        <div class="info-grid">
          <div>
            <div><b>NAME:</b> <u>${student.first_name?.toUpperCase()} ${student.last_name?.toUpperCase()}</u></div>
            <div><b>ADM NO:</b> <u>${student.adm_no}</u></div>
            <div><b>CLASS:</b> <u>${className}</u></div>
          </div>
          <div class="info-right">
            <div><b>TERM:</b> <u>${selectedTerm.toUpperCase()}</u></div>
            <div><b>YEAR:</b> <u>${selectedYear}</u></div>
            <div><b>DATE:</b> <u>${new Date().toLocaleDateString()}</u></div>
          </div>
        </div>
        <table>
          <thead><tr style="background:#F0F2F5">
            <th style="text-align:left">SUBJECT</th>
            ${gradeExams.map(e => `<th style="text-align:center">${e.name.toUpperCase()}</th>`).join('')}
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
                <td style="font-size:11px;color:#555">${grade.label || ''}</td>
              </tr>`).join('')}
          </tbody>
          <tfoot>
            <tr class="tfoot-row">
              <td><b>SUMMARY</b></td>
              ${gradeExams.map(() => '<td></td>').join('')}
              <td style="text-align:center;font-weight:900">${Math.round(total)}</td>
              <td style="text-align:center;font-weight:900">${overallGrade.grade}</td>
              <td style="text-align:center">AVG: ${Math.round(average)}%</td>
              <td>${overallGrade.label || ''}</td>
            </tr>
          </tfoot>
        </table>
        <div class="remarks"><b>TEACHER'S REMARKS:</b><div style="min-height:28px;background:#F9F9F9">A very disciplined and hardworking student. Maintain the consistency.</div></div>
        <div class="sigs">
          <div><div class="sig">Class Teacher</div></div>
          <div><div class="sig">Headteacher</div></div>
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
            <div>
              <div style={labelStyle}>CLASS</div>
              <select value={selectedClass} onChange={e => { setSelectedClass(e.target.value); }} style={selectStyle}>
                {currentTypeClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
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

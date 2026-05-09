import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';

const Reports = ({ schoolConfig, examsList }) => {
  const [students, setStudents] = useState([]);
  const [dbSubjects, setDbSubjects] = useState([]);
  const [dbMarks, setDbMarks] = useState([]);
  const [dbGrades, setDbGrades] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState(null);
  const [schoolInfo, setSchoolInfo] = useState(null);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedTerm, setSelectedTerm] = useState("Term 1");

  useEffect(() => {
    if (schoolConfig?.id) {
      fetchStudents();
      fetchSchoolInfo();
      fetchSubjects();
      fetchGrades();
    }
  }, [schoolConfig?.id, selectedClass]);

  useEffect(() => {
    if (selectedStudentId) {
      fetchMarks();
    }
  }, [selectedStudentId, selectedYear, selectedTerm]);

  const fetchStudents = async () => {
    const { data } = await supabase
      .from('students')
      .select('*')
      .eq('school_id', schoolConfig.id)
      .eq('level_id', selectedClass);
    setStudents(data || []);
  };

  const fetchSubjects = async () => {
    const { data } = await supabase
      .from('subjects')
      .select('*')
      .eq('school_id', schoolConfig.id);
    setDbSubjects(data || []);
  };

  const fetchGrades = async () => {
    const { data } = await supabase.from('grading_systems').select('*').eq('school_id', schoolConfig.id);
    setDbGrades(data || []);
  };

  const fetchMarks = async () => {
    const { data } = await supabase
      .from('marks')
      .select('*')
      .eq('student_id', selectedStudentId)
      .eq('year', selectedYear)
      .eq('term', selectedTerm);
    setDbMarks(data || []);
  };

  const fetchSchoolInfo = async () => {
    const { data } = await supabase
      .from('school_information')
      .select('*')
      .eq('school_id', schoolConfig.id)
      .single();
    if (data) setSchoolInfo(data);
  };

  const getGrade = (score) => {
    const scale = dbGrades.length > 0 ? dbGrades : [
      { grade: "EE", min_score: 80, label: "Exceeding Expectations" },
      { grade: "ME", min_score: 50, label: "Meeting Expectations" },
      { grade: "AE", min_score: 30, label: "Approaching Expectations" },
      { grade: "BE", min_score: 0, label: "Below Expectations" },
    ];
    const sorted = [...scale].sort((a, b) => b.min_score - a.min_score);
    for (const g of sorted) {
      if (score >= g.min_score) return g;
    }
    return { grade: "-", label: "" };
  };

  return (
    <div 
      className="grid-1"
      style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 16, height: "100%" }}
    >
      {/* Selection Panel */}
      <div style={{ background: "#fff", border: "1px solid #E8EAF0", borderRadius: 12, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div style={{ padding: "16px", borderBottom: "1px solid #E8EAF0" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1A1A2E", marginBottom: 12 }}>Report Generation</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 10, color: "#8A8FA8", fontWeight: 600, marginBottom: 4 }}>CLASS</div>
              <select value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)} style={{ width: "100%", padding: "8px", borderRadius: 6, border: "1px solid #E8EAF0", fontSize: 12, background: "#fff", outline: "none" }}>
                {currentTypeClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "#8A8FA8", fontWeight: 600, marginBottom: 4 }}>STREAM</div>
              <select value={selectedStream} onChange={(e) => setSelectedStream(e.target.value)} style={{ width: "100%", padding: "8px", borderRadius: 6, border: "1px solid #E8EAF0", fontSize: 12, background: "#fff", outline: "none" }}>
                <option value="A">A</option>
                <option value="B">B</option>
              </select>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 10, color: "#8A8FA8", fontWeight: 600, marginBottom: 4 }}>YEAR</div>
              <select value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))} style={{ width: "100%", padding: "8px", borderRadius: 6, border: "1px solid #E8EAF0", fontSize: 12, background: "#fff", outline: "none" }}>
                {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "#8A8FA8", fontWeight: 600, marginBottom: 4 }}>TERM</div>
              <select value={selectedTerm} onChange={(e) => setSelectedTerm(e.target.value)} style={{ width: "100%", padding: "8px", borderRadius: 6, border: "1px solid #E8EAF0", fontSize: 12, background: "#fff", outline: "none" }}>
                <option>Term 1</option>
                <option>Term 2</option>
                <option>Term 3</option>
              </select>
            </div>
          </div>
          <button style={{ width: "100%", padding: "10px", background: "#1B6B3A", color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
            Generate Bulk PDF
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "8px", maxHeight: "400px" }} className="sidebar-scroll">
          <div style={{ fontSize: 10, color: "#8A8FA8", fontWeight: 700, padding: "8px 8px 4px", textTransform: "uppercase" }}>Learners List ({students.length})</div>
          {students.map(s => (
            <div
              key={s.id}
              onClick={() => setSelectedStudentId(s.id)}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                cursor: "pointer",
                marginBottom: 2,
                fontSize: 12,
                background: selectedStudent?.id === s.id ? "#E8F5EE" : "transparent",
                color: selectedStudent?.id === s.id ? "#1B6B3A" : "#1A1A2E",
                fontWeight: selectedStudent?.id === s.id ? 700 : 500,
              }}
            >
              {s.first_name} {s.last_name}
              <div style={{ fontSize: 10, color: "#8A8FA8", fontWeight: 400 }}>{s.adm_no}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Preview Panel */}
      <div 
        className="main-scroll"
        style={{ background: "#fff", border: "1px solid #E8EAF0", borderRadius: 12, padding: "20px", overflowY: "auto", position: "relative", minHeight: 400 }}
      >
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 20 }}>
          <button style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #E8EAF0", background: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <span>🖨️</span> Print Report
          </button>
        </div>

        {selectedStudent ? (
          <div style={{ maxWidth: 700, margin: "0 auto", border: "1px solid #000", padding: "20px", position: "relative", background: "#fff" }}>
             {/* School Logo/Header Placeholder */}
            <div style={{ textAlign: "center", borderBottom: "2px solid #000", paddingBottom: 20, marginBottom: 20 }}>
              <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: 1 }}>{schoolConfig?.schoolName?.toUpperCase() || "INSTITUTION NAME"}</div>
              <div style={{ fontSize: 12, fontWeight: 700, marginTop: 4 }}>MOTTO: {schoolInfo?.motto?.toUpperCase() || "EDUCATION FOR EXCELLENCE"}</div>
              <div style={{ fontSize: 10, marginTop: 4 }}>EMAIL: {schoolConfig?.email} · TEL: {schoolConfig?.phone}</div>
              <div style={{ display: "inline-block", marginTop: 15, padding: "4px 16px", border: "2px solid #000", fontSize: 14, fontWeight: 900 }}>
                STUDENT PROGRESS REPORT
              </div>
            </div>

            <div 
              className="grid-1"
              style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20, fontSize: 13 }}
            >
              <div>
                <div style={{ marginBottom: 4 }}><b>NAME:</b> <span style={{ textDecoration: "underline" }}>{selectedStudent.first_name?.toUpperCase()} {selectedStudent.last_name?.toUpperCase()}</span></div>
                <div style={{ marginBottom: 4 }}><b>ADM NO:</b> <span style={{ textDecoration: "underline" }}>{selectedStudent.adm_no}</span></div>
                <div style={{ marginBottom: 4 }}><b>CLASS:</b> <span style={{ textDecoration: "underline" }}>{currentTypeClasses.find(c=>c.id===selectedStudent.level_id)?.name}</span></div>
              </div>
              <div style={{ textAlign: "right" }} className="mobile-text-left">
                <div style={{ marginBottom: 4 }}><b>TERM:</b> <span style={{ textDecoration: "underline" }}>{selectedTerm.toUpperCase()}</span></div>
                <div style={{ marginBottom: 4 }}><b>YEAR:</b> <span style={{ textDecoration: "underline" }}>{selectedYear}</span></div>
                <div style={{ marginBottom: 4 }}><b>DATE:</b> <span style={{ textDecoration: "underline" }}>{new Date().toLocaleDateString()}</span></div>
              </div>
            </div>

            <div className="table-container" style={{ margin: "0 0 20px" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#F0F2F5" }}>
                    <th style={{ border: "1px solid #000", padding: "8px", textAlign: "left", fontSize: 12 }}>SUBJECT</th>
                    <th style={{ border: "1px solid #000", padding: "8px", textAlign: "center", fontSize: 12 }}>CAT 1</th>
                    <th style={{ border: "1px solid #000", padding: "8px", textAlign: "center", fontSize: 12 }}>CAT 2</th>
                    <th style={{ border: "1px solid #000", padding: "8px", textAlign: "center", fontSize: 12 }}>EXAM</th>
                    <th style={{ border: "1px solid #000", padding: "8px", textAlign: "center", fontSize: 12 }}>GRADE</th>
                    <th style={{ border: "1px solid #000", padding: "8px", textAlign: "left", fontSize: 12 }} className="hide-mobile">REMARKS</th>
                  </tr>
                </thead>
                <tbody>
                  {dbSubjects.filter(sub => sub.level_category === selectedClass).map(sub => {
                    const studentMarks = dbMarks.filter(m => m.subject_id === sub.id);
                    // For now, average of all exams for this subject
                    const totalScore = studentMarks.length > 0 
                      ? studentMarks.reduce((acc, m) => acc + (m.score || 0), 0) / studentMarks.length
                      : 0;
                    const grade = getGrade(totalScore);
                    return (
                      <tr key={sub.id}>
                        <td style={{ border: "1px solid #000", padding: "8px", fontSize: 12 }}>{sub.name}</td>
                        <td style={{ border: "1px solid #000", padding: "8px", textAlign: "center", fontSize: 12 }}>{studentMarks[0]?.score || "-"}</td>
                        <td style={{ border: "1px solid #000", padding: "8px", textAlign: "center", fontSize: 12 }}>{studentMarks[1]?.score || "-"}</td>
                        <td style={{ border: "1px solid #000", padding: "8px", textAlign: "center", fontSize: 12 }}>{Math.round(totalScore)}</td>
                        <td style={{ border: "1px solid #000", padding: "8px", textAlign: "center", fontWeight: 700, fontSize: 12 }}>{grade.grade}</td>
                        <td style={{ border: "1px solid #000", padding: "8px", fontSize: 10 }} className="hide-mobile">{grade.remarks || grade.label}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ border: "1px solid #000", padding: "10px", marginBottom: 20 }}>
              <div style={{ fontWeight: 700, marginBottom: 5, fontSize: 12 }}>TEACHER'S REMARKS:</div>
              <div style={{ minHeight: 30, background: "#F9F9F9", fontSize: 12 }}>
                A very disciplined and hardworking student. Maintain the consistency.
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 40 }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ borderTop: "1px solid #000", paddingTop: 5, width: 100, fontSize: 11 }}>Class Teacher</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ borderTop: "1px solid #000", paddingTop: 5, width: 100, fontSize: 11 }}>Headteacher</div>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ textAlign: "center", marginTop: 60, color: "#8A8FA8" }}>
            <div style={{ fontSize: 40, marginBottom: 20 }}>📂</div>
            <div>Select a student to preview report card</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Reports;

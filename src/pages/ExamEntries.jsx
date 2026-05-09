import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';

const GRADES_BY_LEVEL = {
  "Pre-Primary": ["PP1", "PP2"],
  "Primary": ["Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6"],
  "Junior Secondary": ["Grade 7", "Grade 8", "Grade 9"],
  "Senior Secondary": ["Grade 10", "Grade 11", "Grade 12"]
};

const levelToSubjectKey = {
  "Pre-Primary": "ecde",
  "Primary": "upper_primary",
  "Junior Secondary": "jss",
  "Senior Secondary": "senior"
};

const ExamEntries = ({ schoolConfig, examsList, marksData, setMarksData }) => {
  const [students, setStudents] = useState([]);
  const [dbSubjects, setDbSubjects] = useState([]);
  const [dbGrades, setDbGrades] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  // Filters State
  const [entryLevel, setEntryLevel] = useState("Senior Secondary");
  const [entryGrade, setEntryGrade] = useState("Grade 10");
  const [entryStream, setEntryStream] = useState("A");
  const [entrySubject, setEntrySubject] = useState("");
  const [entryTerm, setEntryTerm] = useState("Term 1");

  const activeColor = "#cc785c";
  const labelStyle = { display: "block", fontSize: 11, fontWeight: 800, color: "#2a2421", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" };
  const inputStyle = { width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #e6dfd8", fontSize: 14, background: "#fff", outline: "none", transition: "all 0.2s ease" };

  useEffect(() => {
    if (schoolConfig?.id) {
      fetchSubjects();
      fetchGrades();
    }
  }, [schoolConfig?.id]);

  const fetchSubjects = async () => {
    const { data } = await supabase.from('subjects').select('*').eq('school_id', schoolConfig.id);
    setDbSubjects(data || []);
  };

  const fetchGrades = async () => {
    const { data } = await supabase.from('grading_systems').select('*').eq('school_id', schoolConfig.id);
    setDbGrades(data || []);
  };

  useEffect(() => {
    if (schoolConfig?.id) {
      fetchStudents();
      fetchMarks();
    }
  }, [entryGrade, entryStream, schoolConfig?.id]);

  const fetchStudents = async () => {
    const gradeIdMap = {
      "PP1": "pp1", "PP2": "pp2",
      "Grade 1": "p1", "Grade 2": "p2", "Grade 3": "p3", "Grade 4": "p4", "Grade 5": "p5", "Grade 6": "p6",
      "Grade 7": "g7", "Grade 8": "g8", "Grade 9": "g9",
      "Grade 10": "g10", "Grade 11": "g11", "Grade 12": "g12"
    };
    const gid = gradeIdMap[entryGrade];
    let query = supabase.from('students').select('*').eq('school_id', schoolConfig.id).eq('level_id', gid);
    if (entryStream !== "All") {
      // Find stream ID from name
      const { data: streamData } = await supabase.from('streams').select('id').eq('school_id', schoolConfig.id).eq('name', entryStream).single();
      if (streamData) query = query.eq('stream_id', streamData.id);
    }
    const { data } = await query;
    setStudents(data || []);
  };

  const fetchMarks = async () => {
    if (!entryExams.length) return;
    const { data } = await supabase
      .from('marks')
      .select('*')
      .in('exam_id', entryExams.map(e => e.id));
    
    const formatted = {};
    data?.forEach(m => {
      if (!formatted[m.student_id]) formatted[m.student_id] = {};
      formatted[m.student_id][m.exam_id] = m.score;
    });
    setMarksData(formatted);
  };

  const entryAvailableSubjects = useMemo(() => {
    const levelKey = entrySubjectKey === "ecde" ? "Pre-Primary" : entryLevel;
    return dbSubjects.filter(s => s.level_category === entryLevel).map(s => s.name);
  }, [dbSubjects, entryLevel]);

  const entryExams = useMemo(() => {
    return examsList.filter(e => 
      e.term === entryTerm
    );
  }, [examsList, entryTerm]);

  const entryStudents = students;

  const handleScoreChange = (studentId, examId, value) => {
    const val = parseInt(value) || 0;
    setMarksData(prev => ({
      ...prev,
      [studentId]: {
        ...(prev[studentId] || {}),
        [examId]: val
      }
    }));
  };

  const handleSaveMarks = async () => {
    setIsLoading(true);
    try {
      const gradeIdMap = {
        "PP1": "pp1", "PP2": "pp2",
        "Grade 1": "p1", "Grade 2": "p2", "Grade 3": "p3", "Grade 4": "p4", "Grade 5": "p5", "Grade 6": "p6",
        "Grade 7": "g7", "Grade 8": "g8", "Grade 9": "g9",
        "Grade 10": "g10", "Grade 11": "g11", "Grade 12": "g12"
      };
      const gid = gradeIdMap[entryGrade];

      const records = [];
      Object.keys(marksData).forEach(studentId => {
        Object.keys(marksData[studentId]).forEach(examId => {
          const exam = examsList.find(e => e.id === examId);
          records.push({
            student_id: studentId,
            exam_id: examId,
            score: marksData[studentId][examId],
            subject_id: dbSubjects.find(s => s.name === entrySubject)?.id || null,
            level_id: gid,
            term: exam?.term || entryTerm,
            year: exam?.year || new Date().getFullYear()
          });
        });
      });

      if (records.length === 0) return;

      const { error } = await supabase
        .from('marks')
        .upsert(records, { onConflict: 'exam_id,student_id,subject_id,level_id,term,year' });

      if (error) throw error;
      alert('Marks saved successfully!');
    } catch (err) {
      alert('Failed to save marks: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const getGrade = (score) => {
    const scale = dbGrades.length > 0 ? dbGrades : [
      { grade: "EE", min_score: 80, color: "#1B6B3A", bg: "#ebf5ee" },
      { grade: "ME", min_score: 50, color: "#2a2421", bg: "#f5f2eb" },
      { grade: "AE", min_score: 30, color: "#D35400", bg: "#FEF0E6" },
      { grade: "BE", min_score: 0, color: "#C0392B", bg: "#FCE8E8" },
    ];
    
    const sorted = [...scale].sort((a, b) => b.min_score - a.min_score);
    for (const g of sorted) {
      if (score >= g.min_score) return { code: g.grade, color: g.color || "#2a2421", bg: g.bg || "#fff" };
    }
    return { code: "-", color: "#8a8fa8", bg: "#fff" };
  };

  const navigateGrid = (e, studentIdx, examIdx, totalStudents, totalExams) => {
    let nextRow = studentIdx;
    let nextCol = examIdx;

    if (e.key === "ArrowUp") nextRow--;
    else if (e.key === "ArrowDown" || e.key === "Enter") nextRow++;
    else if (e.key === "ArrowLeft") nextCol--;
    else if (e.key === "ArrowRight") nextCol++;
    else return;

    if (nextRow >= 0 && nextRow < totalStudents && nextCol >= 0 && nextCol < totalExams) {
      e.preventDefault();
      const nextInput = document.getElementById(`cell-${nextRow}-${nextCol}`);
      if (nextInput) nextInput.focus();
    }
  };

  return (
    <div style={{ paddingBottom: 40 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
        {/* Page Header */}
        <div style={{ marginBottom: 8 }}>
          <h2 style={{ fontSize: 32, fontWeight: 700, color: "#2a2421", margin: 0, fontFamily: "'EB Garamond', serif" }}>Examination Marks Entry</h2>
          <p style={{ color: "#8a8fa8", marginTop: 4, fontSize: 16 }}>Enter and manage student marks for active examinations.</p>
        </div>

        {/* Filters Bar */}
        <div 
          style={{ 
            display: "grid", 
            gridTemplateColumns: "repeat(5, 1fr) auto", 
            gap: 12, 
            padding: "24px", 
            background: "#fff", 
            borderRadius: 12, 
            border: "1px solid #e6dfd8",
            alignItems: "flex-end",
            boxShadow: "0 1px 2px rgba(0,0,0,0.02)"
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={labelStyle}>Level</label>
            <select value={entryLevel} onChange={(e) => setEntryLevel(e.target.value)} style={inputStyle}>
              {Object.keys(GRADES_BY_LEVEL).map(lvl => <option key={lvl}>{lvl}</option>)}
            </select>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={labelStyle}>Grade</label>
            <select value={entryGrade} onChange={(e) => setEntryGrade(e.target.value)} style={inputStyle}>
              {GRADES_BY_LEVEL[entryLevel].map(g => <option key={g}>{g}</option>)}
            </select>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={labelStyle}>Stream</label>
            <select value={entryStream} onChange={(e) => setEntryStream(e.target.value)} style={inputStyle}>
              <option>All</option>
              <option>A</option>
              <option>B</option>
              <option>C</option>
            </select>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={labelStyle}>Term</label>
            <select value={entryTerm} onChange={(e) => setEntryTerm(e.target.value)} style={inputStyle}>
              <option>Term 1</option>
              <option>Term 2</option>
              <option>Term 3</option>
            </select>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={labelStyle}>Subject</label>
            <select value={entrySubject} onChange={(e) => setEntrySubject(e.target.value)} style={inputStyle}>
              {entryAvailableSubjects.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>

          <button 
            onClick={handleSaveMarks}
            disabled={isLoading}
            style={{ height: 42, padding: "0 28px", background: activeColor, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: isLoading ? "not-allowed" : "pointer", opacity: isLoading ? 0.7 : 1 }}
          >
            {isLoading ? "⌛ Saving..." : "💾 Save Marks"}
          </button>
        </div>

        {/* Marks Entry Spreadsheet */}
        <div className="table-container" style={{ 
          background: "#fff", 
          border: "1px solid #e6dfd8", 
          borderRadius: 12, 
          overflow: "hidden",
          boxShadow: "0 1px 2px rgba(0,0,0,0.02)"
        }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 13 }}>
            <thead style={{ background: "#fafafa", borderBottom: "1px solid #e6dfd8" }}>
              <tr>
                <th style={{ padding: "16px", borderRight: "1px solid #e6dfd8", width: 100, color: "#2a2421", fontWeight: 700 }}>ADM NO</th>
                <th style={{ padding: "16px", borderRight: "1px solid #e6dfd8", minWidth: 200, color: "#2a2421", fontWeight: 700 }}>STUDENT NAME</th>
                {entryExams.map(exam => (
                  <th key={exam.id} style={{ padding: "16px", borderRight: "1px solid #e6dfd8", textAlign: "center", width: 120 }}>
                    <div style={{ fontSize: 10, color: "#8a8fa8", textTransform: "uppercase", letterSpacing: "0.05em" }}>{exam.name}</div>
                    <div style={{ fontWeight: 700, color: "#2a2421" }}>Marks (%)</div>
                  </th>
                ))}
                <th style={{ padding: "16px", borderRight: "1px solid #e6dfd8", textAlign: "center", background: "#f5f2eb", width: 100, color: "#2a2421", fontWeight: 700 }}>AVG %</th>
                <th style={{ padding: "16px", textAlign: "center", background: "#f5f2eb", width: 100, color: "#2a2421", fontWeight: 700 }}>GRADE</th>
              </tr>
            </thead>
            <tbody>
              {entryStudents.map((s, sIdx) => {
                const studentMarks = marksData[s.id] || {};
                const total = entryExams.reduce((sum, exam) => sum + (parseInt(studentMarks[exam.id]) || 0) * (exam.weight / 100), 0);
                const grade = getGrade(total);

                return (
                  <tr key={s.id} style={{ borderBottom: "1px solid #e6dfd8", background: sIdx % 2 === 0 ? "#fff" : "#fafafa" }}>
                    <td style={{ padding: "12px 16px", borderRight: "1px solid #e6dfd8", fontWeight: 700, color: activeColor }}>{s.adm_no}</td>
                    <td style={{ padding: "12px 16px", borderRight: "1px solid #e6dfd8", fontWeight: 600, color: "#2a2421" }}>{s.first_name} {s.last_name}</td>
                    {entryExams.map((exam, eIdx) => (
                      <td key={exam.id} style={{ padding: "0", borderRight: "1px solid #e6dfd8" }}>
                        <input
                          id={`cell-${sIdx}-${eIdx}`}
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={studentMarks[exam.id] ?? ""}
                          onChange={(e) => handleScoreChange(s.id, exam.id, e.target.value)}
                          onKeyDown={(e) => navigateGrid(e, sIdx, eIdx, entryStudents.length, entryExams.length)}
                          style={{ 
                            width: "100%", 
                            height: "44px", 
                            border: "none", 
                            textAlign: "center", 
                            fontSize: 14, 
                            fontWeight: 700, 
                            outline: "none",
                            background: "transparent",
                            color: activeColor
                          }}
                          autoComplete="off"
                        />
                      </td>
                    ))}
                    <td style={{ padding: "12px 16px", borderRight: "1px solid #e6dfd8", textAlign: "center", background: "#f5f2eb", fontWeight: 700, color: "#2a2421" }}>{Math.round(total)}%</td>
                    <td style={{ padding: "12px 16px", textAlign: "center", background: grade.bg, color: grade.color, fontWeight: 700 }}>{grade.code}</td>
                  </tr>
                );
              })}
              {entryStudents.length === 0 && (
                <tr>
                  <td colSpan={entryExams.length + 4} style={{ padding: "40px", textAlign: "center", color: "#8a8fa8" }}>
                    No students found for this selection.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ExamEntries;

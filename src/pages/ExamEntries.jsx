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

const getGradeId = (gradeName) => {
  const gradeIdMap = {
    "PP1": "pp1", "PP2": "pp2",
    "Grade 1": "g1", "Grade 2": "g2", "Grade 3": "g3", "Grade 4": "g4", "Grade 5": "g5", "Grade 6": "g6",
    "Grade 7": "g7", "Grade 8": "g8", "Grade 9": "g9",
    "Grade 10": "g10", "Grade 11": "g11", "Grade 12": "g12"
  };
  return gradeIdMap[gradeName];
};

const ExamEntries = ({ schoolConfig, examsList, marksData, setMarksData }) => {
  const [students, setStudents] = useState([]);
  const [dbSubjects, setDbSubjects] = useState([]);
  const [dbGrades, setDbGrades] = useState([]);
  const [dbStreams, setDbStreams] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  // Filters State
  const [entryLevel, setEntryLevel] = useState("Senior Secondary");
  const [entryGrade, setEntryGrade] = useState("Grade 10");
  const [entryStream, setEntryStream] = useState("All");
  const [entrySubject, setEntrySubject] = useState("");
  const [entryTerm, setEntryTerm] = useState("Term 1");
  const [rowHeight, setRowHeight] = useState(28);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [totalDrafts, setTotalDrafts] = useState(0);
  // View mode
  const [viewMode, setViewMode] = useState("class"); // "class" or "student"
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentSearch, setStudentSearch] = useState("");
  const [studentViewMarks, setStudentViewMarks] = useState({}); // { subjectId: { examId: score } }
  const [svHasUnsaved, setSvHasUnsaved] = useState(false);

  const activeColor = "#D4AF37";
  const labelStyle = { display: "block", fontSize: 10, fontWeight: 800, color: "#2a2421", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" };
  const inputStyle = { width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid #e6dfd8", fontSize: 13, background: "#fff", outline: "none", transition: "all 0.2s ease" };

  useEffect(() => {
    if (schoolConfig?.id) {
      fetchSubjects();
      fetchGrades();
      fetchStreams();
    }
  }, [schoolConfig?.id]);

  const fetchStreams = async () => {
    const { data } = await supabase.from('streams').select('*').eq('school_id', schoolConfig.id);
    setDbStreams(data || []);
  };

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
    }
  }, [entryGrade, entryStream, schoolConfig?.id]);

  useEffect(() => {
    if (schoolConfig?.id && entrySubject && viewMode === "class") {
      fetchMarks();
    }
  }, [entryGrade, entryStream, entrySubject, entryTerm, schoolConfig?.id, viewMode]);

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasUnsavedChanges || svHasUnsaved) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges, svHasUnsaved]);

  const checkAllDrafts = () => {
    if (!schoolConfig?.id) return;
    const keys = Object.keys(localStorage);
    const draftKeys = keys.filter(k => k.startsWith(`marks_draft_${schoolConfig.id}_`));
    setTotalDrafts(draftKeys.length);
  };

  useEffect(() => {
    checkAllDrafts();
  }, [schoolConfig?.id, hasUnsavedChanges]);

  const fetchStudents = async () => {
    const gid = getGradeId(entryGrade);
    let query = supabase.from('students').select('*').eq('school_id', schoolConfig.id).eq('level_id', gid);
    if (entryStream !== "All") {
      query = query.eq('stream_id', entryStream);
    }
    const { data } = await query;
    setStudents(data || []);
  };

  const fetchMarks = async () => {
    if (!entryExams.length || !entrySubject) return;
    
    const subject = dbSubjects.find(s => s.name === entrySubject);
    if (!subject) return;

    const { data } = await supabase
      .from('marks')
      .select('*')
      .in('exam_id', entryExams.map(e => e.id))
      .eq('subject_id', subject.id);
    
    let formatted = {};
    data?.forEach(m => {
      if (!formatted[m.student_id]) formatted[m.student_id] = {};
      formatted[m.student_id][m.exam_id] = m.score;
    });

    if (schoolConfig?.id) {
      const cacheKey = `marks_draft_${schoolConfig.id}_${entryGrade}_${entryTerm}_${subject.id}`;
      const draft = localStorage.getItem(cacheKey);
      if (draft) {
        try {
          const parsedDraft = JSON.parse(draft);
          Object.keys(parsedDraft).forEach(studentId => {
            if (!formatted[studentId]) formatted[studentId] = {};
            formatted[studentId] = { ...formatted[studentId], ...parsedDraft[studentId] };
          });
          setHasUnsavedChanges(true);
        } catch(e) {
          console.error("Failed to parse draft marks", e);
        }
      } else {
        setHasUnsavedChanges(false);
      }
    }

    setMarksData(formatted);
  };

  const entryAvailableSubjects = useMemo(() => {
    const gid = getGradeId(entryGrade);
    return dbSubjects.filter(s => s.level_category === gid).map(s => s.name);
  }, [dbSubjects, entryGrade]);

  useEffect(() => {
    if (entryAvailableSubjects.length > 0 && !entryAvailableSubjects.includes(entrySubject)) {
      setEntrySubject(entryAvailableSubjects[0]);
    } else if (entryAvailableSubjects.length === 0) {
      setEntrySubject("");
    }
  }, [entryAvailableSubjects]);

  const entryExams = useMemo(() => {
    const gid = getGradeId(entryGrade);
    return examsList.filter(e => 
      e.term === entryTerm && e.level_id === gid
    );
  }, [examsList, entryTerm, entryGrade]);

  const entryStudents = students;

  const handleScoreChange = (studentId, examId, value) => {
    const val = parseInt(value) || 0;
    setMarksData(prev => {
      const next = {
        ...prev,
        [studentId]: {
          ...(prev[studentId] || {}),
          [examId]: val
        }
      };
      
      const subject = dbSubjects.find(s => s.name === entrySubject);
      if (schoolConfig?.id && subject) {
        const cacheKey = `marks_draft_${schoolConfig.id}_${entryGrade}_${entryTerm}_${subject.id}`;
        localStorage.setItem(cacheKey, JSON.stringify(next));
      }
      
      return next;
    });
    setHasUnsavedChanges(true);
  };

  const handleSaveMarks = async () => {
    setIsLoading(true);
    try {
      const gid = getGradeId(entryGrade);

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
      
      // Clear draft
      const subject = dbSubjects.find(s => s.name === entrySubject);
      if (schoolConfig?.id && subject) {
        const cacheKey = `marks_draft_${schoolConfig.id}_${entryGrade}_${entryTerm}_${subject.id}`;
        localStorage.removeItem(cacheKey);
      }
      setHasUnsavedChanges(false);

      alert('Marks saved successfully!');
    } catch (err) {
      alert('Failed to save marks: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const getGrade = (score) => {
    const gid = getGradeId(entryGrade);

    // Filter scale for specific grade first, then fall back to level
    let scale = dbGrades.filter(g => g.level_group === gid);
    if (scale.length === 0) {
      scale = dbGrades.filter(g => g.level_group === entryLevel);
    }

    if (scale.length === 0) {
      scale = [
        { grade: "EE", min_score: 80, color: "#1B6B3A", bg: "#ebf5ee" },
        { grade: "ME", min_score: 50, color: "#2a2421", bg: "#f5f2eb" },
        { grade: "AE", min_score: 30, color: "#D35400", bg: "#FEF0E6" },
        { grade: "BE", min_score: 0, color: "#C0392B", bg: "#FCE8E8" },
      ];
    }
    
    const sorted = [...scale].sort((a, b) => b.min_score - a.min_score);
    for (const g of sorted) {
      if (score >= g.min_score) return { code: g.grade, color: g.color || "#2a2421", bg: g.bg || "#fff" };
    }
    return { code: "-", color: "#8a8fa8", bg: "#fff" };
  };

  // === STUDENT VIEW LOGIC ===
  const svSubjects = useMemo(() => {
    const gid = getGradeId(entryGrade);
    return dbSubjects.filter(s => s.level_category === gid);
  }, [dbSubjects, entryGrade]);

  const svFilteredStudents = useMemo(() => {
    if (!studentSearch) return students;
    const q = studentSearch.toLowerCase();
    return students.filter(s =>
      s.adm_no?.toString().includes(q) ||
      `${s.first_name} ${s.last_name}`.toLowerCase().includes(q)
    );
  }, [students, studentSearch]);

  const fetchStudentViewMarks = async (student) => {
    if (!student || !entryExams.length || !svSubjects.length) return;
    const { data } = await supabase
      .from('marks')
      .select('*')
      .eq('student_id', student.id)
      .in('exam_id', entryExams.map(e => e.id))
      .in('subject_id', svSubjects.map(s => s.id));

    const formatted = {};
    data?.forEach(m => {
      if (!formatted[m.subject_id]) formatted[m.subject_id] = {};
      formatted[m.subject_id][m.exam_id] = m.score;
    });

    // Load draft
    if (schoolConfig?.id) {
      const cacheKey = `sv_draft_${schoolConfig.id}_${entryGrade}_${entryTerm}_${student.id}`;
      const draft = localStorage.getItem(cacheKey);
      if (draft) {
        try {
          const parsed = JSON.parse(draft);
          Object.keys(parsed).forEach(subId => {
            if (!formatted[subId]) formatted[subId] = {};
            formatted[subId] = { ...formatted[subId], ...parsed[subId] };
          });
          setSvHasUnsaved(true);
        } catch (e) { console.error(e); }
      } else {
        setSvHasUnsaved(false);
      }
    }
    setStudentViewMarks(formatted);
  };

  useEffect(() => {
    if (viewMode === "student" && selectedStudent && entryExams.length) {
      fetchStudentViewMarks(selectedStudent);
    }
  }, [selectedStudent, entryExams, svSubjects, viewMode]);

  const handleSvScoreChange = (subjectId, examId, value) => {
    const val = parseInt(value) || 0;
    setStudentViewMarks(prev => {
      const next = {
        ...prev,
        [subjectId]: { ...(prev[subjectId] || {}), [examId]: val }
      };
      if (schoolConfig?.id && selectedStudent) {
        const cacheKey = `sv_draft_${schoolConfig.id}_${entryGrade}_${entryTerm}_${selectedStudent.id}`;
        localStorage.setItem(cacheKey, JSON.stringify(next));
      }
      return next;
    });
    setSvHasUnsaved(true);
  };

  const handleSvSave = async () => {
    setIsLoading(true);
    try {
      const gid = getGradeId(entryGrade);
      const records = [];
      Object.keys(studentViewMarks).forEach(subjectId => {
        Object.keys(studentViewMarks[subjectId]).forEach(examId => {
          const exam = examsList.find(e => e.id === examId);
          records.push({
            student_id: selectedStudent.id,
            exam_id: examId,
            score: studentViewMarks[subjectId][examId],
            subject_id: subjectId,
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
      if (schoolConfig?.id && selectedStudent) {
        const cacheKey = `sv_draft_${schoolConfig.id}_${entryGrade}_${entryTerm}_${selectedStudent.id}`;
        localStorage.removeItem(cacheKey);
      }
      setSvHasUnsaved(false);
      checkAllDrafts();
      alert('Marks saved successfully!');
    } catch (err) {
      alert('Failed to save marks: ' + err.message);
    } finally {
      setIsLoading(false);
    }
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
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {totalDrafts > 0 && (
          <div style={{ 
            background: "#FFF4E5", 
            border: "1px solid #FFB020", 
            padding: "10px 16px", 
            borderRadius: 8, 
            display: "flex", 
            alignItems: "center", 
            justifyContent: "space-between",
            boxShadow: "0 2px 4px rgba(255,176,32,0.1)"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 18 }}>⚠️</span>
              <span style={{ fontSize: 13, color: "#BF6A02", fontWeight: 700 }}>
                You have {totalDrafts} unsaved {totalDrafts === 1 ? 'class' : 'classes'} waiting to be synced to the cloud. 
                <span style={{ fontWeight: 400, marginLeft: 4 }}>Please sync them before closing your session.</span>
              </span>
            </div>
          </div>
        )}

        {/* View Mode Toggle */}
        <div className="ee-toggle" style={{ display: "flex", gap: 0, borderRadius: 8, overflow: "hidden", border: "1px solid #e6dfd8", alignSelf: "flex-start" }}>
          <button onClick={() => setViewMode("class")} style={{
            padding: "8px 20px", fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer",
            background: viewMode === "class" ? activeColor : "#fff", color: viewMode === "class" ? "#fff" : "#2a2421",
            transition: "all 0.2s ease"
          }}>📋 Class View</button>
          <button onClick={() => setViewMode("student")} style={{
            padding: "8px 20px", fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer", borderLeft: "1px solid #e6dfd8",
            background: viewMode === "student" ? activeColor : "#fff", color: viewMode === "student" ? "#fff" : "#2a2421",
            transition: "all 0.2s ease"
          }}>👤 Student View</button>
        </div>

        {viewMode === "class" && (<>
        {/* Filters Bar */}
        <div className="ee-filters-class" style={{ 
          display: "grid", gridTemplateColumns: "repeat(5, 1fr) auto", gap: 10, padding: "16px 20px",
          background: "#fff", borderRadius: 12, border: "1px solid #e6dfd8", alignItems: "flex-end",
          boxShadow: "0 10px 25px -5px rgba(0,0,0,0.05), 0 8px 10px -6px rgba(0,0,0,0.01)"
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={labelStyle}>Level</label>
            <select value={entryLevel} onChange={(e) => {
              setEntryLevel(e.target.value);
              setEntryGrade(GRADES_BY_LEVEL[e.target.value][0]);
            }} style={inputStyle}>
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
              <option value="All">All Streams</option>
              {dbStreams.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
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
            disabled={isLoading || !hasUnsavedChanges}
            style={{ 
              height: 36, 
              padding: "0 24px", 
              background: hasUnsavedChanges ? "#D35400" : "#2a2421", 
              color: "#fff", 
              border: "none", 
              borderRadius: 8, 
              fontSize: 12, 
              fontWeight: 700, 
              cursor: (isLoading || !hasUnsavedChanges) ? "not-allowed" : "pointer", 
              opacity: (isLoading || !hasUnsavedChanges) ? 0.7 : 1, 
              transition: "all 0.2s ease",
              boxShadow: hasUnsavedChanges ? "0 4px 12px rgba(211,84,0,0.3)" : "none"
            }}
          >
            {isLoading ? "⌛ Saving..." : (hasUnsavedChanges ? "⚠️ Sync to Cloud" : "✓ All Synced")}
          </button>
        </div>

        {/* Toolbar */}
        <div className="ee-toolbar" style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12, padding: "0 4px", marginTop: -4 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "#8a8fa8", textTransform: "uppercase", letterSpacing: "0.05em" }}>Row Spacing</label>
          <input 
            type="range" 
            min="24" 
            max="56" 
            value={rowHeight} 
            onChange={(e) => setRowHeight(parseInt(e.target.value))}
            style={{ width: 120, height: 4, cursor: "pointer", accentColor: activeColor, padding: 0 }}
          />
        </div>

        {/* Marks Entry Spreadsheet */}
        <div className="table-container" style={{ 
          background: "#fff", 
          border: "1px solid #e6dfd8", 
          borderRadius: 12, 
          overflow: "hidden",
          boxShadow: "0 10px 25px -5px rgba(0,0,0,0.05)"
        }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 13 }}>
            <thead style={{ background: "#fafafa", borderBottom: "1px solid #e6dfd8" }}>
              <tr>
                <th className="sticky-col sticky-left-0" style={{ padding: "8px 12px", borderRight: "1px solid #e6dfd8", width: 80, color: "#2a2421", fontWeight: 700 }}>ADM NO</th>
                <th className="sticky-col sticky-left-1" style={{ padding: "8px 12px", borderRight: "1px solid #e6dfd8", minWidth: 150, color: "#2a2421", fontWeight: 700 }}>STUDENT NAME</th>
                {entryExams.map(exam => (
                  <th key={exam.id} style={{ padding: "8px 12px", borderRight: "1px solid #e6dfd8", textAlign: "center", width: 120 }}>
                    <div style={{ fontSize: 10, color: "#8a8fa8", textTransform: "uppercase", letterSpacing: "0.05em" }}>{exam.name}</div>
                    <div style={{ fontWeight: 700, color: "#2a2421" }}>Marks (%)</div>
                  </th>
                ))}
                <th style={{ padding: "8px 12px", borderRight: "1px solid #e6dfd8", textAlign: "center", background: "#f5f2eb", width: 100, color: "#2a2421", fontWeight: 700 }}>AVG %</th>
                <th style={{ padding: "8px 12px", textAlign: "center", background: "#f5f2eb", width: 100, color: "#2a2421", fontWeight: 700 }}>GRADE</th>
              </tr>
            </thead>
            <tbody>
              {entryStudents.map((s, sIdx) => {
                const studentMarks = marksData[s.id] || {};
                const total = entryExams.reduce((sum, exam) => sum + (parseInt(studentMarks[exam.id]) || 0) * (exam.weight / 100), 0);
                const grade = getGrade(total);

                return (
                  <tr key={s.id} style={{ borderBottom: "1px solid #e6dfd8", background: sIdx % 2 === 0 ? "#fff" : "#fafafa" }}>
                    <td className="sticky-col sticky-left-0" style={{ padding: "4px 12px", borderRight: "1px solid #e6dfd8", fontWeight: 700, color: activeColor }}>{s.adm_no}</td>
                    <td className="sticky-col sticky-left-1" style={{ padding: "4px 12px", borderRight: "1px solid #e6dfd8", fontWeight: 600, color: "#2a2421" }}>{s.first_name} {s.last_name}</td>
                    {entryExams.map((exam, eIdx) => (
                      <td key={exam.id} style={{ padding: "0", borderRight: "1px solid #e6dfd8" }}>
                        <input
                          id={`cell-${sIdx}-${eIdx}`}
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          className="marks-input"
                          value={studentMarks[exam.id] ?? ""}
                          onChange={(e) => handleScoreChange(s.id, exam.id, e.target.value)}
                          onKeyDown={(e) => navigateGrid(e, sIdx, eIdx, entryStudents.length, entryExams.length)}
                          style={{ 
                            width: "100%", 
                            height: `${rowHeight}px`, 
                            border: "none", 
                            padding: "0 8px",
                            margin: 0,
                            boxSizing: "border-box",
                            textAlign: "center", 
                            fontSize: 13, 
                            fontWeight: 700, 
                            outline: "none",
                            background: "transparent",
                            color: activeColor
                          }}
                          autoComplete="off"
                        />
                      </td>
                    ))}
                    <td style={{ padding: "4px 12px", borderRight: "1px solid #e6dfd8", textAlign: "center", background: "#f5f2eb", fontWeight: 700, color: "#2a2421" }}>{Math.round(total)}%</td>
                    <td style={{ padding: "4px 12px", textAlign: "center", background: grade.bg, color: grade.color, fontWeight: 700 }}>{grade.code}</td>
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
        </>)}

        {/* === STUDENT VIEW === */}
        {viewMode === "student" && (<>
        {/* Student View Filters */}
        <div className="ee-filters-student" style={{
          display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 10, padding: "16px 20px",
          background: "#fff", borderRadius: 12, border: "1px solid #e6dfd8", alignItems: "flex-end",
          boxShadow: "0 10px 25px -5px rgba(0,0,0,0.05)"
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={labelStyle}>Level</label>
            <select value={entryLevel} onChange={(e) => { setEntryLevel(e.target.value); setEntryGrade(GRADES_BY_LEVEL[e.target.value][0]); setSelectedStudent(null); }} style={inputStyle}>
              {Object.keys(GRADES_BY_LEVEL).map(lvl => <option key={lvl}>{lvl}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={labelStyle}>Grade</label>
            <select value={entryGrade} onChange={(e) => { setEntryGrade(e.target.value); setSelectedStudent(null); }} style={inputStyle}>
              {GRADES_BY_LEVEL[entryLevel].map(g => <option key={g}>{g}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={labelStyle}>Term</label>
            <select value={entryTerm} onChange={(e) => { setEntryTerm(e.target.value); setSelectedStudent(null); }} style={inputStyle}>
              <option>Term 1</option><option>Term 2</option><option>Term 3</option>
            </select>
          </div>
          <button onClick={handleSvSave} disabled={isLoading || !svHasUnsaved}
            style={{
              height: 36, padding: "0 24px", background: svHasUnsaved ? "#D35400" : "#2a2421",
              color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700,
              cursor: (isLoading || !svHasUnsaved) ? "not-allowed" : "pointer",
              opacity: (isLoading || !svHasUnsaved) ? 0.7 : 1, transition: "all 0.2s ease",
              boxShadow: svHasUnsaved ? "0 4px 12px rgba(211,84,0,0.3)" : "none"
            }}
          >
            {isLoading ? "⌛ Saving..." : (svHasUnsaved ? "⚠️ Sync to Cloud" : "✓ All Synced")}
          </button>
        </div>

        {/* Student Selector */}
        <div style={{
          background: "#fff", borderRadius: 12, border: "1px solid #e6dfd8", padding: "16px 20px",
          boxShadow: "0 10px 25px -5px rgba(0,0,0,0.05)"
        }}>
          <label style={labelStyle}>Search Student (ADM No or Name)</label>
            <div className="ee-student-search" style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input
              type="text" placeholder="Type ADM number or student name..."
              value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)}
              style={{ ...inputStyle, flex: 1 }}
            />
            <select
              value={selectedStudent?.id || ""}
              onChange={(e) => {
                const s = students.find(st => st.id === e.target.value);
                setSelectedStudent(s || null);
              }}
              style={{ ...inputStyle, flex: 1 }}
            >
              <option value="">— Select Student —</option>
              {svFilteredStudents.map(s => (
                <option key={s.id} value={s.id}>{s.adm_no} — {s.first_name} {s.last_name}</option>
              ))}
            </select>
          </div>
          {selectedStudent && (
            <div className="ee-student-info" style={{ marginTop: 12, display: "flex", gap: 24, fontSize: 13, color: "#2a2421" }}>
              <span><strong>ADM:</strong> {selectedStudent.adm_no}</span>
              <span><strong>Name:</strong> {selectedStudent.first_name} {selectedStudent.last_name}</span>
              <span><strong>Grade:</strong> {entryGrade}</span>
            </div>
          )}
        </div>

        {/* Student Marks Grid (rows=subjects, cols=exams) */}
        {selectedStudent && (
        <div className="table-container" style={{
          background: "#fff", border: "1px solid #e6dfd8", borderRadius: 12, overflow: "hidden",
          boxShadow: "0 10px 25px -5px rgba(0,0,0,0.05)"
        }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 13 }}>
            <thead style={{ background: "#fafafa", borderBottom: "1px solid #e6dfd8" }}>
              <tr>
                <th className="sticky-col sticky-left-0" style={{ padding: "8px 12px", borderRight: "1px solid #e6dfd8", minWidth: 150, color: "#2a2421", fontWeight: 700 }}>SUBJECT</th>
                {entryExams.map(exam => (
                  <th key={exam.id} style={{ padding: "8px 12px", borderRight: "1px solid #e6dfd8", textAlign: "center", width: 120 }}>
                    <div style={{ fontSize: 10, color: "#8a8fa8", textTransform: "uppercase" }}>{exam.name}</div>
                    <div style={{ fontWeight: 700, color: "#2a2421" }}>Marks (%)</div>
                  </th>
                ))}
                <th style={{ padding: "8px 12px", textAlign: "center", background: "#f5f2eb", width: 100, fontWeight: 700 }}>AVG %</th>
              </tr>
            </thead>
            <tbody>
              {svSubjects.map((sub, sIdx) => {
                const subMarks = studentViewMarks[sub.id] || {};
                const total = entryExams.reduce((sum, ex) => sum + (parseInt(subMarks[ex.id]) || 0) * (ex.weight / 100), 0);
                return (
                  <tr key={sub.id} style={{ borderBottom: "1px solid #e6dfd8", background: sIdx % 2 === 0 ? "#fff" : "#fafafa" }}>
                    <td className="sticky-col sticky-left-0" style={{ padding: "4px 12px", borderRight: "1px solid #e6dfd8", fontWeight: 600, color: "#2a2421" }}>{sub.name}</td>
                    {entryExams.map((exam, eIdx) => (
                      <td key={exam.id} style={{ padding: "0", borderRight: "1px solid #e6dfd8" }}>
                        <input
                          id={`sv-${sIdx}-${eIdx}`}
                          type="text" inputMode="numeric" pattern="[0-9]*" className="marks-input"
                          value={subMarks[exam.id] ?? ""}
                          onChange={(e) => handleSvScoreChange(sub.id, exam.id, e.target.value)}
                          onKeyDown={(e) => navigateGrid(e, sIdx, eIdx, svSubjects.length, entryExams.length)}
                          style={{
                            width: "100%", height: `${rowHeight}px`, border: "none", padding: "0 8px",
                            margin: 0, boxSizing: "border-box", textAlign: "center", fontSize: 13,
                            fontWeight: 700, outline: "none", background: "transparent", color: activeColor
                          }}
                          autoComplete="off"
                        />
                      </td>
                    ))}
                    <td style={{ padding: "4px 12px", textAlign: "center", background: "#f5f2eb", fontWeight: 700 }}>{Math.round(total)}%</td>
                  </tr>
                );
              })}
              {svSubjects.length === 0 && (
                <tr><td colSpan={entryExams.length + 2} style={{ padding: "40px", textAlign: "center", color: "#8a8fa8" }}>No subjects found for this grade.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        )}
        </>)}

      </div>
    </div>
  );
};

export default ExamEntries;

import React, { useState, useEffect, useMemo } from 'react';
import { STUDENTS, CLASSES, SUBJECTS_BY_LEVEL, ACADEMIC_GRADES, COMPETENCY_GRADES } from '../data/mockData';

const getGradeLevel = (classId) => {
  if (classId.startsWith("pg") || classId.startsWith("pp")) return "ecde";
  const gradeNum = parseInt(classId.replace("g", ""));
  if (gradeNum >= 1 && gradeNum <= 3) return "lower_primary";
  if (gradeNum >= 4 && gradeNum <= 6) return "upper_primary";
  if (gradeNum >= 7 && gradeNum <= 9) return "jss";
  if (gradeNum >= 10) return "senior";
  return "upper_primary";
};

const Exams = () => {
  // Tab State: 'listings' | 'options' | 'entry'
  const [activeTab, setActiveTab] = useState("listings");

  // --- Exam Listings State ---
  const [examsList, setExamsList] = useState([
    { id: "e1", name: "Term 1 Opener Exam", term: "Term 1", levels: "All Phases", status: "Completed", date: "2026-01-10" },
    { id: "e2", name: "Term 1 Mid-Term", term: "Term 1", levels: "JSS & Senior", status: "Ongoing", date: "2026-02-15" },
    { id: "e3", name: "Term 1 End of Term", term: "Term 1", levels: "All Phases", status: "Upcoming", date: "2026-04-02" },
  ]);
  const [newExam, setNewExam] = useState({ name: "", term: "Term 1", levels: "All Phases", status: "Upcoming", date: "" });

  // --- Exam Options State ---
  const [examOptions, setExamOptions] = useState({
    weighting: { cat1: 30, cat2: 30, endterm: 40 },
    maxMarks: 100,
    gradingScale: "cbc_standard" // cbc_standard | kcse_standard
  });

  const [selectedClass, setSelectedClass] = useState("g6");
  const [selectedStream, setSelectedStream] = useState("A");
  const [selectedSubject, setSelectedSubject] = useState("");
  const [selectedTerm, setSelectedTerm] = useState("Term 1");
  const [marksData, setMarksData] = useState({}); // { studentId: { examId: score } }


  const gradeLevel = getGradeLevel(selectedClass);
  const availableSubjects = useMemo(() => SUBJECTS_BY_LEVEL[gradeLevel] || [], [gradeLevel]);
  
  // Set initial subject when class changes or if not set
  useEffect(() => {
    if (availableSubjects.length > 0 && (!selectedSubject || !availableSubjects.includes(selectedSubject))) {
      setSelectedSubject(availableSubjects[0]);
    }
  }, [availableSubjects, selectedSubject]); // eslint-disable-line react-hooks/exhaustive-deps

  const students = STUDENTS.filter(s => s.gradeId === selectedClass && s.stream === selectedStream);

  const getGrade = (score, level) => {
    const scale = level === "senior" ? ACADEMIC_GRADES : COMPETENCY_GRADES;
    for (const g of scale) {
      if (score >= g.min) return g;
    }
    return scale[scale.length - 1];
  };

  // --- Excel Grid Logic ---
  const termExams = useMemo(() => 
    examsList.filter(e => e.term === selectedTerm), 
    [examsList, selectedTerm]
  );

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

  const handleAddExam = () => {
    if (!newExam.name.trim()) return;
    setExamsList(prev => [...prev, { id: `e${Date.now()}`, ...newExam }]);
    setNewExam({ name: "", term: "Term 1", levels: "All Phases", status: "Upcoming", date: "" });
  };

  const removeExam = (id) => setExamsList(prev => prev.filter(e => e.id !== id));

  // Shared Styles
  const labelStyle = { display: "block", fontSize: 12, fontWeight: 700, color: "#4A4A6A", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.02em" };
  const inputStyle = { width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid #E8EAF0", fontSize: 13.5, background: "#fff", outline: "none", transition: "border-color 0.2s" };
  const sectionCardStyle = { background: "#fff", borderRadius: 16, border: "1px solid #E8EAF0", padding: "24px", boxShadow: "0 2px 10px rgba(0,0,0,0.02)" };

  return (
    <div style={{ paddingBottom: 40 }}>
      {/* Internal Navigation Tabs (Pills) */}
      <div style={{ display: "flex", gap: 12, marginBottom: 28 }}>
        {[
          { id: "listings", label: "Exam Listings", icon: "📅" },
          { id: "options", label: "Exam Options", icon: "⚙️" },
          { id: "entry", label: "Examination Entry", icon: "✍️" },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: "10px 24px",
              background: activeTab === tab.id ? "#1B6B3A" : "#EBF3FB",
              color: activeTab === tab.id ? "#fff" : "#1B6B3A",
              border: "none",
              borderRadius: 30,
              fontSize: 13.5,
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
              transition: "all 0.2s ease",
              boxShadow: activeTab === tab.id ? "0 4px 12px rgba(27,107,58,0.2)" : "none"
            }}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* 1. EXAM LISTINGS TAB */}
      {activeTab === "listings" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {/* Add Exam Form */}
          <section style={sectionCardStyle}>
            <h4 style={{ margin: "0 0 20px", fontSize: 16, color: "#1A1A2E", fontWeight: 800 }}>Create New Examination</h4>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, alignItems: "flex-end" }}>
              <div>
                <label style={labelStyle}>Exam Name</label>
                <input type="text" placeholder="e.g. End Term 1 Exam" value={newExam.name} onChange={(e) => setNewExam({...newExam, name: e.target.value})} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Term</label>
                <select value={newExam.term} onChange={(e) => setNewExam({...newExam, term: e.target.value})} style={inputStyle}>
                  <option>Term 1</option>
                  <option>Term 2</option>
                  <option>Term 3</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Target Levels</label>
                <select value={newExam.levels} onChange={(e) => setNewExam({...newExam, levels: e.target.value})} style={inputStyle}>
                  <option>All Phases</option>
                  <option>Pre-Primary</option>
                  <option>Primary</option>
                  <option>Junior Secondary</option>
                  <option>Senior Secondary</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Start Date</label>
                <input type="date" value={newExam.date} onChange={(e) => setNewExam({...newExam, date: e.target.value})} style={inputStyle} />
              </div>
              <button 
                onClick={handleAddExam}
                style={{ height: 42, padding: "0 24px", background: "#1B6B3A", color: "#fff", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", transition: "all 0.2s" }}
              >+ Register Exam</button>
            </div>
          </section>

          {/* Exams Roster */}
          <section style={sectionCardStyle}>
            <h4 style={{ margin: "0 0 16px", fontSize: 16, color: "#1A1A2E", fontWeight: 800 }}>Active Examinations</h4>
            <div style={{ borderRadius: 12, border: "1px solid #E8EAF0", overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
                <thead style={{ background: "#F8FAFC", borderBottom: "2px solid #E8EAF0" }}>
                  <tr>
                    <th style={{ padding: "14px 18px", textAlign: "left", color: "#8A8FA8", fontSize: 11, fontWeight: 700 }}>EXAM NAME</th>
                    <th style={{ padding: "14px 18px", textAlign: "left", color: "#8A8FA8", fontSize: 11, fontWeight: 700 }}>TERM</th>
                    <th style={{ padding: "14px 18px", textAlign: "left", color: "#8A8FA8", fontSize: 11, fontWeight: 700 }}>PHASES</th>
                    <th style={{ padding: "14px 18px", textAlign: "center", color: "#8A8FA8", fontSize: 11, fontWeight: 700 }}>STATUS</th>
                    <th style={{ padding: "14px 18px", textAlign: "center", color: "#8A8FA8", fontSize: 11, fontWeight: 700 }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {examsList.map((exam, idx) => (
                    <tr key={exam.id} style={{ borderBottom: "1px solid #F0F2F5", background: idx % 2 === 0 ? "#fff" : "#FAFBFC" }}>
                      <td style={{ padding: "14px 18px" }}>
                        <div style={{ fontWeight: 700, color: "#1A1A2E" }}>{exam.name}</div>
                        <div style={{ fontSize: 11, color: "#8A8FA8", marginTop: 2 }}>Starts: {exam.date || "TBD"}</div>
                      </td>
                      <td style={{ padding: "14px 18px", color: "#4A4A6A", fontWeight: 600 }}>{exam.term}</td>
                      <td style={{ padding: "14px 18px" }}>
                        <span style={{ fontSize: 12, padding: "3px 8px", background: "#EBF3FB", color: "#1A5F9C", borderRadius: 6, fontWeight: 600 }}>{exam.levels}</span>
                      </td>
                      <td style={{ padding: "14px 18px", textAlign: "center" }}>
                        <span style={{ 
                          padding: "4px 12px", borderRadius: 12, fontSize: 11, fontWeight: 700,
                          background: exam.status === "Published" || exam.status === "Completed" ? "#E8F5EE" : exam.status === "Ongoing" ? "#FFF9E6" : "#F4F5F7",
                          color: exam.status === "Published" || exam.status === "Completed" ? "#1B6B3A" : exam.status === "Ongoing" ? "#D97706" : "#8A8FA8"
                        }}>{exam.status}</span>
                      </td>
                      <td style={{ padding: "14px 18px", textAlign: "center" }}>
                        <button onClick={() => removeExam(exam.id)} style={{ background: "none", border: "none", cursor: "pointer", opacity: 0.6 }} title="Delete">🗑️</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* 2. EXAM OPTIONS TAB */}
      {activeTab === "options" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          <section style={sectionCardStyle}>
            <h4 style={{ margin: "0 0 20px", fontSize: 16, color: "#1A1A2E", fontWeight: 800 }}>Weighting & Calculations</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div>
                <label style={labelStyle}>End Term Weight (%)</label>
                <input 
                  type="number" 
                  value={examOptions.weighting.endterm} 
                  onChange={(e) => setExamOptions({...examOptions, weighting: {...examOptions.weighting, endterm: parseInt(e.target.value) || 0}})}
                  style={inputStyle} 
                />
                <p style={{ fontSize: 11, color: "#8A8FA8", marginTop: 6 }}>The percentage that End Term Exams contribute to the final grade.</p>
              </div>
              <div>
                <label style={labelStyle}>Continuous Assessment (CAT) Weight (%)</label>
                <input 
                  type="number" 
                  value={examOptions.weighting.cat1} 
                  onChange={(e) => setExamOptions({...examOptions, weighting: {...examOptions.weighting, cat1: parseInt(e.target.value) || 0}})}
                  style={inputStyle} 
                />
                <p style={{ fontSize: 11, color: "#8A8FA8", marginTop: 6 }}>Combined weight for all CATs performed during the term.</p>
              </div>
              <div style={{ padding: "14px", background: "#FFF9E6", borderRadius: 10, border: "1px solid #FFE58F" }}>
                <span style={{ fontSize: 12, color: "#856404", fontWeight: 700 }}>⚠️ Note:</span>
                <span style={{ fontSize: 12, color: "#856404", marginLeft: 6 }}>Total weighting must equal 100% for balanced report cards.</span>
              </div>
            </div>
          </section>

          <section style={sectionCardStyle}>
            <h4 style={{ margin: "0 0 20px", fontSize: 16, color: "#1A1A2E", fontWeight: 800 }}>General Exam Policies</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div>
                <label style={labelStyle}>Default Grading Scale</label>
                <select style={inputStyle}>
                  <option>Standard CBC (EE, ME, AE, BE)</option>
                  <option>Traditional Academic (A-E)</option>
                  <option>Points-Based System</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Maximum Subject Mark</label>
                <input type="number" defaultValue={100} style={inputStyle} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
                <input type="checkbox" id="autoPublish" style={{ width: 18, height: 18 }} />
                <label htmlFor="autoPublish" style={{ fontSize: 13, color: "#4A4A6A", fontWeight: 600, cursor: "pointer" }}>Auto-publish results to Parent Portal after deadline</label>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* 3. EXAMINATION ENTRY TAB */}
      {activeTab === "entry" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Filters Bar */}
          <div 
            className="responsive-grid"
            style={{ 
              display: "grid", 
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", 
              gap: 16, 
              padding: "20px", 
              background: "#F8FAFC", 
              borderRadius: 16, 
              border: "1px solid #E8EAF0" 
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={labelStyle}>Class & Stream</label>
              <div style={{ display: "flex", gap: 8 }}>
                <select
                  value={selectedClass}
                  onChange={(e) => setSelectedClass(e.target.value)}
                  style={{ flex: 1, ...inputStyle }}
                >
                  {CLASSES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select
                  value={selectedStream}
                  onChange={(e) => setSelectedStream(e.target.value)}
                  style={{ width: 70, ...inputStyle }}
                >
                  <option value="A">A</option>
                  <option value="B">B</option>
                </select>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={labelStyle}>Subject</label>
              <select
                value={selectedSubject}
                onChange={(e) => setSelectedSubject(e.target.value)}
                style={inputStyle}
              >
                {availableSubjects.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={labelStyle}>Term</label>
              <select
                value={selectedTerm}
                onChange={(e) => setSelectedTerm(e.target.value)}
                style={inputStyle}
              >
                <option>Term 1</option>
                <option>Term 2</option>
                <option>Term 3</option>
              </select>
            </div>

            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <button style={{ height: 42, padding: "0 28px", background: "linear-gradient(135deg, #1B6B3A, #28a05f)", color: "#fff", border: "none", borderRadius: 10, fontSize: 13.5, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 10px rgba(27,107,58,0.2)" }}>
                💾 Save Matrix
              </button>
            </div>
          </div>

          {/* Marks Entry Spreadsheet */}
          <div className="table-container" style={{ 
            background: "#fff", 
            border: "1px solid #E2E8F0", 
            borderRadius: 12, 
            overflowX: "auto", 
            boxShadow: "0 1px 3px rgba(0,0,0,0.1)" 
          }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 12 }}>
              <thead style={{ background: "#F1F5F9", borderBottom: "2px solid #E2E8F0" }}>
                <tr>
                  <th style={{ padding: "8px 12px", border: "1px solid #E2E8F0", width: 80 }}>ADM</th>
                  <th style={{ padding: "8px 12px", border: "1px solid #E2E8F0", minWidth: 150 }}>NAME</th>
                  {termExams.map(exam => (
                    <th key={exam.id} style={{ padding: "8px 12px", border: "1px solid #E2E8F0", textAlign: "center", width: 80 }}>
                      <div style={{ fontSize: 10, color: "#64748B" }}>{exam.term}</div>
                      <div style={{ fontWeight: 800 }}>{exam.name.split(' ').pop()}</div>
                    </th>
                  ))}
                  <th style={{ padding: "8px 12px", border: "1px solid #E2E8F0", textAlign: "center", background: "#F8FAFC", width: 80 }}>TOTAL</th>
                  <th style={{ padding: "8px 12px", border: "1px solid #E2E8F0", textAlign: "center", background: "#F8FAFC", width: 80 }}>GRADE</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s, sIdx) => {
                  const studentMarks = marksData[s.id] || {};
                  const total = termExams.reduce((sum, exam) => sum + (studentMarks[exam.id] || 0), 0);
                  const average = termExams.length > 0 ? total / termExams.length : 0;
                  const grade = getGrade(average, gradeLevel);

                  return (
                    <tr key={s.id}>
                      <td style={{ padding: "8px 12px", border: "1px solid #E2E8F0", fontWeight: 700, color: "#1A5F9C", background: "#F8FAFC" }}>{s.admNo.split('/').pop()}</td>
                      <td style={{ padding: "8px 12px", border: "1px solid #E2E8F0", fontWeight: 600 }}>{s.fullName}</td>
                      {termExams.map((exam, eIdx) => (
                        <td key={exam.id} style={{ padding: "0", border: "1px solid #E2E8F0" }}>
                          <input
                            id={`cell-${sIdx}-${eIdx}`}
                            type="text"
                            value={studentMarks[exam.id] ?? ""}
                            onChange={(e) => handleScoreChange(s.id, exam.id, e.target.value)}
                            onKeyDown={(e) => navigateGrid(e, sIdx, eIdx, students.length, termExams.length)}
                            style={{ 
                              width: "100%", 
                              height: "36px", 
                              border: "none", 
                              textAlign: "center", 
                              fontSize: 13, 
                              fontWeight: 700, 
                              outline: "none",
                              background: "transparent"
                            }}
                            autoComplete="off"
                          />
                        </td>
                      ))}
                      <td style={{ padding: "8px 12px", border: "1px solid #E2E8F0", textAlign: "center", fontWeight: 800, background: "#F8FAFC" }}>
                        {total}
                      </td>
                      <td style={{ padding: "8px 12px", border: "1px solid #E2E8F0", textAlign: "center", background: "#F8FAFC" }}>
                        <span style={{ fontSize: 11, fontWeight: 900, color: grade.color }}>{grade.code}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default Exams;

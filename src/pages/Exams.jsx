import React, { useState, useEffect, useMemo } from 'react';
import { STUDENTS, getClassesByType, SUBJECTS_BY_LEVEL, ACADEMIC_GRADES, COMPETENCY_GRADES } from '../data/mockData';
import { supabase } from '../lib/supabase';

const GRADES_BY_LEVEL = {
  "Pre-Primary": ["PP1", "PP2"],
  "Primary": ["Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6"],
  "Junior Secondary": ["Grade 7", "Grade 8", "Grade 9"],
  "Senior Secondary": ["Grade 10", "Grade 11", "Grade 12"]
};

const getGradeLevel = (classId) => {
  if (classId.startsWith("p")) return "upper_primary"; // p1-p8
  if (classId.startsWith("g")) return "jss"; // g7-g9
  if (classId.startsWith("f")) return "senior"; // f1-f4
  return "upper_primary";
};

const Exams = ({ schoolConfig, examsList, setExamsList }) => {
  // Tab State: 'listings' | 'options' | 'entry'
  const [activeTab, setActiveTab] = useState("listings");

  const currentTypeClasses = useMemo(() => {
    return getClassesByType(schoolConfig?.schoolType || "Primary");
  }, [schoolConfig]);

  // --- Exam Listings State ---
  // Received as props from App.jsx
  const [newExam, setNewExam] = useState({ name: "", term: "Term 1", level: "Primary", grade: "Grade 4", subject: "Mathematics", weight: "" });

  const [filterLevel, setFilterLevel] = useState("Senior Secondary");
  const [filterGrade, setFilterGrade] = useState("Grade 10");
  const [filterTerm, setFilterTerm] = useState("Term 1");

  // Sync filterGrade when filterLevel changes
  useEffect(() => {
    setFilterGrade(GRADES_BY_LEVEL[filterLevel][0]);
  }, [filterLevel]);

  const filteredExams = useMemo(() => {
    const gradeIdMap = {
      "PP1": "pp1", "PP2": "pp2",
      "Grade 1": "p1", "Grade 2": "p2", "Grade 3": "p3", "Grade 4": "p4", "Grade 5": "p5", "Grade 6": "p6",
      "Grade 7": "g7", "Grade 8": "g8", "Grade 9": "g9",
      "Grade 10": "g10", "Grade 11": "g11", "Grade 12": "g12"
    };
    const targetGid = gradeIdMap[filterGrade];
    return examsList.filter(e => e.level_id === targetGid && e.term === filterTerm);
  }, [examsList, filterGrade, filterTerm]);

  // Sync newExam grade when level changes
  useEffect(() => {
    setNewExam(prev => ({ ...prev, grade: GRADES_BY_LEVEL[prev.level][0] }));
  }, [newExam.level]);

  const [gradingScope, setGradingScope] = useState("all");
  const [subjectGrading, setSubjectGrading] = useState({});

  const [selectedSubjectForGrading, setSelectedSubjectForGrading] = useState("");
  const [newGradeEntry, setNewGradeEntry] = useState({ code: "", label: "", min: "", max: "", points: "" });
  const [customGrades, setCustomGrades] = useState(COMPETENCY_GRADES);

  const [isSettingsCollapsed, setIsSettingsCollapsed] = useState(false);

  const levelToSubjectKey = {
    "Pre-Primary": "ecde",
    "Primary": "upper_primary",
    "Junior Secondary": "jss",
    "Senior Secondary": "senior"
  };
  
  const currentSubjects = useMemo(() => {
    return SUBJECTS_BY_LEVEL[levelToSubjectKey[filterLevel]] || [];
  }, [filterLevel]);

  // --- Exam Options State ---
  const [examOptions, setExamOptions] = useState({
    weighting: { cat1: 30, cat2: 30, endterm: 40 },
    maxMarks: 100,
    gradingScale: "cbc_standard" // cbc_standard | kcse_standard
  });

  const [selectedClass, setSelectedClass] = useState(currentTypeClasses[0]?.id || "");
  const [selectedStream, setSelectedStream] = useState("A");
  const [selectedSubject, setSelectedSubject] = useState("");
  const [selectedTerm, setSelectedTerm] = useState("Term 1");
  // const [marksData, setMarksData] = useState({}); // Moved to ExamEntries.jsx

  const gradeLevel = getGradeLevel(selectedClass);
  const availableSubjects = useMemo(() => SUBJECTS_BY_LEVEL[gradeLevel] || [], [gradeLevel]);
  
  // Set initial subject when class changes or if not set
  useEffect(() => {
    if (availableSubjects.length > 0 && (!selectedSubject || !availableSubjects.includes(selectedSubject))) {
      setSelectedSubject(availableSubjects[0]);
    }
  }, [availableSubjects, selectedSubject]); // eslint-disable-line react-hooks/exhaustive-deps

  const students = useMemo(() => {
    return STUDENTS.filter(s => s.gradeId === selectedClass && s.stream === selectedStream);
  }, [selectedClass, selectedStream]);

  const getGrade = (score, level) => {
    // Both JSS and Senior now use the competency-based 8-point scale
    const scale = COMPETENCY_GRADES;
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



  const handleAddExam = async () => {
    if (!newExam.name.trim()) return;
    try {
      const gradeIdMap = {
        "PP1": "pp1", "PP2": "pp2",
        "Grade 1": "p1", "Grade 2": "p2", "Grade 3": "p3", "Grade 4": "p4", "Grade 5": "p5", "Grade 6": "p6",
        "Grade 7": "g7", "Grade 8": "g8", "Grade 9": "g9",
        "Grade 10": "g10", "Grade 11": "g11", "Grade 12": "g12"
      };
      const gid = gradeIdMap[newExam.grade];

      const payload = {
        school_id: schoolConfig.id,
        name: newExam.name,
        term: newExam.term,
        year: new Date().getFullYear(),
        level_id: gid,
        status: "Upcoming"
      };

      const { data, error } = await supabase
        .from('exams')
        .insert([payload])
        .select()
        .single();

      if (error) throw error;
      
      setExamsList(prev => [data, ...prev]);
      setNewExam({ ...newExam, name: "", weight: "" });
      alert('Exam registered successfully!');
    } catch (err) {
      alert('Failed to register exam: ' + err.message);
    }
  };

  const updateExam = async (id, field, value) => {
    try {
      // Note: Our DB schema uses 'name', 'term', 'status' etc. 
      // The mock used 'weight' which we'll need to handle or map if needed.
      const { error } = await supabase
        .from('exams')
        .update({ [field]: value })
        .eq('id', id);
      
      if (error) throw error;
      setExamsList(prev => prev.map(e => e.id === id ? { ...e, [field]: value } : e));
    } catch (err) {
      console.error('Error updating exam:', err);
    }
  };

  const removeExam = async (id) => {
    if (!confirm('Are you sure you want to delete this exam?')) return;
    try {
      const { error } = await supabase
        .from('exams')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      setExamsList(prev => prev.filter(e => e.id !== id));
    } catch (err) {
      alert('Failed to delete exam: ' + err.message);
    }
  };

  // Shared Styles
  const activeColor = "#cc785c";
  const labelStyle = { display: "block", fontSize: 11, fontWeight: 800, color: "#2a2421", marginBottom: "10px", textTransform: "uppercase", letterSpacing: "0.05em" };
  const inputStyle = { width: "100%", padding: "12px 16px", borderRadius: 8, border: "1px solid #e6dfd8", fontSize: 14, background: "#fff", outline: "none", transition: "all 0.2s ease", boxSizing: "border-box" };
  const sectionCardStyle = { background: "#fff", border: "1px solid #e6dfd8", borderRadius: 12, padding: "24px", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" };

  return (
    <div style={{ paddingBottom: 40 }}>
      {/* Page Header */}
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 32, fontWeight: 700, color: "#2a2421", margin: 0, fontFamily: "'EB Garamond', serif" }}>Exam Settings</h2>
        <p style={{ color: "#8a8fa8", marginTop: 4, fontSize: 16 }}>Register examinations, configure weighting, and manage grading systems.</p>
      </div>

      {/* Internal Navigation Tabs (Pills) */}
      <div 
        style={{ 
          display: "flex", 
          gap: 12, 
          marginBottom: 32, 
          overflowX: "auto", 
          paddingBottom: 4,
          flexWrap: "nowrap"
        }}
        className="sidebar-scroll"
      >
        {[
          { id: "listings", label: "Exam Listings", icon: "📅" },
          { id: "options", label: "Weighting & Grading", icon: "⚙️" },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: "10px 24px",
              background: activeTab === tab.id ? activeColor : "transparent",
              color: activeTab === tab.id ? "#fff" : "#2a2421",
              border: activeTab === tab.id ? "none" : "1px solid #e6dfd8",
              borderRadius: 30,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
              transition: "all 0.2s ease",
              whiteSpace: "nowrap"
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
            <h4 style={{ margin: "0 0 28px", fontSize: 16, color: "#1A1A2E", fontWeight: 800 }}>Register New Examination</h4>

            {/* ROW 1: Level, Grade, Term */}
            <div style={{ 
              display: "grid", 
              gridTemplateColumns: "1fr 1fr 1fr", 
              gap: 24, 
              marginBottom: 24 
            }}>
              <div>
                <label style={labelStyle}>Level</label>
                <select value={newExam.level} onChange={(e) => setNewExam({...newExam, level: e.target.value})} style={inputStyle}>
                  {Object.keys(GRADES_BY_LEVEL).map(lvl => <option key={lvl}>{lvl}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Grade</label>
                <select value={newExam.grade} onChange={(e) => setNewExam({...newExam, grade: e.target.value})} style={inputStyle}>
                  {(GRADES_BY_LEVEL[newExam.level] || []).map(g => <option key={g}>{g}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Term</label>
                <select value={newExam.term} onChange={(e) => setNewExam({...newExam, term: e.target.value})} style={inputStyle}>
                  <option>Term 1</option>
                  <option>Term 2</option>
                  <option>Term 3</option>
                </select>
              </div>
            </div>

            {/* ROW 2: Exam Name, Cut Off Mark, Register Button */}
            <div style={{ 
              display: "grid", 
              gridTemplateColumns: "1fr 1fr 1fr", 
              gap: 24, 
              alignItems: "flex-end" 
            }}>
              <div>
                <label style={labelStyle}>Exam Name</label>
                <input type="text" placeholder="e.g. End of Term 1" value={newExam.name} onChange={(e) => setNewExam({...newExam, name: e.target.value})} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Cut Off Mark (%)</label>
                <input type="number" placeholder="0" value={newExam.weight} onChange={(e) => setNewExam({...newExam, weight: e.target.value})} style={inputStyle} />
              </div>
              <div>
                <button 
                  onClick={handleAddExam}
                  style={{ 
                    width: "100%",
                    height: 46, 
                    background: activeColor, 
                    color: "#fff", 
                    border: "none", 
                    borderRadius: 10, 
                    fontSize: 14, 
                    fontWeight: 700, 
                    cursor: "pointer", 
                    transition: "all 0.2s",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    boxShadow: "0 4px 12px rgba(204, 120, 92, 0.2)"
                  }}
                >
                  <span style={{ fontSize: 16 }}>+</span> Register Examination
                </button>
              </div>
            </div>
          </section>

          {/* Exams Selection & Editable Grid */}
          <section style={{ ...sectionCardStyle, padding: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 16 }}>
              <h4 style={{ margin: 0, fontSize: 16, color: "#1A1A2E", fontWeight: 800 }}>Manage Active Examinations</h4>
              
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#8A8FA8" }}>LEVEL:</span>
                  <select value={filterLevel} onChange={(e) => setFilterLevel(e.target.value)} style={{ ...inputStyle, width: "auto", padding: "6px 10px", fontSize: 12 }}>
                    {Object.keys(GRADES_BY_LEVEL).map(lvl => <option key={lvl}>{lvl}</option>)}
                  </select>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#8A8FA8" }}>GRADE:</span>
                  <select value={filterGrade} onChange={(e) => setFilterGrade(e.target.value)} style={{ ...inputStyle, width: "auto", padding: "6px 10px", fontSize: 12 }}>
                    {(GRADES_BY_LEVEL[filterLevel] || []).map(g => <option key={g}>{g}</option>)}
                  </select>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#8A8FA8" }}>TERM:</span>
                  <select value={filterTerm} onChange={(e) => setFilterTerm(e.target.value)} style={{ ...inputStyle, width: "auto", padding: "6px 10px", fontSize: 12 }}>
                    <option>Term 1</option>
                    <option>Term 2</option>
                    <option>Term 3</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="table-container" style={{ borderRadius: 12, border: "1px solid #E8EAF0", overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead style={{ background: "#F8FAFC", borderBottom: "2px solid #E8EAF0" }}>
                  <tr>
                    <th style={{ padding: "14px 18px", textAlign: "left", color: "#8A8FA8", fontSize: 11, fontWeight: 700 }}>EXAMINATION NAME</th>
                    <th style={{ padding: "14px 18px", textAlign: "left", color: "#8A8FA8", fontSize: 11, fontWeight: 700 }}>TERM</th>
                    <th style={{ padding: "14px 18px", textAlign: "center", color: "#8A8FA8", fontSize: 11, fontWeight: 700 }}>CUT OFF MARK</th>
                    <th style={{ padding: "14px 18px", textAlign: "center", color: "#8A8FA8", fontSize: 11, fontWeight: 700 }}>STATUS</th>
                    <th style={{ padding: "14px 18px", textAlign: "center", color: "#8A8FA8", fontSize: 11, fontWeight: 700 }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredExams.map((exam, idx) => (
                    <tr key={exam.id} style={{ borderBottom: "1px solid #e6dfd8", background: idx % 2 === 0 ? "#fff" : "#fafafa" }}>
                      <td style={{ padding: "12px 18px" }}>
                        <input 
                          type="text" 
                          value={exam.name} 
                          onChange={(e) => updateExam(exam.id, 'name', e.target.value)}
                          style={{ border: "none", background: "transparent", fontWeight: 700, color: "#2a2421", width: "100%", outline: "none", fontSize: 14 }}
                        />
                      </td>
                      <td style={{ padding: "12px 18px" }}>
                        <select 
                          value={exam.term} 
                          onChange={(e) => updateExam(exam.id, 'term', e.target.value)}
                          style={{ border: "none", background: "transparent", color: "#2a2421", fontWeight: 500, outline: "none", fontSize: 14 }}
                        >
                          <option>Term 1</option>
                          <option>Term 2</option>
                          <option>Term 3</option>
                        </select>
                      </td>
                      <td style={{ padding: "12px 18px", textAlign: "center" }}>
                        <input 
                          type="number" 
                          value={exam.weight} 
                          onChange={(e) => updateExam(exam.id, 'weight', e.target.value)}
                          style={{ border: "1px solid #e6dfd8", borderRadius: 6, padding: "4px 8px", width: 60, textAlign: "center", fontWeight: 700, color: activeColor, outline: "none" }}
                        />
                      </td>
                      <td style={{ padding: "12px 18px", textAlign: "center" }}>
                        <span style={{ 
                          padding: "4px 12px", borderRadius: 12, fontSize: 11, fontWeight: 700,
                          background: exam.status === "Published" || exam.status === "Completed" ? "#ebf5ee" : exam.status === "Ongoing" ? "#fff9e6" : "#f4f5f7",
                          color: exam.status === "Published" || exam.status === "Completed" ? "#1B6B3A" : exam.status === "Ongoing" ? "#D97706" : "#8A8FA8"
                        }}>{exam.status}</span>
                      </td>
                      <td style={{ padding: "10px 18px", textAlign: "center" }}>
                        <button onClick={() => removeExam(exam.id)} style={{ background: "none", border: "none", cursor: "pointer", opacity: 0.6 }} title="Delete">🗑️</button>
                      </td>
                    </tr>
                  ))}
                  {filteredExams.length === 0 && (
                    <tr>
                      <td colSpan="5" style={{ padding: "30px", textAlign: "center", color: "#8A8FA8", fontSize: 13 }}>No examinations found for this selection.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* 2. EXAM OPTIONS TAB */}
      {activeTab === "options" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {/* Options Selection Bar */}
          <section style={{ ...sectionCardStyle, padding: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
              <h4 style={{ margin: 0, fontSize: 16, color: "#1A1A2E", fontWeight: 800 }}>Weighting Configuration</h4>
              
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#8A8FA8" }}>LEVEL:</span>
                  <select value={filterLevel} onChange={(e) => setFilterLevel(e.target.value)} style={{ ...inputStyle, width: "auto", padding: "6px 10px", fontSize: 12 }}>
                    {Object.keys(GRADES_BY_LEVEL).map(lvl => <option key={lvl}>{lvl}</option>)}
                  </select>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#8A8FA8" }}>GRADE:</span>
                  <select value={filterGrade} onChange={(e) => setFilterGrade(e.target.value)} style={{ ...inputStyle, width: "auto", padding: "6px 10px", fontSize: 12 }}>
                    {(GRADES_BY_LEVEL[filterLevel] || []).map(g => <option key={g}>{g}</option>)}
                  </select>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#8A8FA8" }}>TERM:</span>
                  <select value={filterTerm} onChange={(e) => setFilterTerm(e.target.value)} style={{ ...inputStyle, width: "auto", padding: "6px 10px", fontSize: 12 }}>
                    <option>Term 1</option>
                    <option>Term 2</option>
                    <option>Term 3</option>
                  </select>
                </div>
              </div>
            </div>
          </section>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.8fr", gap: 24 }}>
            <section style={sectionCardStyle}>
              <h4 style={{ margin: "0 0 20px", fontSize: 16, color: "#1A1A2E", fontWeight: 800 }}>Percentage Contributions</h4>
              <div className="table-container" style={{ borderRadius: 12, border: "1px solid #E8EAF0", overflow: "hidden", marginBottom: 20 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead style={{ background: "#F8FAFC", borderBottom: "2px solid #E8EAF0" }}>
                    <tr>
                      <th style={{ padding: "14px 18px", textAlign: "left", color: "#8A8FA8", fontSize: 11, fontWeight: 700 }}>EXAMINATION NAME</th>
                      <th style={{ padding: "14px 18px", textAlign: "center", color: "#8A8FA8", fontSize: 11, fontWeight: 700 }}>PERCENTAGE CONTRIBUTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredExams.map((exam, idx) => (
                      <tr key={exam.id} style={{ borderBottom: "1px solid #F0F2F5", background: idx % 2 === 0 ? "#fff" : "#F8FAFC" }}>
                        <td style={{ padding: "12px 18px", fontWeight: 700, color: "#1A1A2E" }}>{exam.name}</td>
                        <td style={{ padding: "12px 18px", textAlign: "center" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                            <input 
                              type="number" 
                              value={exam.weight} 
                              onChange={(e) => updateExam(exam.id, 'weight', e.target.value)}
                              style={{ border: "1.5px solid #E8EAF0", borderRadius: 8, padding: "6px 10px", width: 80, textAlign: "center", fontWeight: 800, color: "#1B6B3A", fontSize: 14, outline: "none" }}
                            />
                            <span style={{ fontWeight: 700, color: "#8A8FA8" }}>%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredExams.length === 0 && (
                      <tr>
                        <td colSpan="2" style={{ padding: "30px", textAlign: "center", color: "#8A8FA8", fontSize: 13 }}>No examinations found for this selection.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div style={{ padding: "16px", background: "#F1F5F9", borderRadius: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 14, color: "#475569", fontWeight: 700 }}>
                  Cumulative Total: 
                  <span style={{ 
                    marginLeft: 12, padding: "6px 14px", borderRadius: 8, 
                    background: filteredExams.reduce((acc, curr) => acc + (parseInt(curr.weight) || 0), 0) === 100 ? "#1B6B3A" : "#D97706",
                    color: "#fff",
                    boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
                  }}>
                    {filteredExams.reduce((acc, curr) => acc + (parseInt(curr.weight) || 0), 0)}%
                  </span>
                </div>
                <div style={{ fontSize: 11, color: "#64748B", textAlign: "right", maxWidth: "200px", lineHeight: 1.4 }}>
                  {filteredExams.reduce((acc, curr) => acc + (parseInt(curr.weight) || 0), 0) === 100 
                    ? "✅ Weighting is balanced and ready for report cards." 
                    : "⚠️ Total must equal 100% for correct calculations."}
                </div>
              </div>
            </section>

            <section style={sectionCardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <h4 style={{ margin: 0, fontSize: 16, color: "#1A1A2E", fontWeight: 800 }}>Grading System Configuration</h4>
                <div style={{ display: "flex", background: "#F1F5F9", padding: "4px", borderRadius: 10 }}>
                  <button 
                    onClick={() => setGradingScope("all")}
                    style={{ padding: "6px 12px", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", background: gradingScope === "all" ? "#fff" : "transparent", color: gradingScope === "all" ? "#1B6B3A" : "#64748B", boxShadow: gradingScope === "all" ? "0 2px 4px rgba(0,0,0,0.05)" : "none", transition: "all 0.2s" }}
                  >Global</button>
                  <button 
                    onClick={() => setGradingScope("per_subject")}
                    style={{ padding: "6px 12px", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", background: gradingScope === "per_subject" ? "#fff" : "transparent", color: gradingScope === "per_subject" ? "#1B6B3A" : "#64748B", boxShadow: gradingScope === "per_subject" ? "0 2px 4px rgba(0,0,0,0.05)" : "none", transition: "all 0.2s" }}
                  >Per Subject</button>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {gradingScope === "per_subject" && (
                  <div style={{ marginBottom: 16 }}>
                    <label style={labelStyle}>Select Subject to Configure</label>
                    <select 
                      style={inputStyle} 
                      value={selectedSubjectForGrading || ""} 
                      onChange={(e) => setSelectedSubjectForGrading(e.target.value)}
                    >
                      <option value="">-- Choose Subject --</option>
                      {currentSubjects.map(sub => <option key={sub} value={sub}>{sub}</option>)}
                    </select>
                  </div>
                )}

                {(gradingScope === "all" || selectedSubjectForGrading) && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                    {/* Add Grade Form Row */}
                    <div style={{ padding: "20px", background: "#F8FAFC", borderRadius: 12, border: "1px solid #E8EAF0" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px", alignItems: "flex-end" }}>
                        <div>
                          <label style={{ ...labelStyle, fontSize: 10 }}>Grade</label>
                          <input type="text" placeholder="e.g. EE" value={newGradeEntry.code} onChange={(e) => setNewGradeEntry({...newGradeEntry, code: e.target.value})} style={inputStyle} />
                        </div>
                        <div style={{ gridColumn: "span 2" }}>
                          <label style={{ ...labelStyle, fontSize: 10 }}>Description / Label</label>
                          <input type="text" placeholder="e.g. Exceeding Expectations" value={newGradeEntry.label} onChange={(e) => setNewGradeEntry({...newGradeEntry, label: e.target.value})} style={inputStyle} />
                        </div>
                        <div>
                          <label style={{ ...labelStyle, fontSize: 10 }}>Min %</label>
                          <input type="number" placeholder="0" value={newGradeEntry.min} onChange={(e) => setNewGradeEntry({...newGradeEntry, min: e.target.value})} style={inputStyle} />
                        </div>
                        <div>
                          <label style={{ ...labelStyle, fontSize: 10 }}>Max %</label>
                          <input type="number" placeholder="100" value={newGradeEntry.max} onChange={(e) => setNewGradeEntry({...newGradeEntry, max: e.target.value})} style={inputStyle} />
                        </div>
                        <div>
                          <label style={{ ...labelStyle, fontSize: 10 }}>Points</label>
                          <input type="number" placeholder="0" value={newGradeEntry.points} onChange={(e) => setNewGradeEntry({...newGradeEntry, points: e.target.value})} style={inputStyle} />
                        </div>
                        <div style={{ gridColumn: "1 / -1" }}>
                          <button 
                            onClick={() => {
                              if (!newGradeEntry.code || !newGradeEntry.min) return;
                              setCustomGrades([...customGrades, { ...newGradeEntry, id: Date.now() }]);
                              setNewGradeEntry({ code: "", label: "", min: "", max: "", points: "" });
                            }}
                            style={{ 
                              height: 42, 
                              width: "100%", 
                              background: "#1B6B3A", 
                              color: "#fff", 
                              border: "none", 
                              borderRadius: 8, 
                              fontSize: 12, 
                              fontWeight: 700, 
                              cursor: "pointer",
                              boxShadow: "0 2px 8px rgba(27, 107, 58, 0.2)"
                            }}
                          >+ Add Grade to System</button>
                        </div>
                      </div>
                    </div>

                    {/* View Settings Section */}
                    <div style={{ borderRadius: 12, border: "1px solid #E8EAF0", overflow: "hidden" }}>
                      <div 
                        onClick={() => setIsSettingsCollapsed(!isSettingsCollapsed)}
                        style={{ padding: "12px 18px", background: "#fff", borderBottom: isSettingsCollapsed ? "none" : "1px solid #F1F5F9", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
                      >
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#1A1A2E", display: "flex", alignItems: "center", gap: 8 }}>
                          <span>📖</span> View Settings
                        </div>
                        <span style={{ fontSize: 10, color: "#8A8FA8" }}>{isSettingsCollapsed ? "▼" : "▲"}</span>
                      </div>
                      
                      {!isSettingsCollapsed && (
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                          <thead>
                            <tr style={{ background: "#F8FAFC", borderBottom: "1px solid #E8EAF0" }}>
                              <th style={{ textAlign: "left", padding: "12px 18px", color: "#8A8FA8", fontWeight: 700 }}>Grade</th>
                              <th style={{ textAlign: "left", padding: "12px 18px", color: "#8A8FA8", fontWeight: 700 }}>Label</th>
                              <th style={{ textAlign: "center", padding: "12px 18px", color: "#8A8FA8", fontWeight: 700 }}>Range %</th>
                              <th style={{ textAlign: "center", padding: "12px 18px", color: "#8A8FA8", fontWeight: 700 }}>Points</th>
                              <th style={{ textAlign: "center", padding: "12px 18px", color: "#8A8FA8", fontWeight: 700 }}></th>
                            </tr>
                          </thead>
                          <tbody>
                            {customGrades.map((g, idx) => (
                              <tr key={g.id || idx} style={{ borderBottom: "1px solid #F1F5F9" }}>
                                <td style={{ padding: "12px 18px" }}>
                                  <span style={{ 
                                    padding: "4px 10px", borderRadius: 6, fontWeight: 800, fontSize: 11,
                                    background: g.bg || "#F1F5F9", color: g.color || "#4A4A6A"
                                  }}>{g.code}</span>
                                </td>
                                <td style={{ padding: "12px 18px", fontWeight: 600, color: "#1A1A2E" }}>{g.label}</td>
                                <td style={{ padding: "12px 18px", textAlign: "center", fontWeight: 700, color: "#4A4A6A" }}>{g.min} - {g.max || 100}</td>
                                <td style={{ padding: "12px 18px", textAlign: "center", fontWeight: 800, color: "#1A5F9C" }}>{g.points || "-"}</td>
                                <td style={{ padding: "12px 18px", textAlign: "center" }}>
                                  <button 
                                    onClick={() => setCustomGrades(customGrades.filter((_, i) => i !== idx))}
                                    style={{ background: "none", border: "none", cursor: "pointer", color: "#8A8FA8", fontSize: 14 }}
                                  >🗑️</button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                )}

                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px", background: "#EBF3FB", borderRadius: 12, border: "1px solid #D1E3F8" }}>
                  <div style={{ fontSize: 18 }}>💡</div>
                  <div style={{ fontSize: 12, color: "#1A5F9C", lineHeight: 1.4, fontWeight: 500 }}>
                    Grading systems defined here automatically persist across all terms for the selected level.
                  </div>
                </div>
                
                <button style={{ width: "100%", height: 42, background: "#1A5F9C", color: "#fff", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", marginTop: 10 }}>
                  Save Grading Configuration
                </button>
              </div>
            </section>
          </div>
        </div>
      )}


    </div>
  );
};

export default Exams;

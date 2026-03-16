import React, { useState } from 'react';
import { STUDENTS, CLASSES, SUBJECTS_BY_LEVEL, ACADEMIC_GRADES, COMPETENCY_GRADES } from '../data/mockData';

const Exams = () => {
  const [selectedClass, setSelectedClass] = useState("g6");
  const [selectedStream, setSelectedStream] = useState("A");
  const [examType, setExamType] = useState("cat1");

  const gradeLevel = CLASSES.find(c => c.id === selectedClass)?.level || "upper_primary";
  const subjects = SUBJECTS_BY_LEVEL[gradeLevel] || [];
  const students = STUDENTS.filter(s => s.gradeId === selectedClass && s.stream === selectedStream);

  const getGrade = (score, level) => {
    const scale = level === "senior" ? ACADEMIC_GRADES : COMPETENCY_GRADES;
    for (const g of scale) {
      if (score >= g.min) return g;
    }
    return scale[scale.length - 1];
  };

  return (
    <div>
      <div style={{ background: "#fff", border: "1px solid #E8EAF0", borderRadius: 12, padding: "12px 18px", marginBottom: 16, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 10, color: "#8A8FA8", fontWeight: 600, textTransform: "uppercase" }}>Class</span>
          <select value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #E8EAF0", fontSize: 12, outline: "none" }}>
            {CLASSES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 10, color: "#8A8FA8", fontWeight: 600, textTransform: "uppercase" }}>Stream</span>
      <div 
        className="responsive-grid"
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 12, marginBottom: 18 }}
      >
        <select
          value={selectedClass}
          onChange={(e) => setSelectedClass(e.target.value)}
          style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #E8EAF0", fontSize: 13, background: "#fff", outline: "none" }}
        >
          {CLASSES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select
          value={selectedSubject}
          onChange={(e) => setSelectedSubject(e.target.value)}
          style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #E8EAF0", fontSize: 13, background: "#fff", outline: "none" }}
        >
          {availableSubjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select
          value={selectedExam}
          onChange={(e) => setSelectedExam(e.target.value)}
          style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #E8EAF0", fontSize: 13, background: "#fff", outline: "none" }}
        >
          <option value="cat1">CAT 1</option>
          <option value="cat2">CAT 2</option>
          <option value="endterm">End Term</option>
        </select>
        <button style={{ padding: "8px 16px", background: "#1B6B3A", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          💾 Save Marks
        </button>
      </div>

      <div className="table-container" style={{ background: "#fff", border: "1px solid #E8EAF0", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 13 }}>
          <thead style={{ background: "#FAFBFC", borderBottom: "1px solid #E8EAF0" }}>
            <tr>
              <th style={{ padding: "12px 18px", fontWeight: 700, color: "#8A8FA8", fontSize: 11, textTransform: "uppercase" }}>ADM No.</th>
              <th style={{ padding: "12px 18px", fontWeight: 700, color: "#8A8FA8", fontSize: 11, textTransform: "uppercase" }}>Student Name</th>
              <th style={{ padding: "12px 18px", fontWeight: 700, color: "#8A8FA8", fontSize: 11, textTransform: "uppercase", textAlign: "center" }}>Score (%)</th>
              <th className="hide-mobile" style={{ padding: "12px 18px", fontWeight: 700, color: "#8A8FA8", fontSize: 11, textTransform: "uppercase", textAlign: "center" }}>Grade</th>
              <th className="hide-mobile" style={{ padding: "12px 18px", fontWeight: 700, color: "#8A8FA8", fontSize: 11, textTransform: "uppercase" }}>Remarks</th>
            </tr>
          </thead>
            <tbody>
              {students.map((s, idx) => {
                const marks = subjects.map(() => 45 + Math.floor(Math.random() * 50));
                const mean = Math.round(marks.reduce((a, b) => a + b, 0) / marks.length);
                const grade = getGrade(mean, gradeLevel);
                
                return (
                  <tr key={s.id} style={{ borderBottom: "1px solid #F7F8FA", background: idx % 2 === 0 ? "#fff" : "#FAFBFC" }}>
                    <td style={{ padding: "12px 18px", fontWeight: 600, color: "#1A5F9C" }}>{s.admNo}</td>
                    <td style={{ padding: "12px 18px", fontWeight: 700, color: "#1A1A2E" }}>{s.fullName}</td>
                    {marks.map((m, i) => (
                      <td key={i} style={{ padding: "12px 12px", textAlign: "center" }}>
                        <input
                          type="text"
                          defaultValue={m}
                          style={{ width: 40, padding: "4px", textAlign: "center", borderRadius: 4, border: "1px solid #E8EAF0", fontSize: 12, fontWeight: 600 }}
                        />
                      </td>
                    ))}
                    <td style={{ padding: "12px 18px", textAlign: "center" }}>
                      <span style={{ padding: "4px 10px", borderRadius: 10, fontSize: 12, fontWeight: 700, background: grade.bg, color: grade.color }}>
                        {mean}% ({grade.code})
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Exams;

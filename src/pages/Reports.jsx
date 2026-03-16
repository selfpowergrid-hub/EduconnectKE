import React, { useState } from 'react';
import { STUDENTS, CLASSES, SCHOOL_NAME, CURRENT_TERM, CURRENT_YEAR } from '../data/mockData';

const Reports = () => {
  const [selectedClass, setSelectedClass] = useState("g6");
  const [selectedStream, setSelectedStream] = useState("A");
  const [selectedStudentId, setSelectedStudentId] = useState(null);

  const students = STUDENTS.filter(s => s.gradeId === selectedClass && s.stream === selectedStream);
  const selectedStudent = STUDENTS.find(s => s.id === selectedStudentId) || students[0];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 16, height: "100%" }}>
      {/* Selection Panel */}
      <div style={{ background: "#fff", border: "1px solid #E8EAF0", borderRadius: 12, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "16px", borderBottom: "1px solid #E8EAF0" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1A1A2E", marginBottom: 12 }}>Report Generation</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 10, color: "#8A8FA8", fontWeight: 600, marginBottom: 4 }}>CLASS</div>
              <select value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)} style={{ width: "100%", padding: "6px", borderRadius: 6, border: "1px solid #E8EAF0", fontSize: 12 }}>
                {CLASSES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "#8A8FA8", fontWeight: 600, marginBottom: 4 }}>STREAM</div>
              <select value={selectedStream} onChange={(e) => setSelectedStream(e.target.value)} style={{ width: "100%", padding: "6px", borderRadius: 6, border: "1px solid #E8EAF0", fontSize: 12 }}>
                <option value="A">A</option>
                <option value="B">B</option>
              </select>
            </div>
          </div>
          <button style={{ width: "100%", padding: "8px", background: "#1B6B3A", color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
            Generate Bulk PDF
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
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
              {s.fullName}
              <div style={{ fontSize: 10, color: "#8A8FA8", fontWeight: 400 }}>{s.admNo}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Preview Panel */}
      <div style={{ background: "#fff", border: "1px solid #E8EAF0", borderRadius: 12, padding: "30px", overflowY: "auto", position: "relative" }}>
        <div style={{ position: "absolute", top: 20, right: 20 }}>
          <button style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #E8EAF0", background: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <span>🖨️</span> Print Report
          </button>
        </div>

        {selectedStudent ? (
          <div style={{ maxWidth: 700, margin: "0 auto", border: "1px solid #000", padding: "40px", position: "relative" }}>
             {/* School Logo/Header Placeholder */}
            <div style={{ textAlign: "center", borderBottom: "2px solid #000", paddingBottom: 20, marginBottom: 20 }}>
              <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: 1 }}>{SCHOOL_NAME.toUpperCase()}</div>
              <div style={{ fontSize: 14, fontWeight: 700, marginTop: 4 }}>MOTTO: EDUCATION FOR EXCELLENCE</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>P.O. BOX 1234 - 00100, NAIROBI · TEL: 0712 345 678</div>
              <div style={{ display: "inline-block", marginTop: 15, padding: "6px 20px", border: "2px solid #000", fontSize: 16, fontWeight: 900 }}>
                STUDENT PROGRESS REPORT
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20, fontSize: 14 }}>
              <div>
                <div style={{ marginBottom: 4 }}><b>NAME:</b> <span style={{ textDecoration: "underline" }}>{selectedStudent.fullName.toUpperCase()}</span></div>
                <div style={{ marginBottom: 4 }}><b>ADM NO:</b> <span style={{ textDecoration: "underline" }}>{selectedStudent.admNo}</span></div>
                <div style={{ marginBottom: 4 }}><b>CLASS:</b> <span style={{ textDecoration: "underline" }}>{CLASSES.find(c=>c.id===selectedStudent.gradeId)?.name} {selectedStudent.stream}</span></div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ marginBottom: 4 }}><b>TERM:</b> <span style={{ textDecoration: "underline" }}>{CURRENT_TERM.toUpperCase()}</span></div>
                <div style={{ marginBottom: 4 }}><b>YEAR:</b> <span style={{ textDecoration: "underline" }}>{CURRENT_YEAR}</span></div>
                <div style={{ marginBottom: 4 }}><b>DATE:</b> <span style={{ textDecoration: "underline" }}>{new Date().toLocaleDateString()}</span></div>
              </div>
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 20 }}>
              <thead>
                <tr style={{ background: "#F0F2F5" }}>
                  <th style={{ border: "1px solid #000", padding: "8px", textAlign: "left" }}>SUBJECT</th>
                  <th style={{ border: "1px solid #000", padding: "8px", textAlign: "center" }}>CAT 1</th>
                  <th style={{ border: "1px solid #000", padding: "8px", textAlign: "center" }}>CAT 2</th>
                  <th style={{ border: "1px solid #000", padding: "8px", textAlign: "center" }}>EXAM</th>
                  <th style={{ border: "1px solid #000", padding: "8px", textAlign: "center" }}>GRADE</th>
                  <th style={{ border: "1px solid #000", padding: "8px", textAlign: "left" }}>REMARKS</th>
                </tr>
              </thead>
              <tbody>
                {["English", "Kiswahili", "Mathematics", "Science", "Social Studies", "C.R.E"].map(sub => (
                  <tr key={sub}>
                    <td style={{ border: "1px solid #000", padding: "8px" }}>{sub}</td>
                    <td style={{ border: "1px solid #000", padding: "8px", textAlign: "center" }}>{24 + Math.floor(Math.random()*6)}</td>
                    <td style={{ border: "1px solid #000", padding: "8px", textAlign: "center" }}>{25 + Math.floor(Math.random()*5)}</td>
                    <td style={{ border: "1px solid #000", padding: "8px", textAlign: "center" }}>{80 + Math.floor(Math.random()*20)}</td>
                    <td style={{ border: "1px solid #000", padding: "8px", textAlign: "center", fontWeight: 700 }}>A</td>
                    <td style={{ border: "1px solid #000", padding: "8px", fontSize: 11 }}>Excellent performance, keep up.</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ border: "1px solid #000", padding: "10px", marginBottom: 20 }}>
              <div style={{ fontWeight: 700, marginBottom: 5 }}>TEACHER'S REMARKS:</div>
              <div style={{ minHeight: 40, background: "#F9F9F9" }}>
                A very disciplined and hardworking student. Maintain the consistency.
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 40 }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ borderTop: "1px solid #000", paddingTop: 5, width: 150 }}>Class Teacher</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ borderTop: "1px solid #000", paddingTop: 5, width: 150 }}>Headteacher</div>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ textAlign: "center", marginTop: 140, color: "#8A8FA8" }}>
            <div style={{ fontSize: 40, marginBottom: 20 }}>📂</div>
            <div>Select a student to preview report card</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Reports;

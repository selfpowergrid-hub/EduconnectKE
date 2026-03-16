import React, { useState, useMemo } from 'react';
import { STUDENTS, CLASSES } from '../data/mockData';

const Students = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedGrade, setSelectedGrade] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  const filteredStudents = useMemo(() => {
    return STUDENTS.filter(s => {
      const matchesSearch = s.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          s.admNo.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesGrade = selectedGrade === "all" || s.gradeId === selectedGrade;
      return matchesSearch && matchesGrade;
    }).sort((a, b) => b.id - a.id);
  }, [searchTerm, selectedGrade]);

  const totalPages = Math.ceil(filteredStudents.length / itemsPerPage);
  const currentStudents = filteredStudents.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div style={{ background: "#fff", border: "1px solid #E8EAF0", borderRadius: 12, overflow: "hidden" }}>
      <div style={{ padding: "18px", borderBottom: "1px solid #E8EAF0", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", gap: 10, flex: 1 }}>
          <div style={{ position: "relative", flex: 1, maxWidth: 300 }}>
            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 14 }}>🔍</span>
            <input
              type="text"
              placeholder="Search by name or admission no..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              style={{
                width: "100%",
                padding: "8px 12px 8px 32px",
                borderRadius: 8,
                border: "1px solid #E8EAF0",
                fontSize: 13,
                outline: "none",
              }}
            />
          </div>
          <select
            value={selectedGrade}
            onChange={(e) => { setSelectedGrade(e.target.value); setCurrentPage(1); }}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #E8EAF0",
              fontSize: 13,
              outline: "none",
              background: "#fff",
            }}
          >
            <option value="all">All Classes</option>
            {CLASSES.map(cls => (
              <option key={cls.id} value={cls.id}>{cls.name}</option>
            ))}
          </select>
        </div>
        <button
          style={{
            padding: "8px 16px",
            background: "#1B6B3A",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          + New Admission
        </button>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 13 }}>
          <thead style={{ background: "#FAFBFC", borderBottom: "1px solid #E8EAF0" }}>
            <tr>
              {["ADM No.", "Full Name", "Class", "Gender", "Parent/Guardian", "Phone", "Fee Balance"].map(h => (
                <th key={h} style={{ padding: "12px 18px", fontWeight: 700, color: "#8A8FA8", fontSize: 11, textTransform: "uppercase" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {currentStudents.map((s, idx) => (
              <tr key={s.id} style={{ borderBottom: "1px solid #F7F8FA", background: idx % 2 === 0 ? "#fff" : "#FAFBFC" }}>
                <td style={{ padding: "12px 18px", fontWeight: 600, color: "#1A5F9C" }}>{s.admNo}</td>
                <td style={{ padding: "12px 18px", fontWeight: 700, color: "#1A1A2E" }}>{s.fullName}</td>
                <td style={{ padding: "12px 18px" }}>
                  <span style={{ padding: "3px 8px", borderRadius: 12, fontSize: 11, fontWeight: 700, background: CLASSES.find(c=>c.id===s.gradeId)?.bg || "#eee", color: CLASSES.find(c=>c.id===s.gradeId)?.color || "#333" }}>
                    {CLASSES.find(c=>c.id===s.gradeId)?.name} {s.stream}
                  </span>
                </td>
                <td style={{ padding: "12px 18px" }}>{s.gender}</td>
                <td style={{ padding: "12px 18px", color: "#4A4A6A" }}>{s.parent}</td>
                <td style={{ padding: "12px 18px", color: "#4A4A6A" }}>{s.phone}</td>
                <td style={{ padding: "12px 18px" }}>
                  <span style={{ fontWeight: 700, color: s.feeBalance > 0 ? "#C0392B" : "#1B6B3A" }}>
                    KES {s.feeBalance.toLocaleString()}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ padding: "18px", borderTop: "1px solid #E8EAF0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 12, color: "#8A8FA8" }}>
          Showing {currentStudents.length} of {filteredStudents.length} students
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #E8EAF0", background: "#fff", cursor: currentPage === 1 ? "not-allowed" : "pointer" }}
          >
            Previous
          </button>
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            const pageNum = i + 1;
            return (
              <button
                key={pageNum}
                onClick={() => setCurrentPage(pageNum)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 6,
                  border: "1px solid",
                  borderColor: currentPage === pageNum ? "#1B6B3A" : "#E8EAF0",
                  background: currentPage === pageNum ? "#1B6B3A" : "#fff",
                  color: currentPage === pageNum ? "#fff" : "#1A1A2E",
                  cursor: "pointer"
                }}
              >
                {pageNum}
              </button>
            );
          })}
          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #E8EAF0", background: "#fff", cursor: currentPage === totalPages ? "not-allowed" : "pointer" }}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

export default Students;

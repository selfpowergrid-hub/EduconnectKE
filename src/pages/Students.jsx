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
      <div style={{ padding: "18px", borderBottom: "1px solid #E8EAF0" }}>
        {/* Filters and Search */}
        <div 
          className="responsive-grid"
          style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 12 }}
        >
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 13 }}>🔍</span>
            <input
              type="text"
              placeholder="Search by name or admission number..."
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
            style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #E8EAF0", fontSize: 13, background: "#fff", outline: "none" }}
          >
            <option value="all">All Grades</option>
            {CLASSES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button style={{ padding: "8px 16px", background: "#1B6B3A", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            + New Student
          </button>
        </div>
      </div>

      {/* Student List Table */}
      <div className="table-container">
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 13 }}>
          <thead style={{ background: "#FAFBFC", borderBottom: "1px solid #E8EAF0" }}>
            <tr>
              <th style={{ padding: "12px 18px", fontWeight: 700, color: "#8A8FA8", fontSize: 11, textTransform: "uppercase" }}>ADM No.</th>
              <th style={{ padding: "12px 18px", fontWeight: 700, color: "#8A8FA8", fontSize: 11, textTransform: "uppercase" }}>Student Name</th>
              <th className="hide-mobile" style={{ padding: "12px 18px", fontWeight: 700, color: "#8A8FA8", fontSize: 11, textTransform: "uppercase" }}>Grade</th>
              <th className="hide-mobile" style={{ padding: "12px 18px", fontWeight: 700, color: "#8A8FA8", fontSize: 11, textTransform: "uppercase" }}>Stream</th>
              <th style={{ padding: "12px 18px", fontWeight: 700, color: "#8A8FA8", fontSize: 11, textTransform: "uppercase" }}>Fee Bal.</th>
              <th style={{ padding: "12px 18px", fontWeight: 700, color: "#8A8FA8", fontSize: 11, textTransform: "uppercase" }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {currentStudents.map((s, idx) => {
              const grade = CLASSES.find(c => c.id === s.gradeId);
              return (
                <tr key={s.id} style={{ borderBottom: "1px solid #F7F8FA", background: idx % 2 === 0 ? "#fff" : "#FAFBFC" }}>
                  <td style={{ padding: "12px 18px", fontWeight: 700, color: "#1A5F9C" }}>{s.admNo}</td>
                  <td style={{ padding: "12px 18px" }}>
                    <div style={{ fontWeight: 700, color: "#1A1A2E" }}>{s.fullName}</div>
                    <div className="show-mobile" style={{ fontSize: 11, color: "#8A8FA8" }}>
                      {grade?.name} · {s.stream}
                    </div>
                  </td>
                  <td className="hide-mobile" style={{ padding: "12px 18px" }}>
                    <span style={{ 
                      padding: "3px 8px", 
                      borderRadius: 12, 
                      fontSize: 11, 
                      fontWeight: 700, 
                      background: grade?.bg || "#eee", 
                      color: grade?.color || "#333" 
                    }}>
                      {grade?.name}
                    </span>
                  </td>
                  <td className="hide-mobile" style={{ padding: "12px 18px", color: "#4A4A6A" }}>{s.stream}</td>
                  <td style={{ padding: "12px 18px" }}>
                    <span style={{ fontWeight: 700, color: s.feeBalance > 0 ? "#C0392B" : "#1B6B3A" }}>
                      {s.feeBalance.toLocaleString()}
                    </span>
                  </td>
                  <td style={{ padding: "12px 18px" }}>
                    <span style={{ 
                      padding: "2px 8px", 
                      borderRadius: 10, 
                      fontSize: 10, 
                      fontWeight: 700, 
                      background: s.status === "Active" ? "#E8F5EE" : "#F5F6F8", 
                      color: s.status === "Active" ? "#1B6B3A" : "#8A8FA8",
                      textTransform: "uppercase"
                    }}>
                      {s.status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ padding: "18px", borderTop: "1px solid #E8EAF0", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div style={{ fontSize: 12, color: "#8A8FA8" }}>
          Showing {currentStudents.length} of {filteredStudents.length} students
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #E8EAF0", background: "#fff", cursor: currentPage === 1 ? "not-allowed" : "pointer", fontSize: 12 }}
          >
            Previous
          </button>
          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #E8EAF0", background: "#fff", cursor: currentPage === totalPages ? "not-allowed" : "pointer", fontSize: 12 }}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

export default Students;

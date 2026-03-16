import React, { useState } from 'react';
import { STAFF } from '../data/mockData';

const Staff = () => {
  const [filter, setFilter] = useState("All");

  const filteredStaff = STAFF.filter(s => {
    if (filter === "All") return true;
    return s.type === filter;
  });

  return (
    <div style={{ background: "#fff", border: "1px solid #E8EAF0", borderRadius: 12, overflow: "hidden" }}>
      <div style={{ padding: "18px", borderBottom: "1px solid #E8EAF0", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", gap: 10 }}>
          {["All", "Teaching", "Non-Teaching"].map(type => (
            <button
              key={type}
              onClick={() => setFilter(type)}
              style={{
                padding: "6px 14px",
                borderRadius: 8,
                border: "1px solid",
                borderColor: filter === type ? "#1B6B3A" : "#E8EAF0",
                background: filter === type ? "#1B6B3A" : "#fff",
                color: filter === type ? "#fff" : "#4A4A6A",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {type}
            </button>
          ))}
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
          + Add Staff
        </button>
      </div>

      <div className="table-container" style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 13 }}>
          <thead style={{ background: "#FAFBFC", borderBottom: "1px solid #E8EAF0" }}>
            <tr>
              <th style={{ padding: "12px 18px", fontWeight: 700, color: "#8A8FA8", fontSize: 11, textTransform: "uppercase" }}>Staff Name</th>
              <th style={{ padding: "12px 18px", fontWeight: 700, color: "#8A8FA8", fontSize: 11, textTransform: "uppercase" }}>Role/Type</th>
              <th className="hide-mobile" style={{ padding: "12px 18px", fontWeight: 700, color: "#8A8FA8", fontSize: 11, textTransform: "uppercase" }}>ID / TSC No.</th>
              <th className="hide-mobile" style={{ padding: "12px 18px", fontWeight: 700, color: "#8A8FA8", fontSize: 11, textTransform: "uppercase" }}>Subjects / Dept</th>
              <th style={{ padding: "12px 18px", fontWeight: 700, color: "#8A8FA8", fontSize: 11, textTransform: "uppercase" }}>Contact</th>
              <th className="hide-mobile" style={{ padding: "12px 18px", fontWeight: 700, color: "#8A8FA8", fontSize: 11, textTransform: "uppercase" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredStaff.map((s, idx) => (
              <tr key={s.id} style={{ borderBottom: "1px solid #F7F8FA", background: idx % 2 === 0 ? "#fff" : "#FAFBFC" }}>
                <td style={{ padding: "12px 18px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div className="hide-mobile" style={{ width: 32, height: 32, borderRadius: "50%", background: "#1B6B3A", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>
                      {s.name.split(' ').map(n=>n[0]).join('').slice(0,2)}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, color: "#1A1A2E" }}>{s.name}</div>
                      <div className="show-mobile" style={{ fontSize: 11, color: "#8A8FA8" }}>{s.subject || "General"}</div>
                    </div>
                  </div>
                </td>
                <td style={{ padding: "12px 18px" }}>
                  <span style={{ 
                    padding: "2px 8px", 
                    borderRadius: 10, 
                    fontSize: 10, 
                    fontWeight: 700, 
                    background: s.type === "Teaching" ? "#EBF3FB" : "#F5EEF8", 
                    color: s.type === "Teaching" ? "#1A5F9C" : "#6C3483",
                    textTransform: "uppercase"
                  }}>
                    {s.type}
                  </span>
                </td>
                <td className="hide-mobile" style={{ padding: "12px 18px", color: "#4A4A6A", fontWeight: 500 }}>{s.tsc || "N/A"}</td>
                <td className="hide-mobile" style={{ padding: "12px 18px", color: "#4A4A6A" }}>{s.subject || "General"}</td>
                <td style={{ padding: "12px 18px" }}>
                  <div style={{ fontSize: 12, color: "#1A1A2E" }}>{s.phone}</div>
                  <div className="hide-mobile" style={{ fontSize: 11, color: "#8A8FA8" }}>{s.email}</div>
                </td>
                <td className="hide-mobile" style={{ padding: "12px 18px" }}>
                  <button style={{ padding: "4px 8px", background: "none", border: "1px solid #E8EAF0", borderRadius: 4, fontSize: 11, color: "#4A4A6A", cursor: "pointer" }}>
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Staff;

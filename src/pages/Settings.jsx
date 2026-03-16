import React, { useState } from 'react';
import { CLASSES, FEE_STRUCTURE, ACADEMIC_GRADES } from '../data/mockData';

const Settings = () => {
  const [activeTab, setActiveTab] = useState("school");

  const tabs = [
    { id: "school", label: "School Info", icon: "🏫" },
    { id: "houses", label: "Houses", icon: "🏠" },
    { id: "grading", label: "Grading System", icon: "📊" },
    { id: "fees", label: "Fee Structure", icon: "💰" },
    { id: "subjects", label: "Subjects", icon: "📚" },
    { id: "users", label: "Users", icon: "👤" },
  ];

  return (
    <div 
      className="responsive-grid"
      style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 20, height: "100%" }}
    >
      {/* Settings Navigation */}
      <div style={{ background: "#fff", border: "1px solid #E8EAF0", borderRadius: 12, padding: "12px", height: "fit-content" }}>
        <div className="show-mobile" style={{ fontSize: 13, fontWeight: 700, color: "#1B6B3A", marginBottom: 12, padding: "0 4px" }}>Settings Menu</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {tabs.map(tab => (
            <div
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: "10px 14px",
                borderRadius: 8,
                cursor: "pointer",
                fontSize: 13,
                fontWeight: activeTab === tab.id ? 700 : 500,
                background: activeTab === tab.id ? "#E8F5EE" : "transparent",
                color: activeTab === tab.id ? "#1B6B3A" : "#4A4A6A",
                display: "flex",
                alignItems: "center",
                gap: 10,
                transition: "all 0.2s"
              }}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </div>
          ))}
        </div>
      </div>

      {/* Settings Content */}
      <div style={{ background: "#fff", border: "1px solid #E8EAF0", borderRadius: 12, padding: "24px", overflowY: "auto" }}>
        {activeTab === "school" && (
          <div>
            <h3 style={{ margin: "0 0 20px", fontSize: 16 }}>School Configuration</h3>
            <div className="responsive-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              {[
                { label: "School Name", value: "Mwanga Academy" },
                { label: "Phone Number", value: "0712345678" },
                { label: "Email Address", value: "info@mwanga.ac.ke" },
                { label: "Mpesa Paybill", value: "123456" },
                { label: "Current Term", value: "Term 1" },
                { label: "Academic Year", value: "2026" },
              ].map(field => (
                <div key={field.label}>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#8A8FA8", marginBottom: 6, textTransform: "uppercase" }}>{field.label}</label>
                  <input 
                    type="text" 
                    defaultValue={field.value} 
                    style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid #E8EAF0", fontSize: 13, outline: "none" }}
                  />
                </div>
              ))}
            </div>
            <button style={{ marginTop: 30, padding: "10px 24px", background: "#1B6B3A", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer" }}>
              Save School Info
            </button>
          </div>
        )}

        {activeTab === "fees" && (
          <div>
            <h3 style={{ margin: "0 0 20px", fontSize: 16 }}>Fee Structure Configuration</h3>
            <div className="table-container">
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead style={{ background: "#FAFBFC", borderBottom: "1px solid #E8EAF0" }}>
                  <tr>
                    <th style={{ padding: "12px", textAlign: "left" }}>Level</th>
                    <th style={{ padding: "12px", textAlign: "center" }}>Tuition</th>
                    <th style={{ padding: "12px", textAlign: "center" }}>Activity</th>
                    <th style={{ padding: "12px", textAlign: "center" }}>Building</th>
                    <th style={{ padding: "12px", textAlign: "center" }}>Lunch</th>
                    <th style={{ padding: "12px", textAlign: "center" }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(FEE_STRUCTURE).map(([level, fees]) => (
                    <tr key={level} style={{ borderBottom: "1px solid #F7F8FA" }}>
                      <td style={{ padding: "12px", fontWeight: 700, textTransform: "capitalize" }}>{level.replace('_', ' ')}</td>
                      <td style={{ padding: "12px", textAlign: "center" }}>
                        <input type="text" defaultValue={fees.tuition} style={{ width: 60, padding: "4px", textAlign: "center", border: "1px solid #E8EAF0", borderRadius: 4 }} />
                      </td>
                      <td style={{ padding: "12px", textAlign: "center" }}>
                        <input type="text" defaultValue={fees.activity} style={{ width: 60, padding: "4px", textAlign: "center", border: "1px solid #E8EAF0", borderRadius: 4 }} />
                      </td>
                      <td style={{ padding: "12px", textAlign: "center" }}>
                        <input type="text" defaultValue={fees.building} style={{ width: 60, padding: "4px", textAlign: "center", border: "1px solid #E8EAF0", borderRadius: 4 }} />
                      </td>
                      <td style={{ padding: "12px", textAlign: "center" }}>
                        <input type="text" defaultValue={fees.lunch} style={{ width: 60, padding: "4px", textAlign: "center", border: "1px solid #E8EAF0", borderRadius: 4 }} />
                      </td>
                      <td style={{ padding: "12px", textAlign: "center", fontWeight: 700, color: "#1B6B3A" }}>{fees.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {(activeTab !== "school" && activeTab !== "fees") && (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#8A8FA8" }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>🚧</div>
            <div style={{ fontWeight: 600, color: "#4A4A6A" }}>Module Under Construction</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>The {activeTab} settings module is coming soon.</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Settings;

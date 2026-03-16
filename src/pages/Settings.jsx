import React, { useState } from 'react';
import { CLASSES, FEE_STRUCTURE, ACADEMIC_GRADES } from '../data/mockData';

const Settings = () => {
  const [activeTab, setActiveTab] = useState("school");
  const [schoolLevels, setSchoolLevels] = useState({
    primary: true,
    junior: false,
    senior: false
  });

  const tabs = [
    { id: "school", label: "School Info", icon: "🏫" },
    { id: "houses", label: "Houses", icon: "🏠" },
    { id: "grading", label: "Grading System", icon: "📊" },
    { id: "fees", label: "Fee Structure", icon: "💰" },
    { id: "subjects", label: "Subjects", icon: "📚" },
    { id: "users", label: "Users", icon: "👤" },
  ];

  const handleLevelChange = (level) => {
    setSchoolLevels(prev => ({ ...prev, [level]: !prev[level] }));
  };

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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, borderBottom: "1px solid #F0F2F5", paddingBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 18, color: "#1A1A2E" }}>School Configuration</h3>
                <p style={{ margin: "4px 0 0", fontSize: 13, color: "#8A8FA8" }}>Update your institution's core information and levels.</p>
              </div>
              <button style={{ padding: "10px 24px", background: "#1B6B3A", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
                Save Changes
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              {/* Institutional Levels */}
              <section>
                <h4 style={{ margin: "0 0 12px", fontSize: 14, color: "#4A4A6A", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>Institutional Levels</h4>
                <div style={{ display: "flex", gap: 24, flexWrap: "wrap", background: "#F8FAFC", padding: "16px", borderRadius: 12, border: "1px solid #E8EAF0" }}>
                  {[
                    { id: "primary", label: "Primary School" },
                    { id: "junior", label: "Junior Secondary School" },
                    { id: "senior", label: "Senior Secondary School" }
                  ].map(level => (
                    <label key={level.id} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 14, fontWeight: 600, color: "#1A1A2E" }}>
                      <input 
                        type="checkbox" 
                        checked={schoolLevels[level.id]}
                        onChange={() => handleLevelChange(level.id)}
                        style={{ width: 18, height: 18, accentColor: "#1B6B3A", cursor: "pointer" }}
                      />
                      {level.label}
                    </label>
                  ))}
                </div>
              </section>

              {/* General Information */}
              <section>
                <h4 style={{ margin: "0 0 16px", fontSize: 14, color: "#4A4A6A", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>General Information</h4>
                <div className="responsive-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px 24px" }}>
                  {[
                    { label: "School Name", value: "Mwanga Academy", icon: "🏢" },
                    { label: "Phone Number", value: "0712345678", icon: "📞" },
                    { label: "Email Address", value: "info@mwanga.ac.ke", icon: "✉️" },
                    { label: "M-Pesa Paybill", value: "123456", icon: "💸" },
                    { label: "Current Term", value: "Term 1", icon: "📅" },
                    { label: "Academic Year", value: "2026", icon: "🗓️" },
                  ].map(field => (
                    <div key={field.label}>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#4A4A6A", marginBottom: 8 }}>
                        {field.label}
                      </label>
                      <div style={{ position: "relative" }}>
                        <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 14 }}>{field.icon}</span>
                        <input 
                          type="text" 
                          defaultValue={field.value} 
                          style={{ 
                            width: "100%", 
                            padding: "12px 12px 12px 40px", 
                            borderRadius: 10, 
                            border: "1px solid #E8EAF0", 
                            fontSize: 14, 
                            color: "#1A1A2E",
                            background: "#fff",
                            outline: "none",
                            transition: "border-color 0.2s",
                            boxSizing: "border-box"
                          }}
                          onFocus={(e) => e.target.style.borderColor = "#1B6B3A"}
                          onBlur={(e) => e.target.style.borderColor = "#E8EAF0"}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
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

import React, { useState } from 'react';
import { STUDENTS, MPESA_TRANSACTIONS } from '../data/mockData';

const Fees = () => {
  const [activeTab, setActiveTab] = useState("balances");
  const [searchTerm, setSearchTerm] = useState("");

  const filteredStudents = STUDENTS.filter(s => 
    s.fullName.toLowerCase().includes(searchTerm.toLowerCase()) || 
    s.admNo.toLowerCase().includes(searchTerm.toLowerCase())
  ).sort((a, b) => b.feeBalance - a.feeBalance);

  const filteredTransactions = MPESA_TRANSACTIONS.filter(t => 
    t.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    t.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", gap: 20, marginBottom: 18, borderBottom: "1px solid #E8EAF0" }}>
        <div 
          onClick={() => setActiveTab("balances")}
          style={{ 
            padding: "10px 4px", 
            fontSize: 14, 
            fontWeight: 700, 
            color: activeTab === "balances" ? "#1B6B3A" : "#8A8FA8", 
            borderBottom: activeTab === "balances" ? "2px solid #1B6B3A" : "2px solid transparent",
            cursor: "pointer",
            transition: "all 0.2s"
          }}
        >
          Fee Balances
        </div>
        <div 
          onClick={() => setActiveTab("transactions")}
          style={{ 
            padding: "10px 4px", 
            fontSize: 14, 
            fontWeight: 700, 
            color: activeTab === "transactions" ? "#1B6B3A" : "#8A8FA8", 
            borderBottom: activeTab === "transactions" ? "2px solid #1B6B3A" : "2px solid transparent",
            cursor: "pointer",
            transition: "all 0.2s"
          }}
        >
          M-Pesa Transactions
        </div>
      </div>

      <div 
        className="responsive-grid"
        style={{ marginBottom: 16, display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center" }}
      >
        <div style={{ position: "relative" }}>
          <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 13 }}>🔍</span>
          <input
            type="text"
            placeholder={activeTab === "balances" ? "Search student..." : "Search transaction..."}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
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
        {activeTab === "balances" && (
          <button style={{ padding: "8px 16px", background: "#1B6B3A", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            📤 Reminders
          </button>
        )}
      </div>

      <div className="table-container" style={{ background: "#fff", border: "1px solid #E8EAF0", borderRadius: 12, overflow: "hidden", flex: 1 }}>
        {activeTab === "balances" ? (
          <div>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 13 }}>
              <thead style={{ background: "#FAFBFC", borderBottom: "1px solid #E8EAF0" }}>
                <tr>
                  <th style={{ padding: "12px 18px", fontWeight: 700, color: "#8A8FA8", fontSize: 11, textTransform: "uppercase" }}>ADM No.</th>
                  <th style={{ padding: "12px 18px", fontWeight: 700, color: "#8A8FA8", fontSize: 11, textTransform: "uppercase" }}>Student Name</th>
                  <th className="hide-mobile" style={{ padding: "12px 18px", fontWeight: 700, color: "#8A8FA8", fontSize: 11, textTransform: "uppercase" }}>Total Billed</th>
                  <th className="hide-mobile" style={{ padding: "12px 18px", fontWeight: 700, color: "#8A8FA8", fontSize: 11, textTransform: "uppercase" }}>Total Paid</th>
                  <th style={{ padding: "12px 18px", fontWeight: 700, color: "#8A8FA8", fontSize: 11, textTransform: "uppercase" }}>Balance</th>
                  <th className="hide-mobile" style={{ padding: "12px 18px", fontWeight: 700, color: "#8A8FA8", fontSize: 11, textTransform: "uppercase" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.slice(0, 50).map((s, idx) => (
                  <tr key={s.id} style={{ borderBottom: "1px solid #F7F8FA", background: idx % 2 === 0 ? "#fff" : "#FAFBFC" }}>
                    <td style={{ padding: "12px 18px", fontWeight: 600, color: "#1A5F9C" }}>{s.admNo}</td>
                    <td style={{ padding: "12px 18px" }}>
                      <div style={{ fontWeight: 700, color: "#1A1A2E" }}>{s.fullName}</div>
                      <div className="show-mobile" style={{ fontSize: 11, color: "#8A8FA8" }}>
                         Paid: {s.feePaid.toLocaleString()} / {s.feeTotal.toLocaleString()}
                      </div>
                    </td>
                    <td className="hide-mobile" style={{ padding: "12px 18px" }}>KES {s.feeTotal.toLocaleString()}</td>
                    <td className="hide-mobile" style={{ padding: "12px 18px", color: "#1B6B3A", fontWeight: 600 }}>KES {s.feePaid.toLocaleString()}</td>
                    <td style={{ padding: "12px 18px" }}>
                      <span style={{ fontWeight: 700, color: s.feeBalance > 0 ? "#C0392B" : "#1B6B3A" }}>
                        KES {s.feeBalance.toLocaleString()}
                      </span>
                    </td>
                    <td className="hide-mobile" style={{ padding: "12px 18px" }}>
                      <button style={{ padding: "4px 8px", background: "none", border: "1px solid #E8EAF0", borderRadius: 4, fontSize: 11, color: "#4A4A6A", cursor: "pointer" }}>
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 13 }}>
              <thead style={{ background: "#FAFBFC", borderBottom: "1px solid #E8EAF0" }}>
                <tr>
                  <th style={{ padding: "12px 18px", fontWeight: 700, color: "#8A8FA8", fontSize: 11, textTransform: "uppercase" }}>ID</th>
                  <th style={{ padding: "12px 18px", fontWeight: 700, color: "#8A8FA8", fontSize: 11, textTransform: "uppercase" }}>Payer</th>
                  <th style={{ padding: "12px 18px", fontWeight: 700, color: "#8A8FA8", fontSize: 11, textTransform: "uppercase" }}>Amount</th>
                  <th className="hide-mobile" style={{ padding: "12px 18px", fontWeight: 700, color: "#8A8FA8", fontSize: 11, textTransform: "uppercase" }}>Phone</th>
                  <th style={{ padding: "12px 18px", fontWeight: 700, color: "#8A8FA8", fontSize: 11, textTransform: "uppercase" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.map((t, idx) => (
                  <tr key={t.id} style={{ borderBottom: "1px solid #F7F8FA", background: idx % 2 === 0 ? "#fff" : "#FAFBFC" }}>
                    <td style={{ padding: "12px 18px", fontWeight: 700, color: "#1A5F9C" }}>{t.id}</td>
                    <td style={{ padding: "12px 18px" }}>
                      <div style={{ fontWeight: 700, color: "#1A1A2E" }}>{t.name}</div>
                      <div style={{ fontSize: 11, color: "#8A8FA8" }}>{t.adm}</div>
                      <div className="show-mobile" style={{ fontSize: 10, color: "#4A4A6A" }}>{t.phone} · {t.date}</div>
                    </td>
                    <td style={{ padding: "12px 18px", fontWeight: 700, color: "#1B6B3A" }}>KES {t.amount.toLocaleString()}</td>
                    <td className="hide-mobile" style={{ padding: "12px 18px", color: "#4A4A6A" }}>{t.phone}</td>
                    <td style={{ padding: "12px 18px" }}>
                      <span style={{ 
                        padding: "2px 8px", 
                        borderRadius: 10, 
                        fontSize: 10, 
                        fontWeight: 700, 
                        background: t.status === "confirmed" ? "#E8F5EE" : "#FEF0E6", 
                        color: t.status === "confirmed" ? "#1B6B3A" : "#D4A017",
                        textTransform: "uppercase"
                      }}>
                        {t.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Fees;

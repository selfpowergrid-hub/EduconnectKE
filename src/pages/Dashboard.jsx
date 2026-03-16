import React from 'react';
import { STUDENTS, STAFF, CLASSES, RECENT_ACTIVITY } from '../data/mockData';
import { StatCard } from '../components/common/StatCard';
import ProgressBar from '../components/common/ProgressBar';

const Dashboard = () => {
  const totalStudents = STUDENTS.length;
  const staffCount = STAFF.length;
  const teachingStaff = STAFF.filter(s => s.type === "Teaching").length;
  
  const totalBilled = STUDENTS.reduce((acc, s) => acc + s.feeTotal, 0);
  const totalPaid = STUDENTS.reduce((acc, s) => acc + s.feePaid, 0);
  const totalBalance = STUDENTS.reduce((acc, s) => acc + s.feeBalance, 0);
  const collectionRate = Math.round((totalPaid / totalBilled) * 100);
  const debtorsCount = STUDENTS.filter(s => s.feeBalance > 0).length;

  const classMeanScores = [
    { label: "Grade 12A", mean: 74.2, color: "#6C3483" },
    { label: "Grade 12B", mean: 68.5, color: "#6C3483" },
    { label: "Grade 9A (JSS)", mean: 66.8, color: "#1A5F9C" },
    { label: "Grade 9B (JSS)", mean: 61.2, color: "#1A5F9C" },
    { label: "Grade 6A", mean: 71.4, color: "#1B6B3A" },
    { label: "Grade 6B", mean: 64.9, color: "#1B6B3A" },
    { label: "Grade 3A", mean: 79.1, color: "#E67E22" },
  ];

  const competencyDist = [
    { code: "EE", label: "Exceeds Expectation", count: 18, pct: 23, color: "#1B6B3A", bg: "#E8F5EE" },
    { code: "ME", label: "Meets Expectation", count: 41, pct: 53, color: "#1A5F9C", bg: "#EBF3FB" },
    { code: "AE", label: "Approaching Expectation", count: 14, pct: 18, color: "#D35400", bg: "#FEF0E6" },
    { code: "BE", label: "Below Expectation", count: 5, pct: 6, color: "#C0392B", bg: "#FDEDEC" },
  ];

  const enrolledByLevel = CLASSES.map(cls => ({
    ...cls,
    count: STUDENTS.filter(s => s.gradeId === cls.id).length
  })).filter(cls => cls.count > 0);

  return (
    <div style={{ padding: "0 0 20px" }}>
      {/* CBC Path Header */}
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          border: "1px solid #E8EAF0",
          padding: "12px 18px",
          marginBottom: 18,
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
          overflowX: "auto",
        }}
      >
        <span style={{ fontSize: 10.5, color: "#8A8FA8", fontWeight: 600, marginRight: 4, whiteSpace: "nowrap" }}>
          CBC PATH:
        </span>
        {[
          { label: "Playgroup", color: "#E67E22", bg: "#FEF0E6" },
          { label: "PP1 · PP2", color: "#E67E22", bg: "#FEF0E6" },
          { label: "Grade 1–6", color: "#1B6B3A", bg: "#E8F5EE" },
          { label: "Grade 7–9 JSS", color: "#1A5F9C", bg: "#EBF3FB" },
          { label: "Grade 10–12 SS", color: "#6C3483", bg: "#F5EEF8" },
        ].map((path, idx) => (
          <span key={idx} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {idx > 0 && <span style={{ color: "#C04D0", fontSize: 12 }}>›</span>}
            <span
              style={{
                padding: "4px 12px",
                borderRadius: 20,
                fontSize: 11,
                fontWeight: 600,
                color: path.color,
                background: path.bg,
                border: `1px solid ${path.color}33`,
                whiteSpace: "nowrap",
              }}
            >
              {path.label}
            </span>
          </span>
        ))}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {[
            { label: "KPSEA · Gr 6", color: "#1B6B3A" },
            { label: "KJSEA · Gr 9", color: "#1A5F9C" },
            { label: "KSSE · Gr 12", color: "#6C3483" },
          ].map((exam, idx) => (
            <span
              key={idx}
              style={{
                padding: "3px 10px",
                borderRadius: 20,
                fontSize: 10.5,
                fontWeight: 700,
                color: "#fff",
                background: exam.color,
                whiteSpace: "nowrap",
              }}
            >
              {exam.label}
            </span>
          ))}
        </div>
      </div>

      {/* Stat Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 12,
          marginBottom: 18,
        }}
      >
        <StatCard
          label="Total Learners"
          value={totalStudents.toLocaleString()}
          sub={`${staffCount} staff members`}
          color="#1B6B3A"
          bg="#E8F5EE"
          icon="🎓"
        />
        <StatCard
          label="Fees Collected"
          value={`${collectionRate}%`}
          sub={`KES ${(totalPaid / 1000).toFixed(0)}K of ${(totalBilled / 1000).toFixed(0)}K`}
          color="#D4A017"
          bg="#FDF6E3"
          icon="💰"
        />
        <StatCard
          label="Outstanding"
          value={`KES ${(totalBalance / 1000).toFixed(0)}K`}
          sub={`${debtorsCount} learners in arrears`}
          color="#C0392B"
          bg="#FDEDEC"
          icon="⚠️"
        />
        <StatCard
          label="Active Staff"
          value={staffCount}
          sub={`${teachingStaff} teaching staff`}
          color="#1A5F9C"
          bg="#EBF3FB"
          icon="👩‍🏫"
        />
      </div>

      {/* Week Progress */}
      <div
        style={{
          background: "#fff",
          border: "1px solid #E8EAF0",
          borderRadius: 12,
          padding: "14px 18px",
          marginBottom: 18,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1A1A2E" }}>
            Term 1, 2026 — Week Progress
          </div>
          <div style={{ fontSize: 12, color: "#8A8FA8" }}>
            Week 9 of 13 · CAT 2 Due Next Week
          </div>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {Array.from({ length: 13 }, (_, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: 10,
                borderRadius: 3,
                background: i < 8 ? "#1B6B3A" : i === 8 ? "#D4A017" : "#F0F2F5",
                transition: "background 0.3s",
              }}
              title={`Week ${i + 1}`}
            />
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "#8A8FA8", marginTop: 6 }}>
          <span>Jan 6 (Term opens)</span>
          <span style={{ color: "#D4A017", fontWeight: 600 }}>▲ Wk 9 — CAT 2</span>
          <span>Apr 4 (End-term Exams)</span>
        </div>
      </div>

      {/* Charts Section */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 18 }}>
        <div style={{ background: "#fff", border: "1px solid #E8EAF0", borderRadius: 12, padding: "14px 18px" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1A1A2E", marginBottom: 14 }}>
            Class Mean Scores — CAT 1
          </div>
          {classMeanScores.map(cls => (
            <ProgressBar key={cls.label} label={cls.label} value={cls.mean} max={100} color={cls.color} />
          ))}
        </div>

        <div style={{ background: "#fff", border: "1px solid #E8EAF0", borderRadius: 12, padding: "14px 18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#1A1A2E" }}>CBC Competency Distribution</div>
            <span style={{ fontSize: 10.5, color: "#8A8FA8" }}>Grade 6 · Mathematics</span>
          </div>
          {competencyDist.map(item => (
            <div key={item.code} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, marginBottom: 4 }}>
                <span style={{ fontWeight: 600, color: item.color }}>
                  <span style={{ padding: "1px 7px", background: item.bg, borderRadius: 10, marginRight: 6 }}>
                    {item.code}
                  </span>
                  {item.label}
                </span>
                <span style={{ color: "#8A8FA8" }}>{item.count} learners · {item.pct}%</span>
              </div>
              <div style={{ height: 9, background: "#F0F2F5", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ width: `${item.pct}%`, height: "100%", background: item.color, borderRadius: 4 }} />
              </div>
            </div>
          ))}
          <div style={{ marginTop: 10, padding: "8px 10px", background: "#FDEDEC", borderRadius: 8, fontSize: 11, color: "#C0392B", border: "1px solid #F1948A" }}>
            5 learners in BE zone flagged for remedial support
          </div>
        </div>
      </div>

      {/* Lower Section */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 18 }}>
        {/* Subject Champions */}
        <div style={{ background: "#fff", border: "1px solid #E8EAF0", borderRadius: 12, padding: "14px 18px" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1A1A2E", marginBottom: 12 }}>
            Subject Champions — Grade 12
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                {["Subject", "Learner", "Score"].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "5px 6px", fontSize: 10, fontWeight: 700, color: "#8A8FA8", borderBottom: "1px solid #F0F2F5", textTransform: "uppercase" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ["Mathematics", "Achieng J.", 94],
                ["English", "Kamau B.", 91],
                ["Biology", "Wanjiku P.", 89],
                ["Physics", "Ochieng D.", 85],
                ["Kiswahili", "Muthoni R.", 83],
                ["Chemistry", "Nafula A.", 80],
              ].map(([sub, name, score]) => (
                <tr key={sub} style={{ borderBottom: "1px solid #F7F8FA" }}>
                  <td style={{ padding: "6px 6px", color: "#4A4A6A" }}>{sub}</td>
                  <td style={{ padding: "6px 6px", color: "#1A1A2E", fontWeight: 500 }}>{name}</td>
                  <td style={{ padding: "6px 6px" }}>
                    <span style={{ padding: "2px 8px", borderRadius: 10, fontSize: 10.5, fontWeight: 700, background: score >= 80 ? "#E8F5EE" : "#EBF3FB", color: score >= 80 ? "#1B6B3A" : "#1A5F9C" }}>
                      {score}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Fees Summary */}
        <div style={{ background: "#fff", border: "1px solid #E8EAF0", borderRadius: 12, padding: "14px 18px" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1A1A2E", marginBottom: 12 }}>
            Fees Collection Summary
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#1B6B3A", marginBottom: 4 }}>{collectionRate}%</div>
          <div style={{ fontSize: 11, color: "#8A8FA8", marginBottom: 10 }}>
            KES {(totalPaid / 1e6).toFixed(2)}M collected of KES {(totalBilled / 1e6).toFixed(2)}M billed
          </div>
          <div style={{ height: 10, background: "#F0F2F5", borderRadius: 5, marginBottom: 14, overflow: "hidden" }}>
            <div style={{ width: `${collectionRate}%`, height: "100%", background: "linear-gradient(90deg, #1B6B3A, #2ECC71)", borderRadius: 5 }} />
          </div>
          {[
            { label: "Paid in full", count: Math.round(totalStudents * 0.66), color: "#1B6B3A" },
            { label: "Partial payment", count: Math.round(totalStudents * 0.22), color: "#D4A017" },
            { label: "No payment yet", count: Math.round(totalStudents * 0.12), color: "#C0392B" },
          ].map(item => (
            <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7, fontSize: 11.5 }}>
              <div style={{ width: 9, height: 9, borderRadius: 2, background: item.color, flexShrink: 0 }} />
              <span style={{ color: "#4A4A6A", flex: 1 }}>{item.label}</span>
              <span style={{ fontWeight: 600, color: "#1A1A2E" }}>{item.count}</span>
            </div>
          ))}
          <div style={{ marginTop: 10, padding: "8px 10px", background: "#FDF6E3", borderRadius: 8, border: "1px solid #F0D090" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#D35400" }}>M-Pesa Paybill: 123456</div>
            <div style={{ fontSize: 10, color: "#8A8FA8", marginTop: 2 }}>KES {(totalBalance / 1000).toFixed(0)}K outstanding</div>
          </div>
        </div>

        {/* Quick Actions */}
        <div style={{ background: "#fff", border: "1px solid #E8EAF0", borderRadius: 12, padding: "14px 18px" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1A1A2E", marginBottom: 12 }}>Quick Actions</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[
              { icon: "📝", label: "Enter Marks", sub: "By subject" },
              { icon: "🗒️", label: "Report Cards", sub: "Generate PDF" },
              { icon: "📊", label: "Grand Analysis", sub: "School report" },
              { icon: "📱", label: "SMS Parents", sub: "Alerts & fees" },
              { icon: "🎓", label: "Admit Student", sub: "New enrolment" },
              { icon: "🚀", label: "New Term", sub: "Promote classes" },
            ].map(action => (
              <div
                key={action.label}
                style={{
                  padding: "10px",
                  border: "1px solid #E8EAF0",
                  borderRadius: 8,
                  cursor: "pointer",
                  transition: "all 0.15s",
                  background: "#FAFBFC",
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = "#1B6B3A";
                  e.currentTarget.style.background = "#E8F5EE";
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = "#E8EAF0";
                  e.currentTarget.style.background = "#FAFBFC";
                }}
              >
                <div style={{ fontSize: 16, marginBottom: 3 }}>{action.icon}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#1A1A2E" }}>{action.label}</div>
                <div style={{ fontSize: 10, color: "#8A8FA8" }}>{action.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Enrolment by Level */}
      <div style={{ background: "#fff", border: "1px solid #E8EAF0", borderRadius: 12, padding: "14px 18px", marginBottom: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#1A1A2E", marginBottom: 14 }}>
          Enrolment by Level
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {enrolledByLevel.map(cls => (
            <div
              key={cls.id}
              style={{
                padding: "8px 14px",
                background: cls.bg,
                borderRadius: 10,
                border: `1px solid ${cls.color}33`,
                textAlign: "center",
                minWidth: 80,
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: cls.color }}>{cls.name}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#1A1A2E" }}>{cls.count}</div>
              <div style={{ fontSize: 9.5, color: "#8A8FA8" }}>learners</div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      <div style={{ background: "#fff", border: "1px solid #E8EAF0", borderRadius: 12, padding: "14px 18px" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#1A1A2E", marginBottom: 12 }}>Recent Activity</div>
        {RECENT_ACTIVITY.map(act => (
          <div
            key={act.id}
            style={{
              display: "flex",
              gap: 10,
              padding: "9px 0",
              borderBottom: "1px solid #F7F8FA",
              alignItems: "flex-start",
            }}
          >
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: act.color, marginTop: 5, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12.5, color: "#1A1A2E", lineHeight: 1.4 }}>{act.text}</div>
              <div style={{ fontSize: 10.5, color: "#8A8FA8", marginTop: 2 }}>{act.time}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Dashboard;

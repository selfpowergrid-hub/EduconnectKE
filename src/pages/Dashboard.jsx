import React, { useMemo } from 'react';
import { STUDENTS, STAFF, getClassesByType, RECENT_ACTIVITY } from '../data/mockData';
import { StatCard } from '../components/common/StatCard';
import ProgressBar from '../components/common/ProgressBar';
import { PLANS } from '../lib/planConfig';

const Dashboard = ({ schoolConfig, currentPlan }) => {
  const planData = PLANS[currentPlan] || PLANS.starter;

  const currentTypeClasses = useMemo(() => {
    return getClassesByType(schoolConfig?.schoolType || "Primary");
  }, [schoolConfig]);

  const classIds = useMemo(() => currentTypeClasses.map(c => c.id), [currentTypeClasses]);

  const filteredStudents = useMemo(() => {
    return STUDENTS.filter(s => classIds.includes(s.gradeId));
  }, [classIds]);

  const totalStudents = filteredStudents.length;
  const staffCount = STAFF.length;
  const teachingStaff = STAFF.filter(s => s.type === "Teaching").length;
  
  const totalBilled = filteredStudents.reduce((acc, s) => acc + s.feeTotal, 0);
  const totalPaid = filteredStudents.reduce((acc, s) => acc + s.feePaid, 0);
  const totalBalance = filteredStudents.reduce((acc, s) => acc + s.feeBalance, 0);
  const collectionRate = totalBilled > 0 ? Math.round((totalPaid / totalBilled) * 100) : 0;
  const debtorsCount = filteredStudents.filter(s => s.feeBalance > 0).length;

  const classMeanScores = useMemo(() => {
    return currentTypeClasses.slice(0, 5).map(c => ({
      label: c.name,
      mean: 65 + Math.floor(Math.random() * 15),
      color: c.color === "#1B6B3A" ? "#cc785c" : c.color
    }));
  }, [currentTypeClasses]);

  const activeColor = "#cc785c";
  const ink = "#2a2421";
  const hairline = "#e6dfd8";

  return (
    <div style={{ paddingBottom: 40 }}>
      {/* Page Header */}
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 32, fontWeight: 700, color: ink, margin: 0, fontFamily: "'EB Garamond', serif" }}>School Dashboard</h2>
        <p style={{ color: "#8a8fa8", marginTop: 4, fontSize: 16 }}>Operational overview and academic performance indicators.</p>
      </div>

      {/* Plan Status Banner */}
      {currentPlan === 'starter' && (
        <div style={{
          background: 'linear-gradient(135deg, #2a2421, #3d3530)',
          borderRadius: 14, padding: '20px 24px', marginBottom: 24,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 16, color: '#fff',
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>
              {planData.icon} You're on the Starter Plan
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>
              Upgrade to Professional to unlock Exams, Reports, Fee Management, and more.
            </div>
          </div>
          <button style={{
            padding: '10px 24px', background: '#cc785c', color: '#fff',
            border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 800,
            cursor: 'pointer', boxShadow: '0 4px 12px rgba(204,120,92,0.3)',
            whiteSpace: 'nowrap', transition: 'all 0.2s',
          }}>
            Upgrade Now →
          </button>
        </div>
      )}

      {/* CBC Path Header */}
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          border: `1px solid ${hairline}`,
          padding: "16px 20px",
          marginBottom: 24,
          display: "flex",
          alignItems: "center",
          gap: 12,
          boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
          overflowX: "auto"
        }}
        className="sidebar-scroll"
      >
        <span style={{ fontSize: 11, color: ink, fontWeight: 800, marginRight: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          CBC PATH:
        </span>
        {[
          { label: "Playgroup", color: "#cc785c", bg: "#f5f2eb" },
          { label: "PP1 · PP2", color: "#cc785c", bg: "#f5f2eb" },
          { label: "Grade 1–6", color: "#cc785c", bg: "#f5f2eb" },
          { label: "Grade 7–9 JSS", color: "#cc785c", bg: "#f5f2eb" },
          { label: "Grade 10–12 SS", color: "#cc785c", bg: "#f5f2eb" },
        ].map((path, idx) => (
          <span key={idx} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {idx > 0 && <span style={{ color: hairline, fontSize: 14 }}>›</span>}
            <span
              style={{
                padding: "6px 14px",
                borderRadius: 20,
                fontSize: 12,
                fontWeight: 600,
                color: ink,
                background: "#fff",
                border: `1px solid ${hairline}`,
                whiteSpace: "nowrap",
              }}
            >
              {path.label}
            </span>
          </span>
        ))}
      </div>

      {/* Stat Cards */}
      <div
        className="stat-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <StatCard
          label="Total Learners"
          value={totalStudents.toLocaleString()}
          sub={`${staffCount} staff members`}
          color={activeColor}
          bg="#f5f2eb"
          icon="🎓"
        />
        <StatCard
          label="Fees Collected"
          value={`${collectionRate}%`}
          sub={`KES ${(totalPaid / 1000).toFixed(0)}K`}
          color={activeColor}
          bg="#f5f2eb"
          icon="💰"
        />
        <StatCard
          label="Outstanding"
          value={`KES ${(totalBalance / 1000).toFixed(0)}K`}
          sub={`${debtorsCount} in arrears`}
          color="#c0392b"
          bg="#fdf0ed"
          icon="⚠️"
        />
        <StatCard
          label="Active Staff"
          value={staffCount}
          sub={`${teachingStaff} teachers`}
          color="#2a2421"
          bg="#f5f2eb"
          icon="👥"
        />
      </div>

      {/* Charts & Activity */}
      <div 
        className="grid-2 grid-1"
        style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 24, marginBottom: 24 }}
      >
        <div style={{ background: "#fff", border: `1px solid ${hairline}`, borderRadius: 12, padding: "24px", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
          <h3 style={{ fontSize: 20, fontWeight: 600, color: ink, marginBottom: 20, fontFamily: "'EB Garamond', serif" }}>Class Mean Scores — CAT 1</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
            {classMeanScores.map(cls => (
              <ProgressBar key={cls.label} label={cls.label} value={cls.mean} max={100} color={cls.color} />
            ))}
          </div>
        </div>

        <div style={{ background: "#fff", border: `1px solid ${hairline}`, borderRadius: 12, padding: "24px", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
          <h3 style={{ fontSize: 20, fontWeight: 600, color: ink, marginBottom: 20, fontFamily: "'EB Garamond', serif" }}>Recent Activity</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {RECENT_ACTIVITY.map(act => (
              <div
                key={act.id}
                style={{
                  display: "flex",
                  gap: 12,
                  paddingBottom: 16,
                  borderBottom: `1px solid ${hairline}`,
                  alignItems: "flex-start",
                }}
              >
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: act.color === "#1B6B3A" ? activeColor : act.color, marginTop: 6, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 13, color: ink, lineHeight: 1.4, fontWeight: 500 }}>{act.text}</div>
                  <div style={{ fontSize: 11, color: "#8a8fa8", marginTop: 4 }}>{act.time}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div style={{ background: "#fff", border: `1px solid ${hairline}`, borderRadius: 12, padding: "24px", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
        <h3 style={{ fontSize: 20, fontWeight: 600, color: ink, marginBottom: 20, fontFamily: "'EB Garamond', serif" }}>Quick Administrative Actions</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12 }}>
          {[
            { icon: "📝", label: "Enter Marks" },
            { icon: "🗒️", label: "Reports" },
            { icon: "📊", label: "Analysis" },
            { icon: "📱", label: "SMS Alert" },
            { icon: "🎓", label: "Admission" },
            { icon: "🚀", label: "New Term" },
          ].map(action => (
            <button
              key={action.label}
              style={{
                padding: "20px 10px",
                border: `1px solid ${hairline}`,
                borderRadius: 12,
                cursor: "pointer",
                transition: "all 0.2s ease",
                background: "#fafafa",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = activeColor;
                e.currentTarget.style.background = "#fff";
                e.currentTarget.style.transform = "translateY(-2px)";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = hairline;
                e.currentTarget.style.background = "#fafafa";
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              <div style={{ fontSize: 24 }}>{action.icon}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: ink }}>{action.label}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;

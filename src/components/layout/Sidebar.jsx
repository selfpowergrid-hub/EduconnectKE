import React from 'react';

const navigation = [
  { section: "Overview" },
  { id: "dashboard", label: "Dashboard", icon: "⊞" },
  { section: "Academics" },
  { id: "students", label: "Students & Admission", icon: "🎓" },
  { id: "exams", label: "Examinations", icon: "📝" },
  { id: "reports", label: "Report Cards", icon: "📋" },
  { section: "Administration" },
  { id: "fees", label: "Fees Management", icon: "💳" },
  { id: "teachers", label: "Staff & Teachers", icon: "👩‍🏫" },
  { section: "System" },
  { id: "settings", label: "School Settings", icon: "⚙️" },
];

const Sidebar = ({ activeTab, setActiveTab, isCollapsed, setIsCollapsed, isMobileOpen }) => {
  return (
    <aside
      className={`sidebar-scroll sidebar-overlay ${isMobileOpen ? 'active' : ''}`}
      style={{
        width: isCollapsed ? 240 : 60,
        background: "linear-gradient(180deg, #0F4C2A 0%, #1B6B3A 60%, #1E7A42 100%)",
        display: "flex",
        flexDirection: "column",
        transition: "width 0.25s ease, transform 0.3s ease",
        overflow: "hidden",
        flexShrink: 0,
        position: "relative",
        zIndex: 1001,
        boxShadow: "4px 0 20px rgba(0,0,0,0.15)",
      }}
    >
      <div
        style={{
          padding: "18px 16px 14px",
          borderBottom: "1px solid rgba(255,255,255,0.1)",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div
          style={{
            width: 34,
            height: 34,
            background: "rgba(255,255,255,0.2)",
            borderRadius: 9,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 18,
            flexShrink: 0,
          }}
        >
          🇰🇪
        </div>
        {isCollapsed && (
          <div style={{ flex: 1, overflow: "hidden" }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#fff", letterSpacing: 0.5 }}>
              EduConnect
            </div>
            <div style={{ fontSize: 10, color: "#A8D5BA", fontWeight: 600 }}>
              SCHOOL MS
            </div>
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "12px 10px" }} className="sidebar-scroll">
        {navigation.map((item, index) => {
          if (item.section) {
            return isCollapsed ? (
              <div
                key={index}
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  color: "#8ABC9D",
                  textTransform: "uppercase",
                  padding: "16px 10px 8px",
                  letterSpacing: 1,
                }}
              >
                {item.section}
              </div>
            ) : (
              <div key={index} style={{ height: 20 }} />
            );
          }

          const isActive = activeTab === item.id;
          return (
            <div
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 12px",
                borderRadius: 10,
                cursor: "pointer",
                marginBottom: 4,
                transition: "all 0.2s",
                background: isActive ? "rgba(255,255,255,0.15)" : "transparent",
                color: isActive ? "#fff" : "#A8D5BA",
                position: "relative",
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.color = "#fff";
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.color = "#A8D5BA";
              }}
            >
              <div style={{ fontSize: 18, width: 20, textAlign: "center", flexShrink: 0 }}>
                {item.icon}
              </div>
              {isCollapsed && (
                <span style={{ fontSize: 13, fontWeight: isActive ? 600 : 500, whiteSpace: "nowrap" }}>
                  {item.label}
                </span>
              )}
              {isActive && (
                <div
                  style={{
                    position: "absolute",
                    left: -10,
                    width: 4,
                    height: 18,
                    background: "#F1C40F",
                    borderRadius: "0 4px 4px 0",
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      <div
        style={{
          padding: "12px",
          borderTop: "1px solid rgba(255,255,255,0.1)",
          background: "rgba(0,0,0,0.1)",
        }}
      >
        <div
          onClick={() => setIsCollapsed(!isCollapsed)}
          style={{
            height: 34,
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#A8D5BA",
            cursor: "pointer",
            transition: "all 0.2s",
            background: "rgba(255,255,255,0.05)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "#fff";
            e.currentTarget.style.background = "rgba(255,255,255,0.1)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "#A8D5BA";
            e.currentTarget.style.background = "rgba(255,255,255,0.05)";
          }}
        >
          {isCollapsed ? "« Collapse" : "»"}
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;

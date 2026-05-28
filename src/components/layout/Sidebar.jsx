import React, { useState } from 'react';
import { canAccessNav, PLANS } from '../../lib/planConfig';
import logo from '../../assets/logo.jpg';

const TEACHER_ALLOWED = new Set([
  'students',
  'exam-entries',
  'reports',
  'merit-list',
]);

const Sidebar = ({ activeId, onNavigate, schoolConfig, currentPlan, userEmail, onSignOut, isMobile, isOpen, onClose, role }) => {
  const isTeacher = role === 'teacher';
  const menuSections = [
    {
      title: "Administration",
      icon: "🏢",
      items: [
        { id: "registration-form", label: "School Registration", icon: "📝" },
        { id: "school-info", label: "School Information", icon: "ℹ️" },
        { id: "streams-dorms", label: "Streams & Dorms", icon: "🏘️" },
        { id: "students", label: "Students & Admission", icon: "🎓" },
        { id: "teachers", label: "Staff & Teachers", icon: "👥" },
        { id: "teacher-allocations", label: "Teacher Allocations", icon: "🧑‍🏫" },
      ]
    },
    {
      title: "Academics",
      icon: "📚",
      items: [
        { id: "exams", label: "Exam Settings", icon: "⚙️", module: "Examinations" },
        { id: "exam-entries", label: "Exam Entries", icon: "✍️", module: "Examinations" },
        { id: "subjects", label: "Subjects", icon: "📖", module: "Examinations" },
        { id: "grading", label: "Grading System", icon: "📊", module: "Examinations" },
      ]
    },

    {
      title: "Reports",
      icon: "📈",
      items: [
        { id: "reports", label: "Report Cards", icon: "📋" },
        { id: "merit-list", label: "Exam Marksheets", icon: "🔢" },
      ]
    },
    {
      title: "System",
      icon: "⚙️",
      items: [
        { id: "users", label: "Users & Roles", icon: "👤" },
      ]
    }
  ];

  const [collapsedSections, setCollapsedSections] = useState({});

  const toggleSection = (title) => {
    setCollapsedSections(prev => ({
      ...prev,
      [title]: !prev[title]
    }));
  };

  const isModuleEnabled = (moduleName) => {
    if (!moduleName) return true;
    if (!schoolConfig || !schoolConfig.modules) return true;
    return schoolConfig.modules.includes(moduleName);
  };

  const planData = PLANS[currentPlan] || PLANS.starter;

  const sidebarBg = "#2a2421";
  const activeColor = "#D4AF37";
  const textSecondary = "#a0a09a";
  const hairline = "rgba(230, 223, 216, 0.1)";

  const handleItemClick = (itemId) => {
    const allowed = canAccessNav(currentPlan, itemId);
    if (!allowed) {
      // Navigate anyway — the App will show PlanGate
    }
    onNavigate(itemId);
    if (isMobile) onClose();
  };

  // Get initials from email
  const initials = userEmail
    ? userEmail.split('@')[0].slice(0, 2).toUpperCase()
    : 'AD';

  return (
    <div 
      className={`sidebar-overlay ${isOpen ? 'active' : ''}`}
      style={{
        width: 280,
        background: sidebarBg,
        color: "#fff",
        display: "flex",
        flexDirection: "column",
        transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        height: "100vh",
        position: isMobile ? "fixed" : "relative",
        zIndex: 100,
        borderRight: `1px solid ${hairline}`
      }}
    >
      {/* Brand Header */}
      <div style={{ 
        padding: "32px 24px", 
        borderBottom: `1px solid ${hairline}`,
        display: "flex",
        alignItems: "center",
        gap: 12
      }}>
        <img src={logo} alt="LOGIQ Logo" style={{ 
          width: 36, 
          height: 36, 
          borderRadius: 8, 
          objectFit: 'cover',
          boxShadow: `0 4px 12px ${activeColor}44`
        }} />
        <div style={{ 
          fontFamily: "'EB Garamond', serif",
          fontSize: 22, 
          fontWeight: 700, 
          letterSpacing: "-0.02em",
          color: "#fff"
        }}>
          LOGIQ
        </div>
      </div>

      {/* Navigation */}
      <div 
        className="sidebar-scroll"
        style={{ 
          flex: 1, 
          overflowY: "auto", 
          padding: "24px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 8
        }}
      >
        {/* Dashboard Link */}
        <div
          onClick={() => handleItemClick("dashboard")}
          style={{
            padding: "12px 16px",
            borderRadius: 12,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 12,
            background: activeId === "dashboard" ? "rgba(204, 120, 92, 0.15)" : "transparent",
            color: activeId === "dashboard" ? activeColor : "#fff",
            fontWeight: activeId === "dashboard" ? 700 : 500,
            transition: "all 0.2s ease",
            marginBottom: 16
          }}
        >
          <span style={{ fontSize: 18 }}>🏠</span>
          <span style={{ fontSize: 14 }}>Dashboard</span>
        </div>

        {menuSections
          .map(section => ({
            ...section,
            items: section.items
              .filter(item => isModuleEnabled(item.module))
              .filter(item => !isTeacher || TEACHER_ALLOWED.has(item.id)),
          }))
          .filter(section => section.items.length > 0)
          .map((section) => (
          <div key={section.title} style={{ marginBottom: 4 }}>
            <div 
              onClick={() => toggleSection(section.title)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 16px",
                cursor: "pointer",
                borderRadius: 12,
                color: "#fff",
                transition: "all 0.2s ease",
                background: "rgba(255,255,255,0.02)"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 16 }}>{section.icon}</span>
                <span style={{ 
                  fontFamily: "'EB Garamond', serif",
                  fontSize: 17, 
                  fontWeight: 700,
                  letterSpacing: "0.01em"
                }}>
                  {section.title}
                </span>
              </div>
              <span style={{ 
                fontSize: 10, 
                transition: "transform 0.3s ease",
                transform: collapsedSections[section.title] ? "rotate(-90deg)" : "rotate(0deg)",
                opacity: 0.5
              }}>
                ▼
              </span>
            </div>

            <div style={{ 
              maxHeight: collapsedSections[section.title] ? 0 : 1000,
              overflow: "hidden",
              transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
              paddingLeft: 12,
              marginTop: 4
            }}>
              {section.items.map((item) => {
                  const allowed = canAccessNav(currentPlan, item.id);
                  return (
                    <div
                      key={item.id}
                      onClick={() => handleItemClick(item.id)}
                      style={{
                        padding: "10px 16px",
                        margin: "2px 0",
                        borderRadius: 10,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        fontSize: 13.5,
                        color: !allowed
                          ? "rgba(160,160,154,0.5)"
                          : activeId === item.id ? activeColor : textSecondary,
                        background: activeId === item.id ? "rgba(204, 120, 92, 0.1)" : "transparent",
                        fontWeight: activeId === item.id ? 700 : 500,
                        transition: "all 0.2s ease",
                      }}
                      className="sidebar-item"
                    >
                      <span style={{ opacity: activeId === item.id ? 1 : allowed ? 0.7 : 0.3 }}>
                        {item.icon}
                      </span>
                      <span style={{ flex: 1 }}>{item.label}</span>
                      {!allowed && (
                        <span style={{ fontSize: 12, opacity: 0.5 }}>🔒</span>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        ))}
      </div>

      {/* Plan Badge hidden as per request */}
      {/* 
      <div style={{
        padding: "12px 24px",
        borderTop: `1px solid ${hairline}`,
      }}>
        <div style={{
          padding: "10px 14px",
          borderRadius: 10,
          background: `${planData.color}15`,
          border: `1px solid ${planData.color}30`,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}>
          <span style={{ fontSize: 14 }}>{planData.icon}</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: planData.color }}>
              {planData.name} Plan
            </div>
            <div style={{ fontSize: 10, color: textSecondary }}>
              {planData.price === 0 ? 'Free' : planData.label}
            </div>
          </div>
        </div>
      </div>
      */}

      {/* User Footer */}
      <div style={{ 
        padding: "16px 24px 24px", 
        borderTop: `1px solid ${hairline}`,
        display: "flex",
        alignItems: "center",
        gap: 12
      }}>
        <div style={{ 
          width: 32, 
          height: 32, 
          borderRadius: 8, 
          background: activeColor,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          fontWeight: 800,
          color: "#fff",
        }}>
          {initials}
        </div>
        <div style={{ overflow: "hidden", flex: 1 }}>
          <div style={{
            fontSize: 13, fontWeight: 700, color: "#fff",
            whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden",
          }}>
            {schoolConfig?.schoolName || 'Administrator'}
          </div>
          <div style={{
            fontSize: 11, color: textSecondary,
            whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden",
          }}>
            {userEmail || 'admin@educonnect.com'}
          </div>
        </div>
        <button
          onClick={onSignOut}
          title="Sign Out"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 16, opacity: 0.5, padding: 4,
            transition: 'opacity 0.2s',
          }}
          onMouseEnter={e => e.target.style.opacity = 1}
          onMouseLeave={e => e.target.style.opacity = 0.5}
        >
          🚪
        </button>
      </div>
    </div>
  );
};

export default Sidebar;

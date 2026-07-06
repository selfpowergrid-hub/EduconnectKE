import React, { useState } from 'react';
import { canAccessNav } from '../../lib/planConfig';
import { MODULES } from '../../lib/modules';
import logo from '../../assets/logo.jpg';

// Presentational sidebar. Nav structure (sections + dashboard) and the module
// accent are computed by App from the module registry and passed in; this
// component only renders + handles the module switcher.
const Sidebar = ({
  activeId, onNavigate, schoolConfig, currentPlan, userEmail, onSignOut,
  isMobile, isOpen, onClose,
  dashboardItem, navSections = [], accent = '#1B6B3A',
  availableModules = [], activeModule, onSwitchModule,
}) => {
  const [collapsedSections, setCollapsedSections] = useState({});

  const toggleSection = (title) => {
    setCollapsedSections(prev => ({ ...prev, [title]: !prev[title] }));
  };

  const sidebarBg = "#2a2421";
  const activeColor = accent;
  const textSecondary = "#a0a09a";
  const hairline = "rgba(230, 223, 216, 0.1)";

  const handleItemClick = (itemId) => {
    onNavigate(itemId);
    if (isMobile) onClose();
  };

  const initials = userEmail ? userEmail.split('@')[0].slice(0, 2).toUpperCase() : 'AD';
  const showSwitcher = availableModules.length > 1;

  return (
    <div
      className={`sidebar-overlay ${isOpen ? 'active' : ''}`}
      style={{
        width: 280, background: sidebarBg, color: "#fff",
        display: "flex", flexDirection: "column",
        transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        height: "100vh", position: isMobile ? "fixed" : "relative",
        zIndex: 100, borderRight: `1px solid ${hairline}`,
      }}
    >
      {/* Brand Header */}
      <div style={{ padding: "28px 24px 20px", borderBottom: `1px solid ${hairline}`, display: "flex", alignItems: "center", gap: 12 }}>
        <img src={logo} alt="LOGIQ Logo" style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover', boxShadow: `0 4px 12px ${activeColor}44` }} />
        <div style={{ fontFamily: "'EB Garamond', serif", fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", color: "#fff" }}>
          LOGIQ
        </div>
      </div>

      {/* Module Switcher (only when the user has more than one module) */}
      {showSwitcher && (
        <div style={{ padding: "14px 16px", borderBottom: `1px solid ${hairline}` }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: textSecondary, letterSpacing: "0.12em", marginBottom: 8, paddingLeft: 4 }}>
            MODULE
          </div>
          <div style={{ display: "flex", gap: 6, background: "rgba(255,255,255,0.04)", padding: 4, borderRadius: 12 }}>
            {availableModules.map((key) => {
              const m = MODULES[key];
              if (!m) return null;
              const isActive = key === activeModule;
              return (
                <button
                  key={key}
                  onClick={() => onSwitchModule?.(key)}
                  style={{
                    flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    padding: "9px 8px", borderRadius: 9, border: "none", cursor: "pointer",
                    fontSize: 12.5, fontWeight: 700, transition: "all 0.18s ease",
                    background: isActive ? m.accent : "transparent",
                    color: isActive ? "#fff" : textSecondary,
                  }}
                >
                  <span style={{ fontSize: 14 }}>{m.icon}</span>
                  {m.shortLabel}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="sidebar-scroll" style={{ flex: 1, overflowY: "auto", padding: "20px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
        {/* Dashboard Link */}
        {dashboardItem && (
          <div
            onClick={() => handleItemClick(dashboardItem.id)}
            style={{
              padding: "12px 16px", borderRadius: 12, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 12,
              background: activeId === dashboardItem.id ? `${activeColor}26` : "transparent",
              color: activeId === dashboardItem.id ? activeColor : "#fff",
              fontWeight: activeId === dashboardItem.id ? 700 : 500,
              transition: "all 0.2s ease", marginBottom: 8,
            }}
          >
            <span style={{ fontSize: 18 }}>{dashboardItem.icon}</span>
            <span style={{ fontSize: 14 }}>{dashboardItem.label}</span>
          </div>
        )}

        {navSections.map((section) => (
          <div key={section.title} style={{ marginBottom: 4 }}>
            <div
              onClick={() => toggleSection(section.title)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "12px 16px", cursor: "pointer", borderRadius: 12, color: "#fff",
                transition: "all 0.2s ease", background: "rgba(255,255,255,0.02)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 16 }}>{section.icon}</span>
                <span style={{ fontFamily: "'EB Garamond', serif", fontSize: 17, fontWeight: 700, letterSpacing: "0.01em" }}>
                  {section.title}
                </span>
              </div>
              <span style={{ fontSize: 10, transition: "transform 0.3s ease", transform: collapsedSections[section.title] ? "rotate(-90deg)" : "rotate(0deg)", opacity: 0.5 }}>
                ▼
              </span>
            </div>

            <div style={{ maxHeight: collapsedSections[section.title] ? 0 : 1000, overflow: "hidden", transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)", paddingLeft: 12, marginTop: 4 }}>
              {section.items.map((item) => {
                const allowed = canAccessNav(currentPlan, item.id);
                return (
                  <div
                    key={item.id}
                    onClick={() => handleItemClick(item.id)}
                    style={{
                      padding: "10px 16px", margin: "2px 0", borderRadius: 10, cursor: "pointer",
                      display: "flex", alignItems: "center", gap: 12, fontSize: 13.5,
                      color: !allowed ? "rgba(160,160,154,0.5)" : activeId === item.id ? activeColor : textSecondary,
                      background: activeId === item.id ? `${activeColor}1a` : "transparent",
                      fontWeight: activeId === item.id ? 700 : 500,
                      transition: "all 0.2s ease",
                    }}
                    className="sidebar-item"
                  >
                    <span style={{ opacity: activeId === item.id ? 1 : allowed ? 0.7 : 0.3 }}>{item.icon}</span>
                    <span style={{ flex: 1 }}>{item.label}</span>
                    {!allowed && <span style={{ fontSize: 12, opacity: 0.5 }}>🔒</span>}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* User Footer */}
      <div style={{ padding: "16px 24px 24px", borderTop: `1px solid ${hairline}`, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: activeColor, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: "#fff" }}>
          {initials}
        </div>
        <div style={{ overflow: "hidden", flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>
            {schoolConfig?.schoolName || 'Administrator'}
          </div>
          <div style={{ fontSize: 11, color: textSecondary, whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>
            {userEmail || 'admin@educonnect.com'}
          </div>
        </div>
        <button
          onClick={onSignOut}
          title="Sign Out"
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, opacity: 0.5, padding: 4, transition: 'opacity 0.2s' }}
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

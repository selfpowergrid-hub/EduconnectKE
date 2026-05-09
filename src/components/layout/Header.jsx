import React, { useState } from 'react';
import { PLANS } from '../../lib/planConfig';

const Header = ({ onMenuClick, activePageLabel, userEmail, currentPlan, onSignOut }) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const planData = PLANS[currentPlan] || PLANS.starter;
  const initials = userEmail
    ? userEmail.split('@')[0].slice(0, 2).toUpperCase()
    : 'AD';

  return (
    <header style={{
      height: 72,
      background: "#fff",
      borderBottom: "1px solid #e6dfd8",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 32px",
      position: "sticky",
      top: 0,
      zIndex: 90
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <button 
          onClick={onMenuClick}
          className="show-mobile"
          style={{
            background: "none",
            border: "none",
            fontSize: 24,
            cursor: "pointer",
            color: "#2a2421"
          }}
        >
          ☰
        </button>
        <h1 style={{ 
          fontSize: 24, 
          fontWeight: 600, 
          color: "#2a2421", 
          margin: 0,
          fontFamily: "'EB Garamond', serif"
        }}>
          {activePageLabel}
        </h1>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {/* Plan Badge */}
        <div style={{
          padding: "5px 12px", borderRadius: 20,
          background: planData.bg, color: planData.color,
          fontSize: 11, fontWeight: 800,
          letterSpacing: "0.03em",
          display: "flex", alignItems: "center", gap: 5,
        }}>
          <span>{planData.icon}</span> {planData.name}
        </div>
        
        <button style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", opacity: 0.7 }}>🔔</button>
        
        {/* User Avatar + Dropdown */}
        <div style={{ position: "relative" }}>
          <div
            onClick={() => setShowDropdown(!showDropdown)}
            style={{ 
              width: 36, 
              height: 36, 
              borderRadius: "50%", 
              background: "#cc785c", 
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              fontSize: 13,
              border: "2px solid #fff",
              boxShadow: "0 0 0 1px #e6dfd8",
              cursor: "pointer",
              transition: "box-shadow 0.2s",
            }}
          >
            {initials}
          </div>

          {/* Dropdown Menu */}
          {showDropdown && (
            <>
              <div
                onClick={() => setShowDropdown(false)}
                style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 98 }}
              />
              <div style={{
                position: "absolute", top: 44, right: 0, zIndex: 99,
                background: "#fff", border: "1px solid #e6dfd8", borderRadius: 12,
                boxShadow: "0 8px 32px rgba(0,0,0,0.1)", padding: "8px 0",
                minWidth: 220, overflow: "hidden",
              }}>
                {/* User info */}
                <div style={{ padding: "12px 16px", borderBottom: "1px solid #f0f0f0" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#2a2421" }}>
                    {userEmail?.split('@')[0] || 'Administrator'}
                  </div>
                  <div style={{ fontSize: 11, color: "#8a8fa8", marginTop: 2 }}>
                    {userEmail || 'admin@educonnect.com'}
                  </div>
                </div>
                {/* Plan info */}
                <div style={{ padding: "12px 16px", borderBottom: "1px solid #f0f0f0" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#8a8fa8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
                    Current Plan
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, color: planData.color }}>
                    <span>{planData.icon}</span> {planData.name}
                    <span style={{ fontSize: 11, color: "#8a8fa8", fontWeight: 500 }}>
                      ({planData.price === 0 ? 'Free' : planData.label})
                    </span>
                  </div>
                </div>
                {/* Sign out */}
                <button
                  onClick={() => { setShowDropdown(false); onSignOut(); }}
                  style={{
                    width: "100%", padding: "12px 16px",
                    background: "none", border: "none", cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 8,
                    fontSize: 13, fontWeight: 600, color: "#C0392B",
                    transition: "background 0.2s",
                    textAlign: "left",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = "#fdf0ed"}
                  onMouseLeave={e => e.currentTarget.style.background = "none"}
                >
                  🚪 Sign Out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;

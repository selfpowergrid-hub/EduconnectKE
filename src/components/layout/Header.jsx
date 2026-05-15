import React, { useState } from 'react';
import { PLANS } from '../../lib/planConfig';

const Header = ({ onMenuClick, activePageLabel, userEmail, currentPlan, onSignOut, studentCount = 0 }) => {
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
        {/* User Avatar + Dropdown */}
        <div style={{ position: "relative" }}>
          <div
            onClick={() => setShowDropdown(!showDropdown)}
            style={{ 
              width: 36, 
              height: 36, 
              borderRadius: "50%", 
              background: "#D4AF37", 
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
                minWidth: 260, overflow: "hidden",
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

                {/* Subscription info */}
                <div style={{ padding: "16px", borderBottom: "1px solid #f0f0f0", background: "#fcfcfc" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#8a8fa8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                    Subscription Details
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 12, color: "#4A4A6A" }}>Current Students:</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#1B6B3A" }}>{studentCount}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 12, color: "#4A4A6A" }}>Annual Cost:</span>
                      <span style={{ fontSize: 14, fontWeight: 800, color: "#D4AF37" }}>
                        KES {(studentCount <= 300 ? studentCount * 35 : (300 * 35) + (studentCount - 300) * 20).toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <div style={{ marginTop: 8, fontSize: 10, color: "#8a8fa8", fontStyle: "italic" }}>
                    * Pricing: 35/student (first 300), then 20/student.
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

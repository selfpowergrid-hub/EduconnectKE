import React from 'react';
import { SCHOOL_NAME, CURRENT_TERM, CURRENT_YEAR } from '../../data/mockData';

const Header = ({ activeTabLabel, toggleMobileMenu }) => {
  return (
    <header
      style={{
        background: "#fff",
        height: 64,
        display: "flex",
        alignItems: "center",
        padding: "0 16px",
        borderBottom: "1px solid #E8EAF0",
        justifyContent: "space-between",
        flexShrink: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          onClick={toggleMobileMenu}
          className="show-mobile"
          style={{
            background: "none",
            border: "none",
            fontSize: 24,
            cursor: "pointer",
            padding: 4,
            display: "none",
          }}
        >
          ☰
        </button>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <h1 style={{ fontSize: 18, fontWeight: 800, color: "#1A1A2E", margin: 0 }}>
            {activeTabLabel}
          </h1>
          <div className="hide-mobile" style={{ fontSize: 11, color: "#8A8FA8", fontWeight: 600 }}>
            {SCHOOL_NAME} · {CURRENT_TERM.toUpperCase()} {CURRENT_YEAR}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <div style={{ position: "relative", cursor: "pointer" }}>
          <span style={{ fontSize: 18 }}>🔔</span>
          <div
            style={{
              position: "absolute",
              top: -2,
              right: -2,
              width: 8,
              height: 8,
              background: "#E74C3C",
              borderRadius: "50%",
              border: "2px solid #fff",
            }}
          />
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "6px 12px",
            background: "#FAFBFC",
            borderRadius: 10,
            border: "1px solid #E8EAF0",
            cursor: "pointer",
          }}
        >
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#1A1A2E" }}>
              Admin User
            </div>
            <div style={{ fontSize: 10, color: "#8A8FA8", fontWeight: 600 }}>
              Principal
            </div>
          </div>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: "#1B6B3A",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            AD
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;

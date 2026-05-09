import React from 'react';

export const StatCard = ({ label, value, sub, color = "#D4AF37", bg = "#f5f2eb", icon }) => {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e6dfd8",
        borderRadius: 12,
        padding: "20px",
        boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
        position: "relative",
        overflow: "hidden"
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <div style={{ fontSize: 11, color: "#2a2421", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
        <div
          style={{
            width: 32,
            height: 32,
            background: bg,
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 16,
            border: "1px solid #e6dfd8"
          }}
        >
          {icon}
        </div>
      </div>
      <div
        style={{
          fontSize: 32,
          fontWeight: 700,
          color: "#2a2421",
          lineHeight: 1,
          fontFamily: "'EB Garamond', serif"
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 13, color: "#8a8fa8", marginTop: 8, fontWeight: 500 }}>{sub}</div>
    </div>
  );
};

import React from 'react';

export const StatCard = ({ label, value, sub, color = "#1B6B3A", bg = "#E8F5EE", icon }) => {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #E8EAF0",
        borderRadius: 12,
        padding: "14px 16px",
        borderTop: `3px solid ${color}`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <div style={{ fontSize: 11, color: "#8A8FA8", fontWeight: 500 }}>{label}</div>
        <div
          style={{
            width: 30,
            height: 30,
            background: bg,
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
          }}
        >
          {icon}
        </div>
      </div>
      <div
        style={{
          fontSize: 26,
          fontWeight: 700,
          color: "#1A1A2E",
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 11, color: "#8A8FA8", marginTop: 5 }}>{sub}</div>
    </div>
  );
};

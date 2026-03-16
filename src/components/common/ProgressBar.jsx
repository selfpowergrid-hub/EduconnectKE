import React from 'react';

const ProgressBar = ({ label, value, max, color }) => {
  const percentage = Math.round((value / max) * 100);
  return (
    <div style={{ marginBottom: 10 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 12,
          marginBottom: 4,
        }}
      >
        <span style={{ color: "#4A4A6A", fontWeight: 500 }}>{label}</span>
        <span style={{ color: "#1A1A2E", fontWeight: 600 }}>{value.toFixed(1)}</span>
      </div>
      <div
        style={{
          height: 7,
          background: "#F0F2F5",
          borderRadius: 4,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${percentage}%`,
            height: "100%",
            background: color,
            borderRadius: 4,
            transition: "width 0.5s",
          }}
        />
      </div>
    </div>
  );
};

export default ProgressBar;

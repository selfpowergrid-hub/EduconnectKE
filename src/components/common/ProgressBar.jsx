import React from 'react';

const ProgressBar = ({ label, value, max, color }) => {
  const percentage = Math.round((value / max) * 100);
  const barColor = color === "#1B6B3A" ? "#D4AF37" : color; // Override green with terracotta

  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 13,
          marginBottom: 6,
        }}
      >
        <span style={{ color: "#2a2421", fontWeight: 600 }}>{label}</span>
        <span style={{ color: "#8a8fa8", fontWeight: 700, fontFamily: "'EB Garamond', serif", fontSize: 15 }}>{value.toFixed(1)}</span>
      </div>
      <div
        style={{
          height: 6,
          background: "#f5f2eb",
          borderRadius: 10,
          overflow: "hidden",
          border: "1px solid #e6dfd8"
        }}
      >
        <div
          style={{
            width: `${percentage}%`,
            height: "100%",
            background: barColor,
            borderRadius: 10,
            transition: "width 0.8s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        />
      </div>
    </div>
  );
};

export default ProgressBar;

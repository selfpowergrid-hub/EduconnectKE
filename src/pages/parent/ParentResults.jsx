import React from 'react';

// Read-only exam results for one child. `results` is the array built by the
// parent-portal edge function: one entry per exam, each with a subject list
// and totals.
const ParentResults = ({ results }) => {
  if (!results || results.length === 0) {
    return (
      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #ece5db', padding: 32, textAlign: 'center', color: '#8a8fa8', fontSize: 14 }}>
        No results have been published yet.
      </div>
    );
  }

  const pct = (score, total) => (total > 0 ? Math.round((score / total) * 100) : null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {results.map((exam) => {
        const percent = pct(exam.total_score, exam.total_possible);
        return (
          <div key={exam.exam_id} style={{ background: '#fff', borderRadius: 14, border: '1px solid #ece5db', overflow: 'hidden' }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8,
              padding: '14px 18px', borderBottom: '1px solid #f0ece3', background: '#faf8f3',
            }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#2a2421' }}>{exam.exam_name}</div>
                {exam.term && <div style={{ fontSize: 12, color: '#8a8fa8', marginTop: 2 }}>{exam.term}</div>}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#1B6B3A' }}>
                  {exam.total_score} / {exam.total_possible}
                </div>
                {percent !== null && <div style={{ fontSize: 12, color: '#8a8fa8', fontWeight: 600 }}>{percent}%</div>}
              </div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
              <thead>
                <tr style={{ background: '#fff', borderBottom: '1px solid #f0ece3' }}>
                  <th style={th}>Subject</th>
                  <th style={{ ...th, textAlign: 'right' }}>Score</th>
                </tr>
              </thead>
              <tbody>
                {exam.subjects.map((s, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f7f5f0' }}>
                    <td style={{ padding: '10px 18px', color: '#2a2421', fontWeight: 600 }}>{s.subject}</td>
                    <td style={{ padding: '10px 18px', textAlign: 'right', fontWeight: 700, color: '#4A4A6A' }}>
                      {s.score} <span style={{ color: '#b8b2a6', fontWeight: 500 }}>/ {s.total_marks}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
};

const th = { padding: '10px 18px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#8a8fa8', textTransform: 'uppercase', letterSpacing: '0.04em' };

export default ParentResults;

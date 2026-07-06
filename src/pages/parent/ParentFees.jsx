import React from 'react';

const kes = (n) => `KES ${Number(n || 0).toLocaleString()}`;

// Read-only fee statement for one child. `fees` is the get_student_fee_summary()
// JSON returned by the parent-portal edge function: billed (boarder/day aware),
// paid, concessions with labelled lines ("Bursary — County of ..."), balance,
// and the payment history with receipt numbers.
const ParentFees = ({ fees, year, school, child }) => {
  if (!fees) {
    return (
      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #ece5db', padding: 32, textAlign: 'center', color: '#8a8fa8', fontSize: 14 }}>
        No fee structure has been set for {year || 'this year'} yet.
      </div>
    );
  }

  const balance = Number(fees.balance || 0);
  const concessions = Number(fees.concessions || 0);
  const payments = fees.payments || [];
  const concessionItems = fees.concession_items || [];

  // Printable statement (FR-8.3): parents print or save-as-PDF from the
  // browser dialog. Chronology: billed terms, concessions, then payments.
  const printStatement = () => {
    const w = window.open('', '_blank');
    if (!w) { alert('Allow pop-ups to download the statement.'); return; }
    const payRows = payments.map(p => `
      <tr>
        <td>${p.paid_at ? new Date(p.paid_at).toLocaleDateString() : '—'}</td>
        <td>${p.receipt_no || '—'}</td>
        <td>${(p.method || '—').toUpperCase()}${p.reference ? ` · ${p.reference}` : ''}</td>
        <td class="num">${Number(p.amount).toLocaleString()}</td>
      </tr>`).join('');
    const concRows = concessionItems.map(c => `
      <tr>
        <td>${c.date ? new Date(c.date).toLocaleDateString() : '—'}</td>
        <td colspan="2">${c.label}</td>
        <td class="num">${Number(c.amount).toLocaleString()}</td>
      </tr>`).join('');
    w.document.write(`<!doctype html><html><head><title>Fee Statement — ${child?.name || ''}</title><style>
      body { font-family: Arial, sans-serif; font-size: 12px; color: #111; margin: 24px; }
      h2 { margin: 0 0 2px; text-align: center; }
      .sub { text-align: center; color: #555; margin: 0 0 16px; font-size: 11px; }
      .who { margin-bottom: 14px; font-size: 12.5px; }
      h4 { margin: 18px 0 6px; font-size: 12px; text-transform: uppercase; color: #444; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #bbb; padding: 5px 8px; text-align: left; }
      th { background: #f0f0f0; font-size: 10px; text-transform: uppercase; }
      .num { text-align: right; font-family: 'Courier New', monospace; }
      .total { font-weight: bold; background: #fafafa; }
      @media print { .noprint { display: none; } }
    </style></head><body>
      <h2>${school?.name || 'School'}</h2>
      <p class="sub">STUDENT FEE STATEMENT · ${fees.year || year} · generated ${new Date().toLocaleString()}</p>
      <div class="who">
        <strong>${child?.name || ''}</strong> · ADM ${child?.adm_no || ''} · ${child?.grade || ''}${child?.stream ? ` · ${child.stream}` : ''}
        ${fees.is_boarder ? ' · Boarder' : ' · Day scholar'}
      </div>
      <h4>Billed</h4>
      <table>
        <tr><th>Term 1</th><th>Term 2</th><th>Term 3</th><th>Total Billed</th></tr>
        <tr>
          <td class="num">${Number(fees.billed_t1).toLocaleString()}</td>
          <td class="num">${Number(fees.billed_t2).toLocaleString()}</td>
          <td class="num">${Number(fees.billed_t3).toLocaleString()}</td>
          <td class="num total">${Number(fees.billed).toLocaleString()}</td>
        </tr>
      </table>
      ${concessionItems.length ? `<h4>Bursaries, Discounts & Waivers</h4>
      <table>
        <tr><th>Date</th><th colspan="2">Detail</th><th>Amount (KES)</th></tr>
        ${concRows}
        <tr class="total"><td colspan="3">Total concessions</td><td class="num">${concessions.toLocaleString()}</td></tr>
      </table>` : ''}
      <h4>Payments</h4>
      <table>
        <tr><th>Date</th><th>Receipt No</th><th>Method</th><th>Amount (KES)</th></tr>
        ${payRows || '<tr><td colspan="4">No payments recorded.</td></tr>'}
        <tr class="total"><td colspan="3">Total paid</td><td class="num">${Number(fees.paid).toLocaleString()}</td></tr>
      </table>
      <h4>Closing Balance</h4>
      <table>
        <tr class="total">
          <td>Billed ${Number(fees.billed).toLocaleString()} − Paid ${Number(fees.paid).toLocaleString()}${concessions ? ` − Concessions ${concessions.toLocaleString()}` : ''}</td>
          <td class="num" style="font-size:14px;">KES ${balance.toLocaleString()}</td>
        </tr>
      </table>
      <p style="font-size:10px;color:#666;margin-top:14px;">This statement is system-generated from ${school?.name || 'the school'}'s fee records via EduConnect KE. For queries contact the school's finance office.</p>
      <div class="noprint" style="text-align:center;margin-top:14px;">
        <button onclick="window.print()" style="padding:8px 24px;">Print / Save as PDF</button>
      </div>
    </body></html>`);
    w.document.close();
    w.focus();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: concessions > 0 ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: 12 }}>
        <SummaryCard label="Billed" value={kes(fees.billed)} color="#4A4A6A" />
        <SummaryCard label="Paid" value={kes(fees.paid)} color="#1B6B3A" />
        {concessions > 0 && <SummaryCard label="Bursaries & Discounts" value={kes(concessions)} color="#6C3483" />}
        <SummaryCard
          label="Balance"
          value={kes(balance)}
          color={balance > 0 ? '#C0392B' : '#1B6B3A'}
          highlight
        />
      </div>

      {/* Statement download */}
      <button onClick={printStatement} style={{
        padding: '13px', borderRadius: 10, border: 'none', cursor: 'pointer',
        fontSize: 14, fontWeight: 700, background: '#1A5F9C', color: '#fff',
        boxShadow: '0 2px 8px rgba(26,95,156,0.25)',
      }}>
        🧾 Download Full Statement (PDF)
      </button>

      {/* Term breakdown */}
      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #ece5db', padding: '14px 18px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#8a8fa8', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>
          Billed by term ({fees.year || year}){fees.is_boarder ? ' · Boarder' : ''}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          {[['Term 1', fees.billed_t1], ['Term 2', fees.billed_t2], ['Term 3', fees.billed_t3]].map(([label, v]) => (
            <div key={label} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#8a8fa8', fontWeight: 600 }}>{label}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#2a2421', marginTop: 2 }}>{kes(v)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Bursaries & discounts — distinct labelled lines (PRD AC-7) */}
      {concessionItems.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #ece5db', overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #f0ece3', fontSize: 15, fontWeight: 800, color: '#2a2421' }}>
            🎁 Bursaries &amp; Discounts
          </div>
          {concessionItems.map((c, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '11px 18px', borderBottom: '1px solid #f7f5f0' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: '#2a2421' }}>{c.label}</div>
                <div style={{ fontSize: 11, color: '#8a8fa8' }}>{c.date ? new Date(c.date).toLocaleDateString() : ''}</div>
              </div>
              <div style={{ fontWeight: 800, color: '#6C3483', whiteSpace: 'nowrap' }}>− {kes(c.amount)}</div>
            </div>
          ))}
        </div>
      )}

      {/* Payment history */}
      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #ece5db', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #f0ece3', fontSize: 15, fontWeight: 800, color: '#2a2421' }}>
          Payment History
        </div>
        {payments.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#8a8fa8', fontSize: 13.5 }}>No payments recorded yet.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead>
              <tr style={{ background: '#faf8f3', borderBottom: '1px solid #f0ece3' }}>
                <th style={th}>Date</th>
                <th style={th}>Receipt</th>
                <th style={{ ...th, textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} style={{ borderBottom: '1px solid #f7f5f0' }}>
                  <td style={{ padding: '10px 18px', color: '#4A4A6A' }}>
                    {p.paid_at ? new Date(p.paid_at).toLocaleDateString() : '—'}
                    <div style={{ fontSize: 11, color: '#b8b2a6', textTransform: 'capitalize' }}>
                      {p.method || '—'}{p.reference ? ` (${p.reference})` : ''}
                    </div>
                  </td>
                  <td style={{ padding: '10px 18px', color: '#1A5F9C', fontFamily: 'monospace', fontSize: 12 }}>
                    {p.receipt_no || '—'}
                  </td>
                  <td style={{ padding: '10px 18px', textAlign: 'right', fontWeight: 700, color: '#1B6B3A' }}>{kes(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

const SummaryCard = ({ label, value, color, highlight }) => (
  <div style={{
    background: '#fff', borderRadius: 14, border: highlight ? `1.5px solid ${color}` : '1px solid #ece5db',
    padding: '16px 14px', textAlign: 'center',
  }}>
    <div style={{ fontSize: 11, color: '#8a8fa8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
    <div style={{ fontSize: 17, fontWeight: 800, color, marginTop: 6 }}>{value}</div>
  </div>
);

const th = { padding: '10px 18px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#8a8fa8', textTransform: 'uppercase', letterSpacing: '0.04em' };

export default ParentFees;

import React from 'react';

const kes = (n) => `KES ${Number(n || 0).toLocaleString()}`;

// Read-only fee statement for one child. `fees` is the get_student_fee_summary()
// JSON returned by the parent-portal edge function: billed (boarder/day aware),
// paid, concessions with labelled lines ("Bursary — County of ..."), balance,
// and the payment history with receipt numbers.
const ParentFees = ({ fees, year, school, child, guardianName, onChangeYear, reloading }) => {
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 6 }, (_, i) => currentYear - 4 + i); // 4 back … next year

  const balance = Number(fees?.balance || 0);
  const concessions = Number(fees?.concessions || 0);
  const payments = fees?.payments || [];
  const concessionItems = fees?.concession_items || [];

  // A single-payment receipt the parent can print or save as PDF.
  const printReceipt = (p) => {
    const w = window.open('', '_blank');
    if (!w) { alert('Allow pop-ups to print the receipt.'); return; }
    w.document.write(`<!doctype html><html><head><title>Receipt ${p.receipt_no || ''} — ${child?.name || ''}</title><style>
      body { font-family: Arial, sans-serif; font-size: 13px; color: #111; margin: 28px; }
      .wrap { max-width: 460px; margin: 0 auto; border: 1px solid #ccc; border-radius: 10px; padding: 22px 26px; }
      h2 { margin: 0; text-align: center; font-size: 18px; }
      .tag { text-align: center; color: #1B6B3A; font-weight: bold; letter-spacing: 1px; margin: 2px 0 16px; font-size: 12px; }
      .row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed #ddd; }
      .row .k { color: #666; } .row .v { font-weight: bold; text-align: right; }
      .amt { margin-top: 14px; background: #f0f7f2; border: 1px solid #cfe6d8; border-radius: 8px; padding: 12px 14px; display: flex; justify-content: space-between; align-items: center; }
      .amt .lbl { color: #1B6B3A; font-weight: bold; } .amt .val { font-size: 20px; font-weight: 800; color: #1B6B3A; }
      .foot { margin-top: 16px; font-size: 10.5px; color: #777; text-align: center; }
      @media print { .noprint { display: none; } }
    </style></head><body>
      <div class="wrap">
        <h2>${school?.name || 'School'}</h2>
        <div class="tag">OFFICIAL FEE RECEIPT</div>
        <div class="row"><span class="k">Receipt No.</span><span class="v">${p.receipt_no || '—'}</span></div>
        <div class="row"><span class="k">Date</span><span class="v">${p.paid_at ? new Date(p.paid_at).toLocaleDateString() : '—'}</span></div>
        <div class="row"><span class="k">Received from</span><span class="v">${guardianName || 'Parent / Guardian'}</span></div>
        <div class="row"><span class="k">Student</span><span class="v">${child?.name || ''} · ADM ${child?.adm_no || ''}</span></div>
        <div class="row"><span class="k">Class</span><span class="v">${child?.grade || ''}${child?.stream ? ` · ${child.stream}` : ''}</span></div>
        <div class="row"><span class="k">Method</span><span class="v">${(p.method || '—').toUpperCase()}${p.reference ? ` · ${p.reference}` : ''}</span></div>
        <div class="row"><span class="k">Fee year</span><span class="v">${fees?.year || year}</span></div>
        <div class="amt"><span class="lbl">Amount paid</span><span class="val">KES ${Number(p.amount).toLocaleString()}</span></div>
        <div class="foot">System-generated receipt via LogiQ-Taaluma. For queries contact the school's finance office.</div>
        <div class="noprint" style="text-align:center;margin-top:14px;">
          <button onclick="window.print()" style="padding:8px 24px;">Print / Save as PDF</button>
        </div>
      </div>
    </body></html>`);
    w.document.close();
    w.focus();
  };

  // Full year statement (billed terms, concessions, then payments).
  const printStatement = () => {
    if (!fees) { alert('No fee record for the selected year.'); return; }
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
        ${fees.is_boarder ? ' · Boarder' : ' · Day scholar'}<br/>
        <span style="color:#555;">Guardian: ${guardianName || 'Parent / Guardian'}</span>
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
      <p style="font-size:10px;color:#666;margin-top:14px;">This statement is system-generated from ${school?.name || 'the school'}'s fee records via LogiQ-Taaluma. For queries contact the school's finance office.</p>
      <div class="noprint" style="text-align:center;margin-top:14px;">
        <button onclick="window.print()" style="padding:8px 24px;">Print / Save as PDF</button>
      </div>
    </body></html>`);
    w.document.close();
    w.focus();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Year selector */}
      <div style={{
        background: '#fff', borderRadius: 12, border: '1px solid #ece5db', padding: '12px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#4A4A6A' }}>📅 Fee year</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {reloading && <span style={{ fontSize: 12, color: '#8a8fa8' }}>Loading…</span>}
          <select
            value={year}
            onChange={(e) => onChangeYear?.(Number(e.target.value))}
            disabled={reloading}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e6dfd8', fontSize: 14, fontWeight: 700, background: '#fff', color: '#2a2421', cursor: reloading ? 'wait' : 'pointer' }}
          >
            {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {!fees ? (
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #ece5db', padding: 32, textAlign: 'center', color: '#8a8fa8', fontSize: 14 }}>
          No fee record for {year}. Try another year.
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
            <SummaryCard label="Billed" value={kes(fees.billed)} color="#4A4A6A" />
            <SummaryCard label="Paid" value={kes(fees.paid)} color="#1B6B3A" />
            {concessions > 0 && <SummaryCard label="Bursaries & Discounts" value={kes(concessions)} color="#6C3483" />}
            <SummaryCard label="Balance" value={kes(balance)} color={balance > 0 ? '#C0392B' : '#1B6B3A'} highlight />
          </div>

          {/* Statement download */}
          <button onClick={printStatement} style={{
            padding: '13px', borderRadius: 10, border: 'none', cursor: 'pointer',
            fontSize: 14, fontWeight: 700, background: '#1A5F9C', color: '#fff',
            boxShadow: '0 2px 8px rgba(26,95,156,0.25)',
          }}>
            🧾 Download {fees.year || year} Statement (PDF)
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

          {/* Bursaries & discounts — distinct labelled lines */}
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

          {/* Payment history — each row prints its own receipt */}
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #ece5db', overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #f0ece3', fontSize: 15, fontWeight: 800, color: '#2a2421' }}>
              Payment History
            </div>
            {payments.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#8a8fa8', fontSize: 13.5 }}>No payments recorded for {fees.year || year}.</div>
            ) : (
              payments.map((p) => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid #f7f5f0', flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0, flex: '1 1 140px' }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: '#2a2421' }}>
                      {p.paid_at ? new Date(p.paid_at).toLocaleDateString() : '—'}
                    </div>
                    <div style={{ fontSize: 11.5, color: '#8a8fa8', textTransform: 'capitalize' }}>
                      {p.method || '—'}{p.reference ? ` (${p.reference})` : ''}
                      {p.receipt_no ? ` · ${p.receipt_no}` : ''}
                    </div>
                  </div>
                  <div style={{ fontWeight: 800, color: '#1B6B3A', whiteSpace: 'nowrap' }}>{kes(p.amount)}</div>
                  <button
                    onClick={() => printReceipt(p)}
                    style={{
                      padding: '7px 12px', borderRadius: 8, border: '1.5px solid #1A5F9C', background: '#fff',
                      color: '#1A5F9C', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                    }}
                  >🖨️ Receipt</button>
                </div>
              ))
            )}
          </div>
        </>
      )}
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

export default ParentFees;

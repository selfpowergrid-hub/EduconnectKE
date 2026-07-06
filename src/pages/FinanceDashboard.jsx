import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';

const GRADE_LABEL = {
  pp1: 'PP1', pp2: 'PP2',
  g1: 'Grade 1', g2: 'Grade 2', g3: 'Grade 3', g4: 'Grade 4', g5: 'Grade 5', g6: 'Grade 6',
  g7: 'Grade 7', g8: 'Grade 8', g9: 'Grade 9', g10: 'Grade 10', g11: 'Grade 11', g12: 'Grade 12',
};

const ACCOUNT_LABEL = {
  AR: 'Accounts Receivable',
  FEE_INCOME: 'Fee Income',
  CASH: 'Cash Collected',
  CONCESSION: 'Discounts & Waivers',
  BURSARY: 'Bursaries',
};

const kes = (n) => `KES ${Math.round(Number(n) || 0).toLocaleString()}`;

// True when the allocation's source (payment/adjustment/bursary) is active.
const allocActive = (a) =>
  a.fee_payments?.status === 'active'
  || a.fee_adjustments?.status === 'active'
  || a.fee_bursary_awards?.status === 'active';

const FinanceDashboard = ({ schoolConfig }) => {
  const [year] = useState(new Date().getFullYear());
  const [invoices, setInvoices] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [payments, setPayments] = useState([]);
  const [students, setStudents] = useState([]);
  const [ledgerTotals, setLedgerTotals] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!schoolConfig?.id) return;
    const load = async () => {
      setIsLoading(true);
      try {
        const [inv, alloc, pays, studs, ledger] = await Promise.all([
          supabase.from('fee_invoices').select('id, student_id, term, total, status')
            .eq('school_id', schoolConfig.id).eq('year', year),
          supabase.from('fee_payment_allocations')
            .select('amount, invoice_id, fee_invoices!inner(year), fee_payments(status), fee_adjustments(status), fee_bursary_awards(status)')
            .eq('school_id', schoolConfig.id).eq('fee_invoices.year', year),
          supabase.from('fee_payments')
            .select('id, student_id, amount, method, reference, paid_at, status, fee_receipts(receipt_no)')
            .eq('school_id', schoolConfig.id).eq('year', year)
            .order('paid_at', { ascending: false }),
          supabase.from('students').select('id, adm_no, first_name, last_name, level_id')
            .eq('school_id', schoolConfig.id),
          supabase.rpc('get_fee_ledger_totals', {
            p_school_id: schoolConfig.id,
            p_from: `${year}-01-01`,
            p_to: `${year}-12-31`,
          }),
        ]);
        setInvoices((inv.data || []).filter(i => i.status !== 'cancelled'));
        setAllocations(alloc.data || []);
        setPayments(pays.data || []);
        setStudents(studs.data || []);
        setLedgerTotals(ledger.data || []);
      } catch (err) {
        console.error('Finance dashboard load failed:', err);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [schoolConfig?.id, year]);

  const stats = useMemo(() => {
    const expected = invoices.reduce((s, i) => s + Number(i.total), 0);
    const collected = payments.filter(p => p.status === 'active').reduce((s, p) => s + Number(p.amount), 0);
    const active = allocations.filter(allocActive);
    const settled = active.reduce((s, a) => s + Number(a.amount), 0);
    const concessions = active
      .filter(a => a.fee_adjustments?.status === 'active' || a.fee_bursary_awards?.status === 'active')
      .reduce((s, a) => s + Number(a.amount), 0);
    const outstanding = expected - settled;
    const rate = expected > 0 ? Math.min(100, Math.round((settled / expected) * 100)) : 0;
    return { expected, collected, concessions, outstanding, rate };
  }, [invoices, allocations, payments]);

  // Outstanding per grade (top 6, biggest arrears first)
  const arrearsByGrade = useMemo(() => {
    const studentById = Object.fromEntries(students.map(s => [s.id, s]));
    const invById = Object.fromEntries(invoices.map(i => [i.id, i]));
    const expectedByGrade = {};
    invoices.forEach(i => {
      const g = studentById[i.student_id]?.level_id || '?';
      expectedByGrade[g] = (expectedByGrade[g] || 0) + Number(i.total);
    });
    const settledByGrade = {};
    allocations.filter(allocActive).forEach(a => {
      const inv = invById[a.invoice_id];
      if (!inv) return;
      const g = studentById[inv.student_id]?.level_id || '?';
      settledByGrade[g] = (settledByGrade[g] || 0) + Number(a.amount);
    });
    return Object.entries(expectedByGrade)
      .map(([g, exp]) => ({ grade: g, expected: exp, outstanding: exp - (settledByGrade[g] || 0) }))
      .filter(r => r.outstanding > 0.005)
      .sort((a, b) => b.outstanding - a.outstanding)
      .slice(0, 6);
  }, [invoices, allocations, students]);

  const studentById = useMemo(() => Object.fromEntries(students.map(s => [s.id, s])), [students]);
  const recentPayments = payments.slice(0, 8);

  const ledgerBalanced = useMemo(() => {
    const d = ledgerTotals.reduce((s, r) => s + Number(r.debits), 0);
    const c = ledgerTotals.reduce((s, r) => s + Number(r.credits), 0);
    return { debits: d, credits: c, ok: Math.abs(d - c) < 0.01 };
  }, [ledgerTotals]);

  if (isLoading) {
    return <div style={{ padding: 60, textAlign: 'center', color: '#8A8FA8' }}>Loading finance dashboard…</div>;
  }

  return (
    <div style={{ paddingBottom: 40 }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#2a2421' }}>Finance Dashboard</h2>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: '#8A8FA8' }}>
          {schoolConfig?.schoolName} · {year} · figures update as invoices, payments and concessions post
        </p>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14, marginBottom: 20 }}>
        <Tile label="Expected (invoiced)" value={kes(stats.expected)} color="#1A5F9C" icon="🧾" />
        <Tile label="Cash collected" value={kes(stats.collected)} color="#1B6B3A" icon="💵" />
        <Tile label="Bursaries & discounts" value={kes(stats.concessions)} color="#6C3483" icon="🎁" />
        <Tile label="Outstanding" value={kes(stats.outstanding)} color="#C0392B" icon="⏳" />
        <Tile label="Collection rate" value={`${stats.rate}%`} color="#8A6A1F" icon="📈"
          sub={<div style={{ marginTop: 6, height: 6, background: '#F0F2F5', borderRadius: 3 }}>
            <div style={{ width: `${stats.rate}%`, height: '100%', background: '#1B6B3A', borderRadius: 3 }} />
          </div>} />
      </div>

      <div className="grid-1" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* Arrears by grade */}
        <div style={{ background: '#fff', border: '1px solid #E8EAF0', borderRadius: 12, padding: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#8A8FA8', textTransform: 'uppercase', marginBottom: 12 }}>Top arrears by grade</div>
          {arrearsByGrade.length === 0 ? (
            <div style={{ color: '#8A8FA8', fontSize: 13, padding: '14px 0' }}>No outstanding balances on issued invoices. 🎉</div>
          ) : arrearsByGrade.map(r => (
            <div key={r.grade} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 3 }}>
                <span style={{ fontWeight: 700, color: '#2a2421' }}>{GRADE_LABEL[r.grade] || r.grade}</span>
                <span style={{ fontWeight: 700, color: '#C0392B', fontFamily: 'monospace' }}>{kes(r.outstanding)}</span>
              </div>
              <div style={{ height: 6, background: '#F0F2F5', borderRadius: 3 }}>
                <div style={{ width: `${Math.min(100, (r.outstanding / r.expected) * 100)}%`, height: '100%', background: '#C0392B', borderRadius: 3, opacity: 0.75 }} />
              </div>
            </div>
          ))}
        </div>

        {/* Recent payments feed */}
        <div style={{ background: '#fff', border: '1px solid #E8EAF0', borderRadius: 12, padding: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#8A8FA8', textTransform: 'uppercase', marginBottom: 12 }}>Recent payments</div>
          {recentPayments.length === 0 ? (
            <div style={{ color: '#8A8FA8', fontSize: 13, padding: '14px 0' }}>No payments recorded yet this year.</div>
          ) : recentPayments.map(p => {
            const s = studentById[p.student_id];
            const voided = p.status === 'voided';
            return (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid #F7F8FA', opacity: voided ? 0.55 : 1 }}>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: '#2a2421' }}>
                    {s ? `${s.first_name || ''} ${s.last_name || ''}`.trim() : '—'}
                    {voided && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 800, color: '#C0392B' }}>VOID</span>}
                  </div>
                  <div style={{ fontSize: 10.5, color: '#8A8FA8' }}>
                    {new Date(p.paid_at).toLocaleDateString()} · {(p.method || '—').toUpperCase()}
                    {p.fee_receipts?.receipt_no ? ` · ${p.fee_receipts.receipt_no}` : ''}
                  </div>
                </div>
                <div style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: 12.5, color: voided ? '#8A8FA8' : '#1B6B3A', textDecoration: voided ? 'line-through' : 'none' }}>
                  {kes(p.amount)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Ledger strip */}
      <div style={{ background: '#fff', border: '1px solid #E8EAF0', borderRadius: 12, padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#8A8FA8', textTransform: 'uppercase' }}>Double-entry ledger · {year}</div>
          <span style={{
            padding: '4px 12px', borderRadius: 999, fontSize: 11, fontWeight: 800,
            background: ledgerBalanced.ok ? '#E8F5EE' : '#FDF0ED',
            color: ledgerBalanced.ok ? '#1B6B3A' : '#C0392B',
          }}>
            {ledgerBalanced.ok ? '✓ Ledger balanced' : '⚠ Ledger imbalance — investigate'}
            {' '}(DR {Math.round(ledgerBalanced.debits).toLocaleString()} / CR {Math.round(ledgerBalanced.credits).toLocaleString()})
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
          {ledgerTotals.map(r => (
            <div key={r.account} style={{ padding: '10px 14px', background: '#F8FAFC', borderRadius: 10 }}>
              <div style={{ fontSize: 10.5, fontWeight: 800, color: '#8A8FA8', textTransform: 'uppercase' }}>{ACCOUNT_LABEL[r.account] || r.account}</div>
              <div style={{ fontSize: 12, fontFamily: 'monospace', marginTop: 4, color: '#2a2421' }}>
                DR {Math.round(Number(r.debits)).toLocaleString()} · CR {Math.round(Number(r.credits)).toLocaleString()}
              </div>
            </div>
          ))}
          {ledgerTotals.length === 0 && (
            <div style={{ color: '#8A8FA8', fontSize: 13 }}>No ledger entries yet — they post automatically as you invoice and receipt.</div>
          )}
        </div>
      </div>
    </div>
  );
};

const Tile = ({ label, value, color, icon, sub }) => (
  <div style={{ background: '#fff', border: '1px solid #E8EAF0', borderRadius: 12, padding: '16px 18px' }}>
    <div style={{ fontSize: 11, fontWeight: 800, color: '#8A8FA8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{icon} {label}</div>
    <div style={{ fontSize: 20, fontWeight: 800, color, marginTop: 6, fontFamily: 'monospace' }}>{value}</div>
    {sub}
  </div>
);

export default FinanceDashboard;

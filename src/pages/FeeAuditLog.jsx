import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';

// Human labels for the audited tables.
const ENTITY_LABEL = {
  voteheads: 'Votehead',
  fee_structures: 'Fee Structure',
  fee_invoices: 'Invoice',
  fee_invoice_items: 'Invoice Item',
  fee_payments: 'Payment',
  fee_payment_allocations: 'Allocation',
  fee_receipts: 'Receipt',
  fee_adjustments: 'Adjustment',
  fee_bursary_awards: 'Bursary',
  fee_sponsors: 'Sponsor',
};

const ACTION_STYLE = {
  insert: { background: '#E8F5EE', color: '#1B6B3A', label: 'CREATE' },
  update: { background: '#FEF6E7', color: '#8A6A1F', label: 'UPDATE' },
  delete: { background: '#FDF0ED', color: '#C0392B', label: 'DELETE' },
};

// Noisy/system columns we hide from the change view.
const HIDDEN_KEYS = new Set(['id', 'school_id', 'created_at']);

function changedFields(before, after) {
  if (!before || !after) return null;
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const out = [];
  keys.forEach(k => {
    if (HIDDEN_KEYS.has(k)) return;
    const b = JSON.stringify(before[k]);
    const a = JSON.stringify(after[k]);
    if (b !== a) out.push({ key: k, from: before[k], to: after[k] });
  });
  return out;
}

// A short human summary of the row involved (best-effort across entities).
function rowSummary(row) {
  if (!row) return '';
  return row.invoice_no || row.receipt_no || row.code || row.name || row.description
    || (row.amount != null ? `KES ${Number(row.amount).toLocaleString()}` : '')
    || '';
}

const fmtVal = (v) => {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

const FeeAuditLog = ({ schoolConfig }) => {
  const [logs, setLogs] = useState([]);
  const [staffByAuthId, setStaffByAuthId] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [entityFilter, setEntityFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    if (!schoolConfig?.id) return;
    const load = async () => {
      setIsLoading(true);
      try {
        const [logsRes, staffRes] = await Promise.all([
          supabase.from('fee_audit_logs').select('*')
            .eq('school_id', schoolConfig.id)
            .order('created_at', { ascending: false })
            .limit(400),
          supabase.from('staff').select('auth_user_id, full_name, app_role')
            .eq('school_id', schoolConfig.id)
            .not('auth_user_id', 'is', null),
        ]);
        if (logsRes.error) throw logsRes.error;
        setLogs(logsRes.data || []);
        setStaffByAuthId(Object.fromEntries((staffRes.data || []).map(s => [s.auth_user_id, s])));
      } catch (err) {
        console.error('Failed to load audit log:', err);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [schoolConfig?.id]);

  const actorLabel = (id) => {
    if (!id) return 'System';
    const st = staffByAuthId[id];
    if (st) return `${st.full_name} (${st.app_role})`;
    return 'School Admin';
  };

  const filtered = useMemo(() => logs.filter(l =>
    (entityFilter === 'all' || l.entity === entityFilter)
    && (actionFilter === 'all' || l.action === actionFilter)
  ), [logs, entityFilter, actionFilter]);

  return (
    <div style={{ paddingBottom: 40 }}>
      <div style={{ background: '#fff', border: '1px solid #e6dfd8', borderRadius: 12, padding: 24, marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#1A1A2E' }}>🔍 Finance Audit Log</h3>
        <p style={{ margin: '8px 0 0', fontSize: 13, color: '#8A8FA8', lineHeight: 1.5 }}>
          Every create, change and void on financial records, with who did it and what changed.
          Entries are append-only — they cannot be edited or deleted.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <select value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #E8EAF0', fontSize: 13, background: '#fff' }}>
          <option value="all">All records</option>
          {Object.entries(ENTITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}s</option>)}
        </select>
        <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #E8EAF0', fontSize: 13, background: '#fff' }}>
          <option value="all">All actions</option>
          <option value="insert">Creates</option>
          <option value="update">Updates</option>
          <option value="delete">Deletes</option>
        </select>
        <span style={{ alignSelf: 'center', fontSize: 12, color: '#8A8FA8' }}>
          {filtered.length} of {logs.length} entries (latest 400)
        </span>
      </div>

      <div style={{ background: '#fff', border: '1px solid #E8EAF0', borderRadius: 12, overflow: 'hidden' }}>
        {isLoading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#8A8FA8', fontSize: 13 }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#8A8FA8', fontSize: 13 }}>No audit entries match.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ background: '#FAFBFC', borderBottom: '1px solid #E8EAF0' }}>
              <tr>
                <th style={thStyle}>When</th>
                <th style={thStyle}>Who</th>
                <th style={thStyle}>Action</th>
                <th style={thStyle}>Record</th>
                <th className="hide-mobile" style={thStyle}>Details</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l, idx) => {
                const st = ACTION_STYLE[l.action] || ACTION_STYLE.update;
                const changes = l.action === 'update' ? changedFields(l.before, l.after) : null;
                const isOpen = expanded === l.id;
                return (
                  <React.Fragment key={l.id}>
                    <tr onClick={() => setExpanded(isOpen ? null : l.id)}
                        style={{ borderBottom: '1px solid #F7F8FA', background: idx % 2 === 0 ? '#fff' : '#FAFBFC', cursor: 'pointer' }}>
                      <td style={{ padding: '11px 16px', color: '#4A4A6A', whiteSpace: 'nowrap' }}>
                        {new Date(l.created_at).toLocaleDateString()} <span style={{ color: '#8A8FA8' }}>{new Date(l.created_at).toLocaleTimeString()}</span>
                      </td>
                      <td style={{ padding: '11px 16px', fontWeight: 600, color: '#1A1A2E' }}>{actorLabel(l.actor_id)}</td>
                      <td style={{ padding: '11px 16px' }}>
                        <span style={{ padding: '3px 9px', borderRadius: 999, fontSize: 10, fontWeight: 800, background: st.background, color: st.color }}>{st.label}</span>
                      </td>
                      <td style={{ padding: '11px 16px' }}>
                        <span style={{ fontWeight: 700 }}>{ENTITY_LABEL[l.entity] || l.entity}</span>
                        <span style={{ color: '#8A8FA8', marginLeft: 8, fontSize: 12 }}>{rowSummary(l.after || l.before)}</span>
                      </td>
                      <td className="hide-mobile" style={{ padding: '11px 16px', color: '#8A8FA8', fontSize: 12 }}>
                        {l.action === 'update' && changes
                          ? `${changes.length} field${changes.length === 1 ? '' : 's'} changed ${isOpen ? '▲' : '▼'}`
                          : `click to view ${isOpen ? '▲' : '▼'}`}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr style={{ background: '#FDFCF9' }}>
                        <td colSpan="5" style={{ padding: '12px 24px', borderBottom: '1px solid #F0F2F5' }}>
                          {l.action === 'update' && changes && changes.length > 0 ? (
                            <table style={{ borderCollapse: 'collapse', fontSize: 12 }}>
                              <tbody>
                                {changes.map(c => (
                                  <tr key={c.key}>
                                    <td style={{ padding: '3px 14px 3px 0', fontWeight: 700, color: '#4A4A6A' }}>{c.key}</td>
                                    <td style={{ padding: '3px 8px', color: '#C0392B', fontFamily: 'monospace' }}>{fmtVal(c.from)}</td>
                                    <td style={{ padding: '3px 4px', color: '#8A8FA8' }}>→</td>
                                    <td style={{ padding: '3px 8px', color: '#1B6B3A', fontFamily: 'monospace' }}>{fmtVal(c.to)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : (
                            <pre style={{ margin: 0, fontSize: 11.5, color: '#4A4A6A', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                              {JSON.stringify(l.after || l.before, null, 2)}
                            </pre>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

const thStyle = { padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: '#8A8FA8', fontSize: 11, textTransform: 'uppercase' };

export default FeeAuditLog;

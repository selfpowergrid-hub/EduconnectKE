import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

// Suppliers & Expenses (Final Accounts Phase C1) — accounts payable.
//   · Suppliers: who the school buys from, payout details, outstanding balances
//   · Bills: supplier invoices coded to expense/asset GL heads
//     (BILL-YYYY-NNNNNN; draft → posted → part_paid → paid, or void)
//   · Payments: PV-YYYY-NNNNNN vouchers out of a bank/cash account, allocated
//     oldest-bill-first (or manually), printed with signature lines
// All money paths go through the guarded RPCs; GL postings happen in DB
// triggers so nothing here can skip the ledger.

const fmt = (n) => Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const todayISO = () => new Date().toISOString().slice(0, 10);

const STATUS_META = {
  draft:     { label: 'DRAFT',     color: '#8A8FA8', bg: '#F1F0F5' },
  posted:    { label: 'POSTED',    color: '#1A5F9C', bg: '#F4F9FE' },
  part_paid: { label: 'PART PAID', color: '#B4690E', bg: '#FDF6EC' },
  paid:      { label: 'PAID',      color: '#1B6B3A', bg: '#E8F5EE' },
  void:      { label: 'VOID',      color: '#C0392B', bg: '#FCEEEC' },
  active:    { label: 'ACTIVE',    color: '#1B6B3A', bg: '#E8F5EE' },
  voided:    { label: 'VOID',      color: '#C0392B', bg: '#FCEEEC' },
  open:      { label: 'OPEN',      color: '#1A5F9C', bg: '#F4F9FE' },
  billed:    { label: 'BILLED',    color: '#1B6B3A', bg: '#E8F5EE' },
  cancelled: { label: 'CANCELLED', color: '#C0392B', bg: '#FCEEEC' },
};

const CATEGORY_OPTIONS = [
  'Food & Groceries', 'Transport & Fuel', 'Utilities', 'Repairs & Maintenance',
  'Learning Materials', 'Stationery & Office', 'Construction', 'Services', 'Other',
];

function printVoucher(schoolConfig, payment, allocations) {
  const w = window.open('', '_blank');
  if (!w) { alert('Allow pop-ups to print the voucher.'); return; }
  const rows = (allocations || []).map(a =>
    `<tr><td>${a.bill_no}</td><td>${a.bill_date || ''}</td><td class="num">${fmt(a.amount)}</td></tr>`).join('');
  w.document.write(`<!doctype html><html><head><title>${payment.voucher_no}</title><style>
    body { font-family: Arial, sans-serif; font-size: 12.5px; color: #111; margin: 32px; }
    h2 { margin: 0; } .sub { color: #555; margin: 2px 0 18px; font-size: 11px; }
    .vno { float: right; text-align: right; font-family: 'Courier New', monospace; font-weight: bold; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0 16px; }
    th, td { border: 1px solid #bbb; padding: 6px 9px; text-align: left; }
    th { background: #f0f0f0; font-size: 10.5px; text-transform: uppercase; }
    .num { text-align: right; font-family: 'Courier New', monospace; }
    .meta td { border: none; padding: 3px 0; }
    .meta .k { color: #555; width: 130px; }
    .sig { display: flex; gap: 30px; margin-top: 44px; }
    .sig div { flex: 1; border-top: 1px solid #333; padding-top: 5px; font-size: 11px; color: #333; }
    @media print { .noprint { display: none; } }
  </style></head><body>
    <div class="vno">PAYMENT VOUCHER<br/>${payment.voucher_no}${payment.status === 'voided' ? '<br/><span style="color:#C0392B">*** VOID ***</span>' : ''}</div>
    <h2>${schoolConfig?.school_name || 'School'}</h2>
    <p class="sub">Generated ${new Date().toLocaleString()} · LogiQ-Taaluma</p>
    <table class="meta">
      <tr><td class="k">Paid to</td><td><strong>${payment.suppliers?.name || ''}</strong></td></tr>
      <tr><td class="k">Date</td><td>${payment.paid_at}</td></tr>
      <tr><td class="k">Paid from</td><td>${payment.bank_accounts?.name || ''}</td></tr>
      <tr><td class="k">Reference</td><td>${payment.reference || '—'}</td></tr>
      <tr><td class="k">Memo</td><td>${payment.memo || '—'}</td></tr>
      <tr><td class="k">Amount</td><td style="font-size:16px;font-weight:bold;font-family:'Courier New',monospace;">KES ${fmt(payment.amount)}</td></tr>
    </table>
    ${rows ? `<table><thead><tr><th>Settles bill</th><th>Bill date</th><th style="text-align:right">Amount</th></tr></thead><tbody>${rows}</tbody></table>` : ''}
    <div class="sig">
      <div>Prepared by (name, sign, date)</div>
      <div>Approved by (name, sign, date)</div>
      <div>Received by (name, sign, date)</div>
    </div>
    <div class="noprint" style="margin-top:24px;text-align:center;">
      <button onclick="window.print()" style="padding:8px 22px;">Print</button>
    </div>
  </body></html>`);
  w.document.close();
  w.focus();
}

function downloadCsv(filename, headers, rows) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [headers, ...rows].map(r => r.map(esc).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function printTable(schoolName, title, headers, rows) {
  const w = window.open('', '_blank');
  if (!w) { alert('Allow pop-ups to print reports.'); return; }
  const head = headers.map(h => `<th>${h}</th>`).join('');
  const body = rows.map(r => `<tr>${r.map((c, i) => `<td class="${i > 0 && /^[\d,.()-]+$/.test(String(c)) ? 'num' : ''}">${c ?? ''}</td>`).join('')}</tr>`).join('');
  w.document.write(`<!doctype html><html><head><title>${title}</title><style>
    body { font-family: Arial, sans-serif; font-size: 12px; color: #111; margin: 24px; }
    h2 { margin: 0 0 2px; } .sub { color: #555; margin: 0 0 14px; font-size: 11px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #bbb; padding: 5px 8px; text-align: left; }
    th { background: #f0f0f0; font-size: 10.5px; text-transform: uppercase; }
    .num { text-align: right; font-family: 'Courier New', monospace; }
    @media print { .noprint { display: none; } }
  </style></head><body>
    <h2>${schoolName || 'School'}</h2>
    <p class="sub">${title} · generated ${new Date().toLocaleString()} · LogiQ-Taaluma</p>
    <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
    <div class="noprint" style="margin-top:16px;text-align:center;">
      <button onclick="window.print()" style="padding:8px 22px;">Print</button>
    </div>
  </body></html>`);
  w.document.close();
  w.focus();
}

function printLpo(schoolConfig, po, supplier, items) {
  const w = window.open('', '_blank');
  if (!w) { alert('Allow pop-ups to print the LPO.'); return; }
  const rows = items.map(it =>
    `<tr><td>${it.description}</td><td class="num">${Number(it.quantity)}</td><td class="num">${fmt(it.unit_cost)}</td><td class="num">${fmt(it.amount)}</td></tr>`).join('');
  w.document.write(`<!doctype html><html><head><title>${po.lpo_no}</title><style>
    body { font-family: Arial, sans-serif; font-size: 12.5px; color: #111; margin: 32px; }
    h2 { margin: 0; } .sub { color: #555; margin: 2px 0 18px; font-size: 11px; }
    .vno { float: right; text-align: right; font-family: 'Courier New', monospace; font-weight: bold; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0 16px; }
    th, td { border: 1px solid #bbb; padding: 6px 9px; text-align: left; }
    th { background: #f0f0f0; font-size: 10.5px; text-transform: uppercase; }
    .num { text-align: right; font-family: 'Courier New', monospace; }
    .meta td { border: none; padding: 3px 0; }
    .meta .k { color: #555; width: 130px; }
    .sig { display: flex; gap: 30px; margin-top: 44px; }
    .sig div { flex: 1; border-top: 1px solid #333; padding-top: 5px; font-size: 11px; color: #333; }
    @media print { .noprint { display: none; } }
  </style></head><body>
    <div class="vno">LOCAL PURCHASE ORDER<br/>${po.lpo_no}${po.status === 'cancelled' ? '<br/><span style="color:#C0392B">*** CANCELLED ***</span>' : ''}</div>
    <h2>${schoolConfig?.school_name || 'School'}</h2>
    <p class="sub">Generated ${new Date().toLocaleString()} · LogiQ-Taaluma</p>
    <table class="meta">
      <tr><td class="k">To (supplier)</td><td><strong>${supplier?.name || ''}</strong></td></tr>
      <tr><td class="k">Phone</td><td>${supplier?.phone || '—'}</td></tr>
      <tr><td class="k">Order date</td><td>${po.order_date}</td></tr>
      <tr><td class="k">Memo</td><td>${po.memo || '—'}</td></tr>
    </table>
    <table><thead><tr><th>Description</th><th style="text-align:right">Qty</th><th style="text-align:right">Unit cost</th><th style="text-align:right">Amount</th></tr></thead>
    <tbody>${rows}
      <tr><td colspan="3" style="font-weight:bold">Total</td><td class="num" style="font-weight:bold">${fmt(po.total)}</td></tr>
    </tbody></table>
    <p style="font-size:11px;color:#555">Please supply the goods/services above and attach this LPO number to your invoice. This order has no cash value until invoiced and approved.</p>
    <div class="sig">
      <div>Prepared by (name, sign, date)</div>
      <div>Approved by (name, sign, date)</div>
      <div>Supplier acknowledgement</div>
    </div>
    <div class="noprint" style="margin-top:24px;text-align:center;">
      <button onclick="window.print()" style="padding:8px 22px;">Print</button>
    </div>
  </body></html>`);
  w.document.close();
  w.focus();
}

function printPcv(schoolConfig, v) {
  const w = window.open('', '_blank');
  if (!w) { alert('Allow pop-ups to print the voucher.'); return; }
  w.document.write(`<!doctype html><html><head><title>${v.voucher_no}</title><style>
    body { font-family: Arial, sans-serif; font-size: 12.5px; color: #111; margin: 32px; }
    h2 { margin: 0; } .sub { color: #555; margin: 2px 0 18px; font-size: 11px; }
    .vno { float: right; text-align: right; font-family: 'Courier New', monospace; font-weight: bold; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0 16px; }
    .meta td { border: none; padding: 4px 0; }
    .meta .k { color: #555; width: 140px; }
    .sig { display: flex; gap: 30px; margin-top: 44px; }
    .sig div { flex: 1; border-top: 1px solid #333; padding-top: 5px; font-size: 11px; color: #333; }
    @media print { .noprint { display: none; } }
  </style></head><body>
    <div class="vno">PETTY CASH VOUCHER<br/>${v.voucher_no}${v.status === 'voided' ? '<br/><span style="color:#C0392B">*** VOID ***</span>' : ''}</div>
    <h2>${schoolConfig?.school_name || 'School'}</h2>
    <p class="sub">Generated ${new Date().toLocaleString()} · LogiQ-Taaluma</p>
    <table class="meta">
      <tr><td class="k">Paid to</td><td><strong>${v.payee}</strong></td></tr>
      <tr><td class="k">Date</td><td>${v.expense_date}</td></tr>
      <tr><td class="k">For</td><td>${v.description}</td></tr>
      <tr><td class="k">Expense head</td><td>${v.gl_accounts ? `${v.gl_accounts.code} — ${v.gl_accounts.name}` : ''}</td></tr>
      <tr><td class="k">Paid from</td><td>${v.bank_accounts?.name || ''}</td></tr>
      <tr><td class="k">Amount</td><td style="font-size:16px;font-weight:bold;font-family:'Courier New',monospace;">KES ${fmt(v.amount)}</td></tr>
    </table>
    <div class="sig">
      <div>Prepared by (name, sign, date)</div>
      <div>Approved by (name, sign, date)</div>
      <div>Received by (name, sign, date)</div>
    </div>
    <div class="noprint" style="margin-top:24px;text-align:center;">
      <button onclick="window.print()" style="padding:8px 22px;">Print</button>
    </div>
  </body></html>`);
  w.document.close();
  w.focus();
}

const emptySupplier = { name: '', category: '', kra_pin: '', phone: '', email: '', bank_name: '', bank_account_no: '', mpesa_no: '', terms_days: 30, notes: '' };
const emptyItem = () => ({ gl_account_id: '', description: '', quantity: '1', unit_cost: '', amount: '' });

const Suppliers = ({ schoolConfig }) => {
  const [tab, setTab] = useState('suppliers');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const [suppliers, setSuppliers] = useState([]);
  const [summary, setSummary] = useState({});        // supplier_id → {outstanding, ...}
  const [bills, setBills] = useState([]);
  const [payments, setPayments] = useState([]);
  const [glAccounts, setGlAccounts] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);

  // Supplier form
  const [supForm, setSupForm] = useState(null);      // null | {id?, ...fields}

  // Bill form + detail
  const [billForm, setBillForm] = useState(null);    // null | {supplier_id, ...; items: []}
  const [billDetail, setBillDetail] = useState(null); // {bill, items}
  const [billFilter, setBillFilter] = useState('open');

  // Payment form
  const [payForm, setPayForm] = useState(null);      // null | {...}
  const [payBills, setPayBills] = useState([]);      // outstanding bills of chosen supplier

  // LPOs
  const [pos, setPos] = useState([]);
  const [poForm, setPoForm] = useState(null);

  // Petty cash
  const [vouchers, setVouchers] = useState([]);
  const [pcvForm, setPcvForm] = useState(null);

  // Reports
  const [rptSupplier, setRptSupplier] = useState('');
  const [rptFrom, setRptFrom] = useState('');
  const [rptTo, setRptTo] = useState(todayISO());
  const [statement, setStatement] = useState(null);
  const [agingAsOf, setAgingAsOf] = useState(todayISO());
  const [aging, setAging] = useState(null);
  const [expFrom, setExpFrom] = useState(todayISO().slice(0, 4) + '-01-01');
  const [expTo, setExpTo] = useState(todayISO());
  const [expSummary, setExpSummary] = useState(null);

  const load = useCallback(async () => {
    if (!schoolConfig?.id) return;
    setErr('');
    const [sup, sum, bls, pays, gls, banks, posQ, pcvQ] = await Promise.all([
      supabase.from('suppliers').select('*').eq('school_id', schoolConfig.id).order('name'),
      supabase.rpc('get_ap_summary', { p_school_id: schoolConfig.id }),
      supabase.from('supplier_invoices')
        .select('*, suppliers(name)')
        .eq('school_id', schoolConfig.id).order('bill_date', { ascending: false }).limit(300),
      supabase.from('supplier_payments')
        .select('*, suppliers(name), bank_accounts(name)')
        .eq('school_id', schoolConfig.id).order('paid_at', { ascending: false }).limit(300),
      supabase.from('gl_accounts')
        .select('id, code, name, type')
        .eq('school_id', schoolConfig.id).eq('is_active', true)
        .in('type', ['expense', 'asset']).order('code'),
      supabase.from('bank_accounts')
        .select('id, name, kind').eq('school_id', schoolConfig.id).eq('is_active', true),
      supabase.from('purchase_orders')
        .select('*, suppliers(name, phone)')
        .eq('school_id', schoolConfig.id).order('order_date', { ascending: false }).limit(300),
      supabase.from('expense_vouchers')
        .select('*, bank_accounts(name), gl_accounts(code, name)')
        .eq('school_id', schoolConfig.id).order('expense_date', { ascending: false }).limit(300),
    ]);
    if (sup.error) { setErr(sup.error.message); return; }
    setSuppliers(sup.data || []);
    const map = {};
    (Array.isArray(sum.data) ? sum.data : []).forEach(r => { map[r.supplier_id] = r; });
    setSummary(map);
    setBills(bls.data || []);
    setPayments(pays.data || []);
    setGlAccounts(gls.data || []);
    setBankAccounts(banks.data || []);
    setPos(posQ.data || []);
    setVouchers(pcvQ.data || []);
  }, [schoolConfig?.id]);

  useEffect(() => { load(); }, [load]);

  // ---------------- Suppliers tab ----------------

  const saveSupplier = async () => {
    if (!supForm.name.trim()) { setErr('The supplier needs a name.'); return; }
    setBusy(true);
    setErr('');
    const row = {
      ...supForm,
      name: supForm.name.trim(),
      terms_days: parseInt(supForm.terms_days) || 0,
      school_id: schoolConfig.id,
    };
    const { error } = row.id
      ? await supabase.from('suppliers').update(row).eq('id', row.id)
      : await supabase.from('suppliers').insert(row);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setSupForm(null);
    load();
  };

  const toggleSupplier = async (s) => {
    setBusy(true);
    const { error } = await supabase.from('suppliers').update({ is_active: !s.is_active }).eq('id', s.id);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    load();
  };

  // ---------------- Bills tab ----------------

  const openNewBill = () => {
    setBillForm({ supplier_id: '', supplier_ref: '', bill_date: todayISO(), due_date: '', memo: '', items: [emptyItem()] });
    setErr('');
  };

  const setItem = (idx, patch) => {
    setBillForm(f => {
      const items = f.items.map((it, i) => {
        if (i !== idx) return it;
        const next = { ...it, ...patch };
        const q = parseFloat(next.quantity), c = parseFloat(next.unit_cost);
        if (('quantity' in patch || 'unit_cost' in patch) && q > 0 && c >= 0 && next.unit_cost !== '') {
          next.amount = (q * c).toFixed(2);
        }
        return next;
      });
      return { ...f, items };
    });
  };

  const billTotal = (f) => f.items.reduce((s, it) => s + (parseFloat(it.amount) || 0), 0);

  const saveBill = async (post) => {
    const f = billForm;
    if (!f.supplier_id) { setErr('Pick a supplier.'); return; }
    const items = f.items.filter(it => it.gl_account_id && parseFloat(it.amount) > 0);
    if (!items.length) { setErr('Add at least one line with an account and an amount.'); return; }
    setBusy(true);
    setErr('');
    const { data, error } = await supabase.rpc('create_supplier_bill', {
      p_school_id: schoolConfig.id,
      p_supplier_id: f.supplier_id,
      p_supplier_ref: f.supplier_ref || null,
      p_bill_date: f.bill_date || null,
      p_due_date: f.due_date || null,
      p_memo: f.memo || null,
      p_items: items.map(it => ({
        gl_account_id: it.gl_account_id,
        description: it.description || 'Item',
        quantity: parseFloat(it.quantity) || 1,
        unit_cost: parseFloat(it.unit_cost) || 0,
        amount: parseFloat(it.amount),
      })),
      p_post: !!post,
      p_purchase_order_id: f.purchase_order_id || null,
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setBillForm(null);
    load();
    return data;
  };

  const postBill = async (b) => {
    if (!window.confirm(`Post ${b.bill_no} for KES ${fmt(b.total)}?\n\nPosting books the expense to the ledger. The bill can no longer be edited.`)) return;
    setBusy(true);
    const { error } = await supabase.rpc('post_supplier_bill', { p_school_id: schoolConfig.id, p_bill_id: b.id });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    load();
  };

  const voidBill = async (b) => {
    const reason = window.prompt(`Void ${b.bill_no}? Give a reason:`);
    if (reason === null) return;
    if (!reason.trim()) { setErr('A reason is required to void a bill.'); return; }
    setBusy(true);
    const { error } = await supabase.rpc('void_supplier_bill', { p_school_id: schoolConfig.id, p_bill_id: b.id, p_reason: reason.trim() });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setBillDetail(null);
    load();
  };

  const openBillDetail = async (b) => {
    const { data } = await supabase.from('supplier_invoice_items')
      .select('*, gl_accounts(code, name)').eq('invoice_id', b.id).order('created_at');
    setBillDetail({ bill: b, items: data || [] });
  };

  // ---------------- Payments tab ----------------

  const openNewPayment = () => {
    setPayForm({ supplier_id: '', bank_account_id: bankAccounts[0]?.id || '', amount: '', paid_at: todayISO(), reference: '', memo: '', mode: 'auto', manual: {} });
    setPayBills([]);
    setErr('');
  };

  const loadPayBills = useCallback(async (supplierId) => {
    if (!supplierId) { setPayBills([]); return; }
    const { data } = await supabase.from('supplier_invoices')
      .select('id, bill_no, bill_date, due_date, total, status, supplier_payment_allocations(amount)')
      .eq('school_id', schoolConfig.id).eq('supplier_id', supplierId)
      .in('status', ['posted', 'part_paid'])
      .order('bill_date').order('created_at');
    setPayBills((data || []).map(b => ({
      ...b,
      outstanding: Number(b.total) - (b.supplier_payment_allocations || []).reduce((s, a) => s + Number(a.amount), 0),
    })).filter(b => b.outstanding > 0));
  }, [schoolConfig?.id]);

  const submitPayment = async () => {
    const f = payForm;
    const amount = parseFloat(f.amount);
    if (!f.supplier_id) { setErr('Pick a supplier.'); return; }
    if (!f.bank_account_id) { setErr('Pick the paying account.'); return; }
    if (!amount || amount <= 0) { setErr('Enter an amount greater than zero.'); return; }
    let allocations = null;
    if (f.mode === 'manual') {
      allocations = Object.entries(f.manual)
        .map(([invoice_id, v]) => ({ invoice_id, amount: parseFloat(v) || 0 }))
        .filter(a => a.amount > 0);
      const sum = allocations.reduce((s, a) => s + a.amount, 0);
      if (sum - amount > 0.005) { setErr(`Allocations (${fmt(sum)}) exceed the payment amount (${fmt(amount)}).`); return; }
    }
    setBusy(true);
    setErr('');
    const { error } = await supabase.rpc('record_supplier_payment', {
      p_school_id: schoolConfig.id,
      p_supplier_id: f.supplier_id,
      p_bank_account_id: f.bank_account_id,
      p_amount: amount,
      p_paid_at: f.paid_at || null,
      p_reference: f.reference || null,
      p_memo: f.memo || null,
      p_allocations: allocations,
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setPayForm(null);
    load();
  };

  const voidPayment = async (p) => {
    const reason = window.prompt(`Void voucher ${p.voucher_no}? Its bill settlements are undone. Give a reason:`);
    if (reason === null) return;
    if (!reason.trim()) { setErr('A reason is required to void a payment.'); return; }
    setBusy(true);
    const { error } = await supabase.rpc('void_supplier_payment', { p_school_id: schoolConfig.id, p_payment_id: p.id, p_reason: reason.trim() });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    load();
  };

  // ---------------- LPOs tab ----------------

  const openNewPo = () => {
    setPoForm({ supplier_id: '', order_date: todayISO(), memo: '', items: [emptyItem()] });
    setErr('');
  };

  const setPoItem = (idx, patch) => {
    setPoForm(f => {
      const items = f.items.map((it, i) => {
        if (i !== idx) return it;
        const next = { ...it, ...patch };
        const q = parseFloat(next.quantity), c = parseFloat(next.unit_cost);
        if (('quantity' in patch || 'unit_cost' in patch) && q > 0 && c >= 0 && next.unit_cost !== '') {
          next.amount = (q * c).toFixed(2);
        }
        return next;
      });
      return { ...f, items };
    });
  };

  const savePo = async () => {
    const f = poForm;
    if (!f.supplier_id) { setErr('Pick a supplier.'); return; }
    const items = f.items.filter(it => (it.description || '').trim() && parseFloat(it.amount) > 0);
    if (!items.length) { setErr('Add at least one line with a description and an amount.'); return; }
    setBusy(true);
    setErr('');
    const { error } = await supabase.rpc('create_purchase_order', {
      p_school_id: schoolConfig.id,
      p_supplier_id: f.supplier_id,
      p_order_date: f.order_date || null,
      p_memo: f.memo || null,
      p_items: items.map(it => ({
        gl_account_id: it.gl_account_id || null,
        description: it.description.trim(),
        quantity: parseFloat(it.quantity) || 1,
        unit_cost: parseFloat(it.unit_cost) || 0,
        amount: parseFloat(it.amount),
      })),
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setPoForm(null);
    load();
  };

  const cancelPo = async (po) => {
    const reason = window.prompt(`Cancel ${po.lpo_no}? Give a reason:`);
    if (reason === null) return;
    if (!reason.trim()) { setErr('A reason is required to cancel an LPO.'); return; }
    setBusy(true);
    const { error } = await supabase.rpc('cancel_purchase_order', { p_school_id: schoolConfig.id, p_po_id: po.id, p_reason: reason.trim() });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    load();
  };

  const printPo = async (po) => {
    const { data } = await supabase.from('purchase_order_items')
      .select('*').eq('po_id', po.id).order('created_at');
    printLpo(schoolConfig, po, po.suppliers, data || []);
  };

  const convertPoToBill = async (po) => {
    const { data } = await supabase.from('purchase_order_items')
      .select('*').eq('po_id', po.id).order('created_at');
    setBillForm({
      supplier_id: po.supplier_id,
      supplier_ref: '',
      bill_date: todayISO(),
      due_date: '',
      memo: `Fulfils ${po.lpo_no}${po.memo ? ' — ' + po.memo : ''}`,
      purchase_order_id: po.id,
      items: (data || []).map(it => ({
        gl_account_id: it.gl_account_id || '',
        description: it.description,
        quantity: String(Number(it.quantity)),
        unit_cost: String(Number(it.unit_cost)),
        amount: String(Number(it.amount)),
      })),
    });
    setTab('bills');
    setErr('');
  };

  // ---------------- Petty cash tab ----------------

  const openNewPcv = () => {
    const petty = bankAccounts.find(a => a.kind === 'petty_cash');
    setPcvForm({ bank_account_id: petty?.id || bankAccounts[0]?.id || '', gl_account_id: '', payee: '', description: '', amount: '', expense_date: todayISO() });
    setErr('');
  };

  const savePcv = async () => {
    const f = pcvForm;
    if (!f.payee.trim()) { setErr('Say who received the money.'); return; }
    if (!f.gl_account_id) { setErr('Pick the expense head.'); return; }
    if (!(parseFloat(f.amount) > 0)) { setErr('Enter an amount greater than zero.'); return; }
    setBusy(true);
    setErr('');
    const { error } = await supabase.rpc('record_expense_voucher', {
      p_school_id: schoolConfig.id,
      p_bank_account_id: f.bank_account_id,
      p_gl_account_id: f.gl_account_id,
      p_payee: f.payee.trim(),
      p_description: f.description || null,
      p_amount: parseFloat(f.amount),
      p_expense_date: f.expense_date || null,
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setPcvForm(null);
    load();
  };

  const voidPcv = async (v) => {
    const reason = window.prompt(`Void voucher ${v.voucher_no}? Give a reason:`);
    if (reason === null) return;
    if (!reason.trim()) { setErr('A reason is required to void a voucher.'); return; }
    setBusy(true);
    const { error } = await supabase.rpc('void_expense_voucher', { p_school_id: schoolConfig.id, p_voucher_id: v.id, p_reason: reason.trim() });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    load();
  };

  // ---------------- Reports tab ----------------

  const runStatement = async () => {
    if (!rptSupplier) { setErr('Pick a supplier.'); return; }
    setErr('');
    const { data, error } = await supabase.rpc('get_supplier_statement', {
      p_school_id: schoolConfig.id, p_supplier_id: rptSupplier,
      p_from: rptFrom || null, p_to: rptTo || null,
    });
    if (error) { setErr(error.message); return; }
    setStatement(data);
  };

  const runAging = async () => {
    setErr('');
    const { data, error } = await supabase.rpc('get_ap_aging', {
      p_school_id: schoolConfig.id, p_as_of: agingAsOf || null,
    });
    if (error) { setErr(error.message); return; }
    setAging(Array.isArray(data) ? data : []);
  };

  const runExpense = async () => {
    setErr('');
    const { data, error } = await supabase.rpc('get_gl_trial_balance', {
      p_school_id: schoolConfig.id, p_from: expFrom || null, p_to: expTo || null,
    });
    if (error) { setErr(error.message); return; }
    setExpSummary((Array.isArray(data) ? data : [])
      .filter(r => r.type === 'expense')
      .map(r => ({ ...r, net: Number(r.debits) - Number(r.credits) })));
  };

  const printPaymentVoucher = async (p) => {
    const { data } = await supabase.from('supplier_payment_allocations')
      .select('amount, supplier_invoices(bill_no, bill_date)').eq('payment_id', p.id);
    printVoucher(schoolConfig, p, (data || []).map(a => ({
      bill_no: a.supplier_invoices?.bill_no, bill_date: a.supplier_invoices?.bill_date, amount: a.amount,
    })));
  };

  // ---------------- Rendering ----------------

  const card = { background: '#fff', border: '1px solid #E8EAF0', borderRadius: 12, padding: 20, marginBottom: 16 };
  const lbl = { display: 'block', fontSize: 10, fontWeight: 800, color: '#8a8fa8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' };
  const input = { padding: '8px 10px', borderRadius: 8, border: '1px solid #e6dfd8', fontSize: 13, color: '#2a2421', background: '#fff', boxSizing: 'border-box', width: '100%' };
  const btn = (bg, color, disabled) => ({ padding: '9px 16px', background: disabled ? '#8a8fa8' : bg, border: 'none', borderRadius: 8, fontSize: 13, color, fontWeight: 700, cursor: disabled ? 'default' : 'pointer' });
  const smallBtn = (bg, color) => ({ padding: '5px 10px', background: bg, border: 'none', borderRadius: 6, fontSize: 11.5, color, fontWeight: 700, cursor: busy ? 'default' : 'pointer' });
  const th = { padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 800, color: '#8a8fa8', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #E8EAF0', whiteSpace: 'nowrap' };
  const td = { padding: '8px 12px', borderTop: '1px solid #F1F0F5', fontSize: 12.5, color: '#2a2421' };
  const tdNum = { ...td, textAlign: 'right', fontFamily: 'monospace' };
  const badge = (s) => {
    const m = STATUS_META[s] || STATUS_META.draft;
    return <span style={{ fontSize: 9.5, fontWeight: 800, color: m.color, background: m.bg, padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap' }}>{m.label}</span>;
  };

  const visibleBills = bills.filter(b =>
    billFilter === 'all' ? true
    : billFilter === 'open' ? ['draft', 'posted', 'part_paid'].includes(b.status)
    : b.status === billFilter);

  return (
    <div style={{ paddingBottom: 40, maxWidth: 1150 }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#2a2421' }}>Suppliers & Expenses</h2>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: '#8A8FA8' }}>
          What the school buys and owes. Bills book expenses to the ledger; vouchers pay them down.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid #E8EAF0' }}>
        {[['suppliers', 'Suppliers'], ['bills', 'Bills'], ['payments', 'Payments'], ['lpos', 'LPOs'], ['petty', 'Petty Cash'], ['reports', 'Reports']].map(([id, label]) => (
          <button key={id} onClick={() => { setTab(id); setErr(''); }}
            style={{ padding: '8px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: tab === id ? '#1A5F9C' : '#8A8FA8', borderBottom: tab === id ? '2px solid #1A5F9C' : '2px solid transparent', marginBottom: -1 }}>
            {label}
          </button>
        ))}
      </div>

      {err && (
        <div style={{ ...card, background: '#FCEEEC', border: '1px solid #F3C9C3', color: '#C0392B', fontSize: 12.5, fontWeight: 600 }}>{err}</div>
      )}

      {/* ================= SUPPLIERS ================= */}
      {tab === 'suppliers' && (
        <>
          {!supForm ? (
            <button onClick={() => setSupForm({ ...emptySupplier })} style={{ ...btn('#1A5F9C', '#fff'), marginBottom: 16 }}>+ Add supplier</button>
          ) : (
            <div style={card}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#2a2421', marginBottom: 14 }}>{supForm.id ? 'Edit supplier' : 'New supplier'}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                <div><label style={lbl}>Name *</label><input style={input} value={supForm.name} onChange={e => setSupForm({ ...supForm, name: e.target.value })} /></div>
                <div><label style={lbl}>Category</label>
                  <select style={{ ...input, cursor: 'pointer' }} value={supForm.category || ''} onChange={e => setSupForm({ ...supForm, category: e.target.value })}>
                    <option value="">—</option>
                    {CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div><label style={lbl}>KRA PIN</label><input style={input} value={supForm.kra_pin || ''} onChange={e => setSupForm({ ...supForm, kra_pin: e.target.value })} /></div>
                <div><label style={lbl}>Phone</label><input style={input} value={supForm.phone || ''} onChange={e => setSupForm({ ...supForm, phone: e.target.value })} /></div>
                <div><label style={lbl}>Email</label><input style={input} value={supForm.email || ''} onChange={e => setSupForm({ ...supForm, email: e.target.value })} /></div>
                <div><label style={lbl}>Payment terms (days)</label><input style={input} type="number" min="0" value={supForm.terms_days} onChange={e => setSupForm({ ...supForm, terms_days: e.target.value })} /></div>
                <div><label style={lbl}>Bank</label><input style={input} value={supForm.bank_name || ''} onChange={e => setSupForm({ ...supForm, bank_name: e.target.value })} /></div>
                <div><label style={lbl}>Bank account no</label><input style={input} value={supForm.bank_account_no || ''} onChange={e => setSupForm({ ...supForm, bank_account_no: e.target.value })} /></div>
                <div><label style={lbl}>M-PESA no</label><input style={input} value={supForm.mpesa_no || ''} onChange={e => setSupForm({ ...supForm, mpesa_no: e.target.value })} /></div>
              </div>
              <div style={{ marginTop: 12 }}>
                <label style={lbl}>Notes</label>
                <input style={input} value={supForm.notes || ''} onChange={e => setSupForm({ ...supForm, notes: e.target.value })} />
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <button onClick={saveSupplier} disabled={busy} style={btn('#1A5F9C', '#fff', busy)}>{busy ? 'Saving…' : 'Save supplier'}</button>
                <button onClick={() => setSupForm(null)} disabled={busy} style={btn('#F1F0F5', '#4A4A6A', busy)}>Cancel</button>
              </div>
            </div>
          )}

          <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr style={{ background: '#F8FAFC' }}>
                  <th style={th}>Supplier</th><th style={th}>Category</th><th style={th}>Phone</th><th style={th}>KRA PIN</th>
                  <th style={{ ...th, textAlign: 'right' }}>Outstanding (KES)</th><th style={th}></th>
                </tr></thead>
                <tbody>
                  {suppliers.map(s => {
                    const sm = summary[s.id] || {};
                    return (
                      <tr key={s.id} style={{ opacity: s.is_active ? 1 : 0.5 }}>
                        <td style={{ ...td, fontWeight: 700 }}>{s.name}{!s.is_active && <span style={{ marginLeft: 8 }}>{badge('voided')}</span>}</td>
                        <td style={td}>{s.category || '—'}</td>
                        <td style={td}>{s.phone || '—'}</td>
                        <td style={td}>{s.kra_pin || '—'}</td>
                        <td style={{ ...tdNum, fontWeight: 700, color: Number(sm.outstanding) > 0 ? '#B4690E' : '#1B6B3A' }}>{fmt(sm.outstanding)}</td>
                        <td style={{ ...td, whiteSpace: 'nowrap', textAlign: 'right' }}>
                          <button onClick={() => setSupForm({ ...emptySupplier, ...s })} disabled={busy} style={{ ...smallBtn('#F4F9FE', '#1A5F9C'), marginRight: 6 }}>Edit</button>
                          <button onClick={() => toggleSupplier(s)} disabled={busy} style={smallBtn('#F1F0F5', '#4A4A6A')}>{s.is_active ? 'Deactivate' : 'Activate'}</button>
                        </td>
                      </tr>
                    );
                  })}
                  {!suppliers.length && <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: '#8A8FA8', padding: 20 }}>No suppliers yet — add the first one.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ================= BILLS ================= */}
      {tab === 'bills' && (
        <>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
            {!billForm && <button onClick={openNewBill} style={btn('#1A5F9C', '#fff')}>+ New bill</button>}
            <div style={{ flex: 1 }} />
            <select value={billFilter} onChange={e => setBillFilter(e.target.value)} style={{ ...input, width: 170, cursor: 'pointer' }}>
              <option value="open">Open (draft/unpaid)</option>
              <option value="all">All</option>
              <option value="draft">Drafts</option>
              <option value="paid">Paid</option>
              <option value="void">Void</option>
            </select>
          </div>

          {billForm && (
            <div style={card}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#2a2421', marginBottom: billForm.purchase_order_id ? 4 : 14 }}>New supplier bill</div>
              {billForm.purchase_order_id && (
                <div style={{ fontSize: 12, color: '#1B6B3A', fontWeight: 600, marginBottom: 12 }}>
                  ✓ Fulfils {pos.find(p => p.id === billForm.purchase_order_id)?.lpo_no || 'an LPO'} — posting this bill marks the LPO as billed.
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 14 }}>
                <div><label style={lbl}>Supplier *</label>
                  <select style={{ ...input, cursor: 'pointer' }} value={billForm.supplier_id} onChange={e => setBillForm({ ...billForm, supplier_id: e.target.value })}>
                    <option value="">Select…</option>
                    {suppliers.filter(s => s.is_active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div><label style={lbl}>Their invoice no</label><input style={input} value={billForm.supplier_ref} onChange={e => setBillForm({ ...billForm, supplier_ref: e.target.value })} /></div>
                <div><label style={lbl}>Bill date</label><input style={input} type="date" value={billForm.bill_date} onChange={e => setBillForm({ ...billForm, bill_date: e.target.value })} /></div>
                <div><label style={lbl}>Due date (blank = terms)</label><input style={input} type="date" value={billForm.due_date} onChange={e => setBillForm({ ...billForm, due_date: e.target.value })} /></div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={lbl}>Memo</label>
                <input style={input} value={billForm.memo} onChange={e => setBillForm({ ...billForm, memo: e.target.value })} placeholder="e.g. March food supplies" />
              </div>

              <label style={lbl}>Lines — code each to an expense (or asset) account</label>
              {billForm.items.map((it, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                  <select style={{ ...input, flex: 2, cursor: 'pointer' }} value={it.gl_account_id} onChange={e => setItem(i, { gl_account_id: e.target.value })}>
                    <option value="">Account…</option>
                    {glAccounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                  </select>
                  <input style={{ ...input, flex: 3 }} placeholder="Description" value={it.description} onChange={e => setItem(i, { description: e.target.value })} />
                  <input style={{ ...input, width: 64, textAlign: 'right' }} type="number" min="0" placeholder="Qty" value={it.quantity} onChange={e => setItem(i, { quantity: e.target.value })} />
                  <input style={{ ...input, width: 100, textAlign: 'right' }} type="number" min="0" step="0.01" placeholder="Unit cost" value={it.unit_cost} onChange={e => setItem(i, { unit_cost: e.target.value })} />
                  <input style={{ ...input, width: 110, textAlign: 'right', fontFamily: 'monospace' }} type="number" min="0" step="0.01" placeholder="Amount" value={it.amount} onChange={e => setItem(i, { amount: e.target.value })} />
                  <button onClick={() => setBillForm(f => ({ ...f, items: f.items.filter((_, j) => j !== i) }))}
                    disabled={billForm.items.length === 1}
                    style={{ ...smallBtn('#FCEEEC', '#C0392B'), opacity: billForm.items.length === 1 ? 0.4 : 1 }}>✕</button>
                </div>
              ))}
              <button onClick={() => setBillForm(f => ({ ...f, items: [...f.items, emptyItem()] }))} style={{ ...smallBtn('#F4F9FE', '#1A5F9C'), marginBottom: 14 }}>+ Add line</button>

              <div style={{ display: 'flex', gap: 10, alignItems: 'center', borderTop: '1px solid #F1F0F5', paddingTop: 14 }}>
                <div style={{ flex: 1, fontSize: 14, fontWeight: 800, color: '#2a2421' }}>
                  Total: <span style={{ fontFamily: 'monospace' }}>KES {fmt(billTotal(billForm))}</span>
                </div>
                <button onClick={() => saveBill(false)} disabled={busy} style={btn('#F1F0F5', '#4A4A6A', busy)}>Save draft</button>
                <button onClick={() => saveBill(true)} disabled={busy} style={btn('#1A5F9C', '#fff', busy)}>{busy ? 'Saving…' : 'Save & post'}</button>
                <button onClick={() => setBillForm(null)} disabled={busy} style={btn('#fff', '#8A8FA8', busy)}>Cancel</button>
              </div>
            </div>
          )}

          {billDetail && (
            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 14 }}>{billDetail.bill.bill_no}</span>
                {badge(billDetail.bill.status)}
                <span style={{ fontSize: 12.5, color: '#4A4A6A' }}>{billDetail.bill.suppliers?.name}</span>
                <div style={{ flex: 1 }} />
                <button onClick={() => setBillDetail(null)} style={smallBtn('#F1F0F5', '#4A4A6A')}>Close</button>
              </div>
              {billDetail.bill.void_reason && (
                <div style={{ fontSize: 12, color: '#C0392B', marginBottom: 10 }}>Void reason: {billDetail.bill.void_reason}</div>
              )}
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr style={{ background: '#F8FAFC' }}>
                  <th style={th}>Account</th><th style={th}>Description</th>
                  <th style={{ ...th, textAlign: 'right' }}>Qty</th><th style={{ ...th, textAlign: 'right' }}>Unit</th><th style={{ ...th, textAlign: 'right' }}>Amount</th>
                </tr></thead>
                <tbody>
                  {billDetail.items.map(it => (
                    <tr key={it.id}>
                      <td style={td}>{it.gl_accounts?.code} — {it.gl_accounts?.name}</td>
                      <td style={td}>{it.description}</td>
                      <td style={tdNum}>{Number(it.quantity)}</td>
                      <td style={tdNum}>{fmt(it.unit_cost)}</td>
                      <td style={{ ...tdNum, fontWeight: 700 }}>{fmt(it.amount)}</td>
                    </tr>
                  ))}
                  <tr><td style={td} colSpan={4}><strong>Total</strong></td><td style={{ ...tdNum, fontWeight: 800 }}>{fmt(billDetail.bill.total)}</td></tr>
                </tbody>
              </table>
            </div>
          )}

          <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr style={{ background: '#F8FAFC' }}>
                  <th style={th}>Bill</th><th style={th}>Supplier</th><th style={th}>Date</th><th style={th}>Due</th>
                  <th style={{ ...th, textAlign: 'right' }}>Total (KES)</th><th style={th}>Status</th><th style={th}></th>
                </tr></thead>
                <tbody>
                  {visibleBills.map(b => (
                    <tr key={b.id}>
                      <td style={{ ...td, fontFamily: 'monospace', fontSize: 11.5, whiteSpace: 'nowrap' }}>{b.bill_no}{b.supplier_ref ? <span style={{ color: '#8A8FA8' }}> · {b.supplier_ref}</span> : ''}</td>
                      <td style={{ ...td, fontWeight: 600 }}>{b.suppliers?.name}</td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>{b.bill_date}</td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>{b.due_date || '—'}</td>
                      <td style={{ ...tdNum, fontWeight: 700 }}>{fmt(b.total)}</td>
                      <td style={td}>{badge(b.status)}</td>
                      <td style={{ ...td, whiteSpace: 'nowrap', textAlign: 'right' }}>
                        <button onClick={() => openBillDetail(b)} disabled={busy} style={{ ...smallBtn('#F4F9FE', '#1A5F9C'), marginRight: 6 }}>View</button>
                        {b.status === 'draft' && (
                          <button onClick={() => postBill(b)} disabled={busy} style={{ ...smallBtn('#E8F5EE', '#1B6B3A'), marginRight: 6 }}>Post</button>
                        )}
                        {['draft', 'posted'].includes(b.status) && (
                          <button onClick={() => voidBill(b)} disabled={busy} style={smallBtn('#FCEEEC', '#C0392B')}>Void</button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!visibleBills.length && <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: '#8A8FA8', padding: 20 }}>No bills here.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ================= PAYMENTS ================= */}
      {tab === 'payments' && (
        <>
          {!payForm && <button onClick={openNewPayment} style={{ ...btn('#1A5F9C', '#fff'), marginBottom: 16 }}>+ Record payment</button>}

          {payForm && (
            <div style={card}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#2a2421', marginBottom: 14 }}>Pay a supplier</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 14 }}>
                <div><label style={lbl}>Supplier *</label>
                  <select style={{ ...input, cursor: 'pointer' }} value={payForm.supplier_id}
                    onChange={e => { setPayForm({ ...payForm, supplier_id: e.target.value, manual: {} }); loadPayBills(e.target.value); }}>
                    <option value="">Select…</option>
                    {suppliers.filter(s => s.is_active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div><label style={lbl}>Paid from *</label>
                  <select style={{ ...input, cursor: 'pointer' }} value={payForm.bank_account_id} onChange={e => setPayForm({ ...payForm, bank_account_id: e.target.value })}>
                    {bankAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div><label style={lbl}>Amount (KES) *</label><input style={{ ...input, fontFamily: 'monospace', textAlign: 'right' }} type="number" min="0" step="0.01" value={payForm.amount} onChange={e => setPayForm({ ...payForm, amount: e.target.value })} /></div>
                <div><label style={lbl}>Date</label><input style={input} type="date" value={payForm.paid_at} onChange={e => setPayForm({ ...payForm, paid_at: e.target.value })} /></div>
                <div><label style={lbl}>Reference</label><input style={input} placeholder="Cheque / M-PESA code" value={payForm.reference} onChange={e => setPayForm({ ...payForm, reference: e.target.value })} /></div>
                <div><label style={lbl}>Memo</label><input style={input} value={payForm.memo} onChange={e => setPayForm({ ...payForm, memo: e.target.value })} /></div>
              </div>

              {payForm.supplier_id && (
                <div style={{ background: '#F8FAFC', border: '1px solid #E8EAF0', borderRadius: 10, padding: 14, marginBottom: 14 }}>
                  <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 10 }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: '#2a2421' }}>Settles which bills?</span>
                    {[['auto', 'Oldest first (automatic)'], ['manual', 'I choose the split']].map(([m, label]) => (
                      <label key={m} style={{ fontSize: 12.5, color: '#4A4A6A', cursor: 'pointer' }}>
                        <input type="radio" checked={payForm.mode === m} onChange={() => setPayForm({ ...payForm, mode: m })} style={{ marginRight: 5 }} />
                        {label}
                      </label>
                    ))}
                  </div>
                  {!payBills.length ? (
                    <div style={{ fontSize: 12, color: '#8A8FA8' }}>No outstanding bills — the payment sits as supplier credit until a bill is posted.</div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead><tr>
                        <th style={th}>Bill</th><th style={th}>Date</th><th style={{ ...th, textAlign: 'right' }}>Outstanding</th>
                        {payForm.mode === 'manual' && <th style={{ ...th, textAlign: 'right' }}>Pay now</th>}
                      </tr></thead>
                      <tbody>
                        {payBills.map(b => (
                          <tr key={b.id}>
                            <td style={{ ...td, fontFamily: 'monospace', fontSize: 11.5 }}>{b.bill_no}</td>
                            <td style={td}>{b.bill_date}</td>
                            <td style={tdNum}>{fmt(b.outstanding)}</td>
                            {payForm.mode === 'manual' && (
                              <td style={{ ...td, textAlign: 'right' }}>
                                <input type="number" min="0" step="0.01" max={b.outstanding}
                                  value={payForm.manual[b.id] || ''}
                                  onChange={e => setPayForm(f => ({ ...f, manual: { ...f.manual, [b.id]: e.target.value } }))}
                                  style={{ ...input, width: 110, textAlign: 'right', fontFamily: 'monospace' }} />
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={submitPayment} disabled={busy} style={btn('#1A5F9C', '#fff', busy)}>{busy ? 'Posting…' : 'Post payment'}</button>
                <button onClick={() => setPayForm(null)} disabled={busy} style={btn('#F1F0F5', '#4A4A6A', busy)}>Cancel</button>
              </div>
            </div>
          )}

          <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr style={{ background: '#F8FAFC' }}>
                  <th style={th}>Voucher</th><th style={th}>Supplier</th><th style={th}>Paid from</th><th style={th}>Date</th>
                  <th style={{ ...th, textAlign: 'right' }}>Amount (KES)</th><th style={th}>Status</th><th style={th}></th>
                </tr></thead>
                <tbody>
                  {payments.map(p => (
                    <tr key={p.id} style={{ opacity: p.status === 'voided' ? 0.55 : 1 }}>
                      <td style={{ ...td, fontFamily: 'monospace', fontSize: 11.5, whiteSpace: 'nowrap' }}>{p.voucher_no}</td>
                      <td style={{ ...td, fontWeight: 600 }}>{p.suppliers?.name}</td>
                      <td style={td}>{p.bank_accounts?.name}</td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>{p.paid_at}</td>
                      <td style={{ ...tdNum, fontWeight: 700 }}>{fmt(p.amount)}</td>
                      <td style={td}>{badge(p.status)}</td>
                      <td style={{ ...td, whiteSpace: 'nowrap', textAlign: 'right' }}>
                        <button onClick={() => printPaymentVoucher(p)} disabled={busy} style={{ ...smallBtn('#F4F9FE', '#1A5F9C'), marginRight: 6 }}>🖨 Voucher</button>
                        {p.status === 'active' && (
                          <button onClick={() => voidPayment(p)} disabled={busy} style={smallBtn('#FCEEEC', '#C0392B')}>Void</button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!payments.length && <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: '#8A8FA8', padding: 20 }}>No supplier payments yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ================= LPOs ================= */}
      {tab === 'lpos' && (
        <>
          {!poForm && <button onClick={openNewPo} style={{ ...btn('#1A5F9C', '#fff'), marginBottom: 16 }}>+ New LPO</button>}

          {poForm && (
            <div style={card}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#2a2421', marginBottom: 4 }}>New Local Purchase Order</div>
              <div style={{ fontSize: 12, color: '#8A8FA8', marginBottom: 14 }}>An LPO is a promise to buy — nothing posts to the ledger until the supplier's bill arrives.</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 14 }}>
                <div><label style={lbl}>Supplier *</label>
                  <select style={{ ...input, cursor: 'pointer' }} value={poForm.supplier_id} onChange={e => setPoForm({ ...poForm, supplier_id: e.target.value })}>
                    <option value="">Select…</option>
                    {suppliers.filter(s => s.is_active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div><label style={lbl}>Order date</label><input style={input} type="date" value={poForm.order_date} onChange={e => setPoForm({ ...poForm, order_date: e.target.value })} /></div>
                <div style={{ gridColumn: 'span 2' }}><label style={lbl}>Memo</label><input style={input} value={poForm.memo} onChange={e => setPoForm({ ...poForm, memo: e.target.value })} placeholder="e.g. Term 3 kitchen supplies" /></div>
              </div>

              <label style={lbl}>Lines (account optional — it prefills the bill later)</label>
              {poForm.items.map((it, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                  <select style={{ ...input, flex: 2, cursor: 'pointer' }} value={it.gl_account_id} onChange={e => setPoItem(i, { gl_account_id: e.target.value })}>
                    <option value="">Account (optional)…</option>
                    {glAccounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                  </select>
                  <input style={{ ...input, flex: 3 }} placeholder="Description" value={it.description} onChange={e => setPoItem(i, { description: e.target.value })} />
                  <input style={{ ...input, width: 64, textAlign: 'right' }} type="number" min="0" placeholder="Qty" value={it.quantity} onChange={e => setPoItem(i, { quantity: e.target.value })} />
                  <input style={{ ...input, width: 100, textAlign: 'right' }} type="number" min="0" step="0.01" placeholder="Unit cost" value={it.unit_cost} onChange={e => setPoItem(i, { unit_cost: e.target.value })} />
                  <input style={{ ...input, width: 110, textAlign: 'right', fontFamily: 'monospace' }} type="number" min="0" step="0.01" placeholder="Amount" value={it.amount} onChange={e => setPoItem(i, { amount: e.target.value })} />
                  <button onClick={() => setPoForm(f => ({ ...f, items: f.items.filter((_, j) => j !== i) }))}
                    disabled={poForm.items.length === 1}
                    style={{ ...smallBtn('#FCEEEC', '#C0392B'), opacity: poForm.items.length === 1 ? 0.4 : 1 }}>✕</button>
                </div>
              ))}
              <button onClick={() => setPoForm(f => ({ ...f, items: [...f.items, emptyItem()] }))} style={{ ...smallBtn('#F4F9FE', '#1A5F9C'), marginBottom: 14 }}>+ Add line</button>

              <div style={{ display: 'flex', gap: 10, alignItems: 'center', borderTop: '1px solid #F1F0F5', paddingTop: 14 }}>
                <div style={{ flex: 1, fontSize: 14, fontWeight: 800, color: '#2a2421' }}>
                  Total: <span style={{ fontFamily: 'monospace' }}>KES {fmt(billTotal(poForm))}</span>
                </div>
                <button onClick={savePo} disabled={busy} style={btn('#1A5F9C', '#fff', busy)}>{busy ? 'Saving…' : 'Issue LPO'}</button>
                <button onClick={() => setPoForm(null)} disabled={busy} style={btn('#F1F0F5', '#4A4A6A', busy)}>Cancel</button>
              </div>
            </div>
          )}

          <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr style={{ background: '#F8FAFC' }}>
                  <th style={th}>LPO</th><th style={th}>Supplier</th><th style={th}>Date</th>
                  <th style={{ ...th, textAlign: 'right' }}>Total (KES)</th><th style={th}>Status</th><th style={th}></th>
                </tr></thead>
                <tbody>
                  {pos.map(po => (
                    <tr key={po.id} style={{ opacity: po.status === 'cancelled' ? 0.55 : 1 }}>
                      <td style={{ ...td, fontFamily: 'monospace', fontSize: 11.5, whiteSpace: 'nowrap' }}>{po.lpo_no}</td>
                      <td style={{ ...td, fontWeight: 600 }}>{po.suppliers?.name}</td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>{po.order_date}</td>
                      <td style={{ ...tdNum, fontWeight: 700 }}>{fmt(po.total)}</td>
                      <td style={td}>{badge(po.status)}</td>
                      <td style={{ ...td, whiteSpace: 'nowrap', textAlign: 'right' }}>
                        <button onClick={() => printPo(po)} disabled={busy} style={{ ...smallBtn('#F4F9FE', '#1A5F9C'), marginRight: 6 }}>🖨 Print</button>
                        {po.status === 'open' && (
                          <>
                            <button onClick={() => convertPoToBill(po)} disabled={busy} style={{ ...smallBtn('#E8F5EE', '#1B6B3A'), marginRight: 6 }}>Bill arrived</button>
                            <button onClick={() => cancelPo(po)} disabled={busy} style={smallBtn('#FCEEEC', '#C0392B')}>Cancel</button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!pos.length && <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: '#8A8FA8', padding: 20 }}>No purchase orders yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ================= PETTY CASH ================= */}
      {tab === 'petty' && (
        <>
          {!pcvForm && <button onClick={openNewPcv} style={{ ...btn('#1A5F9C', '#fff'), marginBottom: 16 }}>+ Record expense</button>}

          {pcvForm && (
            <div style={card}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#2a2421', marginBottom: 4 }}>Petty cash / direct expense</div>
              <div style={{ fontSize: 12, color: '#8A8FA8', marginBottom: 14 }}>One-step spend with no supplier bill — boda fares, airtime, small repairs. Posts straight to the ledger.</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 14 }}>
                <div><label style={lbl}>Paid to (payee) *</label><input style={input} value={pcvForm.payee} onChange={e => setPcvForm({ ...pcvForm, payee: e.target.value })} /></div>
                <div><label style={lbl}>Expense head *</label>
                  <select style={{ ...input, cursor: 'pointer' }} value={pcvForm.gl_account_id} onChange={e => setPcvForm({ ...pcvForm, gl_account_id: e.target.value })}>
                    <option value="">Select…</option>
                    {glAccounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                  </select>
                </div>
                <div><label style={lbl}>Paid from *</label>
                  <select style={{ ...input, cursor: 'pointer' }} value={pcvForm.bank_account_id} onChange={e => setPcvForm({ ...pcvForm, bank_account_id: e.target.value })}>
                    {bankAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div><label style={lbl}>Amount (KES) *</label><input style={{ ...input, fontFamily: 'monospace', textAlign: 'right' }} type="number" min="0" step="0.01" value={pcvForm.amount} onChange={e => setPcvForm({ ...pcvForm, amount: e.target.value })} /></div>
                <div><label style={lbl}>Date</label><input style={input} type="date" value={pcvForm.expense_date} onChange={e => setPcvForm({ ...pcvForm, expense_date: e.target.value })} /></div>
                <div><label style={lbl}>What for</label><input style={input} value={pcvForm.description} onChange={e => setPcvForm({ ...pcvForm, description: e.target.value })} placeholder="e.g. Gate padlock replacement" /></div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={savePcv} disabled={busy} style={btn('#1A5F9C', '#fff', busy)}>{busy ? 'Posting…' : 'Post expense'}</button>
                <button onClick={() => setPcvForm(null)} disabled={busy} style={btn('#F1F0F5', '#4A4A6A', busy)}>Cancel</button>
              </div>
            </div>
          )}

          <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr style={{ background: '#F8FAFC' }}>
                  <th style={th}>Voucher</th><th style={th}>Payee</th><th style={th}>For</th><th style={th}>Head</th><th style={th}>From</th><th style={th}>Date</th>
                  <th style={{ ...th, textAlign: 'right' }}>Amount (KES)</th><th style={th}>Status</th><th style={th}></th>
                </tr></thead>
                <tbody>
                  {vouchers.map(v => (
                    <tr key={v.id} style={{ opacity: v.status === 'voided' ? 0.55 : 1 }}>
                      <td style={{ ...td, fontFamily: 'monospace', fontSize: 11.5, whiteSpace: 'nowrap' }}>{v.voucher_no}</td>
                      <td style={{ ...td, fontWeight: 600 }}>{v.payee}</td>
                      <td style={td}>{v.description}</td>
                      <td style={td}>{v.gl_accounts ? `${v.gl_accounts.code} ${v.gl_accounts.name}` : ''}</td>
                      <td style={td}>{v.bank_accounts?.name}</td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>{v.expense_date}</td>
                      <td style={{ ...tdNum, fontWeight: 700 }}>{fmt(v.amount)}</td>
                      <td style={td}>{badge(v.status)}</td>
                      <td style={{ ...td, whiteSpace: 'nowrap', textAlign: 'right' }}>
                        <button onClick={() => printPcv(schoolConfig, v)} disabled={busy} style={{ ...smallBtn('#F4F9FE', '#1A5F9C'), marginRight: 6 }}>🖨</button>
                        {v.status === 'active' && (
                          <button onClick={() => voidPcv(v)} disabled={busy} style={smallBtn('#FCEEEC', '#C0392B')}>Void</button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!vouchers.length && <tr><td colSpan={9} style={{ ...td, textAlign: 'center', color: '#8A8FA8', padding: 20 }}>No petty-cash expenses yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ================= REPORTS ================= */}
      {tab === 'reports' && (
        <>
          {/* Supplier statement */}
          <div style={card}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: statement ? 14 : 0 }}>
              <div style={{ flex: 1, minWidth: 150 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#2a2421' }}>Supplier statement</div>
                <div style={{ fontSize: 12, color: '#8A8FA8', marginTop: 2 }}>Bills vs payments, running balance of what the school owes.</div>
              </div>
              <div style={{ minWidth: 170 }}>
                <label style={lbl}>Supplier</label>
                <select style={{ ...input, cursor: 'pointer' }} value={rptSupplier} onChange={e => setRptSupplier(e.target.value)}>
                  <option value="">Select…</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div><label style={lbl}>From</label><input style={input} type="date" value={rptFrom} onChange={e => setRptFrom(e.target.value)} /></div>
              <div><label style={lbl}>To</label><input style={input} type="date" value={rptTo} onChange={e => setRptTo(e.target.value)} /></div>
              <button onClick={runStatement} style={btn('#1A5F9C', '#fff')}>Run</button>
              {statement && (() => {
                const supName = suppliers.find(s => s.id === rptSupplier)?.name || 'supplier';
                const headers = ['Date', 'Document', 'Details', 'Billed', 'Paid', 'Owed'];
                const rows = [
                  [rptFrom || '—', '', 'Opening balance', '', '', fmt(statement.opening_balance)],
                  ...(statement.entries || []).map(e => [e.entry_date, e.doc_no, e.description, Number(e.debit) ? fmt(e.debit) : '', Number(e.credit) ? fmt(e.credit) : '', fmt(e.balance)]),
                ];
                return (
                  <>
                    <button onClick={() => downloadCsv(`statement-${supName.replace(/\s+/g, '-').toLowerCase()}.csv`, headers, rows)} style={btn('#F4F9FE', '#1A5F9C')}>⬇ CSV</button>
                    <button onClick={() => printTable(schoolConfig?.school_name, `Supplier Statement — ${supName}`, headers, rows)} style={btn('#F4F9FE', '#1A5F9C')}>🖨 Print</button>
                  </>
                );
              })()}
            </div>
            {statement && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr style={{ background: '#F8FAFC' }}>
                    <th style={th}>Date</th><th style={th}>Document</th><th style={th}>Details</th>
                    <th style={{ ...th, textAlign: 'right' }}>Billed</th><th style={{ ...th, textAlign: 'right' }}>Paid</th><th style={{ ...th, textAlign: 'right' }}>Owed</th>
                  </tr></thead>
                  <tbody>
                    <tr style={{ background: '#FDFBF7' }}>
                      <td style={td}>{rptFrom || '—'}</td><td style={td} colSpan={2}><strong>Opening balance</strong></td>
                      <td /><td /><td style={{ ...tdNum, fontWeight: 700 }}>{fmt(statement.opening_balance)}</td>
                    </tr>
                    {(statement.entries || []).map((e, i) => (
                      <tr key={i}>
                        <td style={{ ...td, whiteSpace: 'nowrap' }}>{e.entry_date}</td>
                        <td style={{ ...td, fontFamily: 'monospace', fontSize: 11.5 }}>{e.doc_no}</td>
                        <td style={td}>{e.description}</td>
                        <td style={{ ...tdNum, color: '#B4690E' }}>{Number(e.debit) ? fmt(e.debit) : ''}</td>
                        <td style={{ ...tdNum, color: '#1B6B3A' }}>{Number(e.credit) ? fmt(e.credit) : ''}</td>
                        <td style={{ ...tdNum, fontWeight: 600 }}>{fmt(e.balance)}</td>
                      </tr>
                    ))}
                    {!(statement.entries || []).length && (
                      <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: '#8A8FA8' }}>No activity in this period.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* AP aging */}
          <div style={card}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: aging ? 14 : 0 }}>
              <div style={{ flex: 1, minWidth: 150 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#2a2421' }}>AP aging</div>
                <div style={{ fontSize: 12, color: '#8A8FA8', marginTop: 2 }}>Unpaid bills bucketed by how overdue they are (past the due date).</div>
              </div>
              <div><label style={lbl}>As of</label><input style={input} type="date" value={agingAsOf} onChange={e => setAgingAsOf(e.target.value)} /></div>
              <button onClick={runAging} style={btn('#1A5F9C', '#fff')}>Run</button>
              {aging && (() => {
                const headers = ['Supplier', 'Current', '1–30 days', '31–60 days', '61–90 days', 'Over 90', 'Total'];
                const rows = aging.map(r => [r.name, fmt(r.current), fmt(r.d1_30), fmt(r.d31_60), fmt(r.d61_90), fmt(r.d90_plus), fmt(r.total)]);
                return (
                  <>
                    <button onClick={() => downloadCsv(`ap-aging-${agingAsOf}.csv`, headers, rows)} style={btn('#F4F9FE', '#1A5F9C')}>⬇ CSV</button>
                    <button onClick={() => printTable(schoolConfig?.school_name, `Accounts Payable Aging — as of ${agingAsOf}`, headers, rows)} style={btn('#F4F9FE', '#1A5F9C')}>🖨 Print</button>
                  </>
                );
              })()}
            </div>
            {aging && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr style={{ background: '#F8FAFC' }}>
                    <th style={th}>Supplier</th>
                    {['Current', '1–30', '31–60', '61–90', 'Over 90', 'Total'].map(h => <th key={h} style={{ ...th, textAlign: 'right' }}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {aging.map(r => (
                      <tr key={r.supplier_id}>
                        <td style={{ ...td, fontWeight: 600 }}>{r.name}</td>
                        <td style={tdNum}>{fmt(r.current)}</td>
                        <td style={tdNum}>{fmt(r.d1_30)}</td>
                        <td style={{ ...tdNum, color: '#B4690E' }}>{fmt(r.d31_60)}</td>
                        <td style={{ ...tdNum, color: '#C0392B' }}>{fmt(r.d61_90)}</td>
                        <td style={{ ...tdNum, color: '#C0392B', fontWeight: 700 }}>{fmt(r.d90_plus)}</td>
                        <td style={{ ...tdNum, fontWeight: 800 }}>{fmt(r.total)}</td>
                      </tr>
                    ))}
                    {aging.length > 0 && (() => {
                      const tot = (k) => aging.reduce((s, r) => s + Number(r[k] || 0), 0);
                      return (
                        <tr style={{ background: '#FDFBF7', borderTop: '1px solid #E8EAF0' }}>
                          <td style={{ ...td, fontWeight: 800 }}>TOTAL</td>
                          {['current', 'd1_30', 'd31_60', 'd61_90', 'd90_plus', 'total'].map(k => (
                            <td key={k} style={{ ...tdNum, fontWeight: 800 }}>{fmt(tot(k))}</td>
                          ))}
                        </tr>
                      );
                    })()}
                    {!aging.length && <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: '#8A8FA8' }}>Nothing outstanding — all bills settled. 🎉</td></tr>}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Expense summary */}
          <div style={card}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: expSummary ? 14 : 0 }}>
              <div style={{ flex: 1, minWidth: 150 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#2a2421' }}>Expense summary by account</div>
                <div style={{ fontSize: 12, color: '#8A8FA8', marginTop: 2 }}>Every expense head's total from the general ledger — bills, petty cash and payroll alike.</div>
              </div>
              <div><label style={lbl}>From</label><input style={input} type="date" value={expFrom} onChange={e => setExpFrom(e.target.value)} /></div>
              <div><label style={lbl}>To</label><input style={input} type="date" value={expTo} onChange={e => setExpTo(e.target.value)} /></div>
              <button onClick={runExpense} style={btn('#1A5F9C', '#fff')}>Run</button>
              {expSummary && (() => {
                const headers = ['Code', 'Expense head', 'Amount (KES)'];
                const rows = [
                  ...expSummary.map(r => [r.code, r.name, fmt(r.net)]),
                  ['', 'TOTAL', fmt(expSummary.reduce((s, r) => s + r.net, 0))],
                ];
                return (
                  <>
                    <button onClick={() => downloadCsv(`expense-summary-${expFrom}-to-${expTo}.csv`, headers, rows)} style={btn('#F4F9FE', '#1A5F9C')}>⬇ CSV</button>
                    <button onClick={() => printTable(schoolConfig?.school_name, `Expense Summary (${expFrom} to ${expTo})`, headers, rows)} style={btn('#F4F9FE', '#1A5F9C')}>🖨 Print</button>
                  </>
                );
              })()}
            </div>
            {expSummary && (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr style={{ background: '#F8FAFC' }}>
                  <th style={th}>Code</th><th style={th}>Expense head</th><th style={{ ...th, textAlign: 'right' }}>Amount (KES)</th>
                </tr></thead>
                <tbody>
                  {expSummary.map(r => (
                    <tr key={r.account_id}>
                      <td style={{ ...td, fontFamily: 'monospace' }}>{r.code}</td>
                      <td style={td}>{r.name}</td>
                      <td style={{ ...tdNum, fontWeight: 600 }}>{fmt(r.net)}</td>
                    </tr>
                  ))}
                  <tr style={{ background: '#FDFBF7', borderTop: '1px solid #E8EAF0' }}>
                    <td style={td} /><td style={{ ...td, fontWeight: 800 }}>TOTAL</td>
                    <td style={{ ...tdNum, fontWeight: 800 }}>{fmt(expSummary.reduce((s, r) => s + r.net, 0))}</td>
                  </tr>
                  {!expSummary.length && <tr><td colSpan={3} style={{ ...td, textAlign: 'center', color: '#8A8FA8' }}>No expenses in this period.</td></tr>}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default Suppliers;

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';

const GRADES_BY_LEVEL = {
  "Pre-Primary": ["PP1", "PP2"],
  "Primary": ["Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6"],
  "Junior Secondary": ["Grade 7", "Grade 8", "Grade 9"],
  "Senior Secondary": ["Grade 10", "Grade 11", "Grade 12"]
};

const GRADE_NAME_TO_CODE = {
  "PP1": "pp1", "PP2": "pp2",
  "Grade 1": "g1", "Grade 2": "g2", "Grade 3": "g3", "Grade 4": "g4", "Grade 5": "g5", "Grade 6": "g6",
  "Grade 7": "g7", "Grade 8": "g8", "Grade 9": "g9",
  "Grade 10": "g10", "Grade 11": "g11", "Grade 12": "g12"
};

// Mirrors public.fee_level_for_grade() so balances can be computed client-side
// without an RPC round-trip per student.
const feeLevelForGrade = (levelId) => {
  if (["pp1", "pp2"].includes(levelId)) return "pp";
  if (["g1", "g2", "g3"].includes(levelId)) return "lower_pri";
  if (["g4", "g5", "g6"].includes(levelId)) return "upper_pri";
  if (["g7", "g8", "g9"].includes(levelId)) return "jss";
  if (["g10", "g11", "g12"].includes(levelId)) return "sss";
  return null;
};

const studentName = (s) => `${s.first_name || ""} ${s.last_name || ""}`.trim();

const FEE_LEVEL_LABEL = {
  pp: "Pre-Primary (PP1–PP2)",
  lower_pri: "Lower Primary (G1–G3)",
  upper_pri: "Upper Primary (G4–G6)",
  jss: "Junior Secondary (G7–G9)",
  sss: "Senior Secondary (G10–G12)",
};

const INVOICE_STATUS_STYLE = {
  issued:         { background: "#EAF2FA", color: "#1A5F9C", label: "Issued" },
  partially_paid: { background: "#FEF6E7", color: "#8A6A1F", label: "Partially Paid" },
  paid:           { background: "#E8F5EE", color: "#1B6B3A", label: "Paid" },
  cancelled:      { background: "#F5F6F8", color: "#8A8FA8", label: "Cancelled" },
};

// KES amount in words for receipts, e.g. 15250 -> "Fifteen Thousand Two
// Hundred and Fifty Shillings Only".
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function threeDigitsInWords(n) {
  const parts = [];
  if (n >= 100) {
    parts.push(ONES[Math.floor(n / 100)] + " Hundred");
    n %= 100;
    if (n > 0) parts.push("and");
  }
  if (n >= 20) {
    parts.push(TENS[Math.floor(n / 10)] + (n % 10 ? "-" + ONES[n % 10] : ""));
  } else if (n > 0) {
    parts.push(ONES[n]);
  }
  return parts.join(" ");
}

function amountInWords(amount) {
  let n = Math.round(Number(amount) || 0);
  if (n <= 0) return "Zero Shillings Only";
  const groups = [];
  const names = ["", " Thousand", " Million", " Billion"];
  let gi = 0;
  while (n > 0 && gi < names.length) {
    const chunk = n % 1000;
    if (chunk > 0) groups.unshift(threeDigitsInWords(chunk) + names[gi]);
    n = Math.floor(n / 1000);
    gi += 1;
  }
  return groups.join(" ") + " Shillings Only";
}

const Fees = ({ schoolConfig }) => {
  const [activeTab, setActiveTab] = useState("balances");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedLevel, setSelectedLevel] = useState("Senior Secondary");
  const [selectedGrade, setSelectedGrade] = useState("Grade 10");
  const [year, setYear] = useState(new Date().getFullYear());

  const [studentsList, setStudentsList] = useState([]);
  const [structureRows, setStructureRows] = useState([]);   // published fee_structures rows for the year
  const [voteheadsById, setVoteheadsById] = useState({});   // votehead id -> { applies_to, is_active, priority, code, description }
  const [paidByStudent, setPaidByStudent] = useState({});   // student_id -> total paid (active)
  const [payments, setPayments] = useState([]);             // recent fee_payments rows
  const [allocations, setAllocations] = useState([]);       // active allocations (real per-votehead/term paid)
  const [allocModeDefault, setAllocModeDefault] = useState("priority");
  const [isLoading, setIsLoading] = useState(true);

  // Fee Balances term filter + per-student drill-down
  const [termFilter, setTermFilter] = useState("all");      // 'all' | '1' | '2' | '3'
  const [studentModal, setStudentModal] = useState(null);   // student row or null

  // Record-payment modal
  const [payModalFor, setPayModalFor] = useState(null);     // student row or null
  const [payForm, setPayForm] = useState({ amount: "", term: "", method: "mpesa", reference: "", payer_name: "", allocMode: "" });
  const [isSavingPayment, setIsSavingPayment] = useState(false);

  // Receipts
  const [receiptByPayment, setReceiptByPayment] = useState({}); // payment_id -> receipt row
  const [receiptView, setReceiptView] = useState(null);         // data for the receipt modal

  // Discounts & bursaries
  const [sponsors, setSponsors] = useState([]);
  const [adjustments, setAdjustments] = useState([]);
  const [bursaries, setBursaries] = useState([]);
  const [newSponsor, setNewSponsor] = useState({ name: "", type: "cdf", contact: "" });
  const [showAwardModal, setShowAwardModal] = useState(false);
  const [awardForm, setAwardForm] = useState({ studentQuery: "", student_id: "", sponsor_id: "", amount: "", term: "", reference: "" });
  const [isAwarding, setIsAwarding] = useState(false);
  const [discountForm, setDiscountForm] = useState({ kind: "discount", calc: "fixed", value: "", reason: "" });
  const [isApplyingDiscount, setIsApplyingDiscount] = useState(false);

  // Invoices
  const [invoices, setInvoices] = useState([]);
  const [streamsList, setStreamsList] = useState([]);
  const [invTermFilter, setInvTermFilter] = useState("all");
  const [showGenModal, setShowGenModal] = useState(false);
  const [genForm, setGenForm] = useState({ term: "1", scope: "school", feeLevel: "jss", grade: "Grade 7", streamId: "", dueDate: "" });
  const [isGenerating, setIsGenerating] = useState(false);
  const [genResult, setGenResult] = useState(null);
  const [invoiceModal, setInvoiceModal] = useState(null);   // invoice row or null
  const [invoiceItems, setInvoiceItems] = useState([]);
  const [customCharge, setCustomCharge] = useState({ description: "", amount: "" });
  const [isAddingCharge, setIsAddingCharge] = useState(false);

  useEffect(() => {
    if (schoolConfig?.id) loadAll();
  }, [schoolConfig?.id, year]);

  const loadAll = async () => {
    setIsLoading(true);
    try {
      const [students, structures, vhs, pays, invs, strms, spons, adjs, burs, allocs, settings] = await Promise.all([
        supabase.from('students').select('id, adm_no, first_name, last_name, level_id, stream_id, dorm_id, boarding_status')
          .eq('school_id', schoolConfig.id),
        supabase.from('fee_structures').select('fee_level, votehead_id, t1, t2, t3, status')
          .eq('school_id', schoolConfig.id).eq('year', year),
        supabase.from('voteheads').select('id, applies_to, is_active, priority, display_order, code, description')
          .eq('school_id', schoolConfig.id),
        supabase.from('fee_payments')
          .select('id, student_id, amount, term, method, reference, paid_at, payer_name, status')
          .eq('school_id', schoolConfig.id).eq('year', year)
          .order('paid_at', { ascending: false }),
        supabase.from('fee_invoices').select('*')
          .eq('school_id', schoolConfig.id).eq('year', year)
          .order('created_at', { ascending: false }),
        supabase.from('streams').select('id, name, level_id')
          .eq('school_id', schoolConfig.id),
        supabase.from('fee_sponsors').select('*')
          .eq('school_id', schoolConfig.id).order('name'),
        supabase.from('fee_adjustments').select('*')
          .eq('school_id', schoolConfig.id).eq('year', year)
          .order('created_at', { ascending: false }),
        supabase.from('fee_bursary_awards').select('*, fee_sponsors(name)')
          .eq('school_id', schoolConfig.id).eq('year', year)
          .order('created_at', { ascending: false }),
        supabase.from('fee_payment_allocations')
          .select('amount, invoice_id, invoice_item_id, payment_id, adjustment_id, bursary_id, fee_invoices!inner(student_id, term, year), fee_invoice_items(votehead_id), fee_payments(status), fee_adjustments(status), fee_bursary_awards(status)')
          .eq('school_id', schoolConfig.id).eq('fee_invoices.year', year),
        supabase.from('fee_settings').select('allocation_mode')
          .eq('school_id', schoolConfig.id).maybeSingle(),
      ]);

      if (students.error) throw students.error;
      if (structures.error) throw structures.error;
      if (vhs.error) throw vhs.error;
      if (pays.error) throw pays.error;
      if (invs.error) throw invs.error;
      setInvoices(invs.data || []);
      setStreamsList(strms.data || []);
      setSponsors(spons.data || []);
      setAdjustments(adjs.data || []);
      setBursaries(burs.data || []);
      // Keep only allocations whose source (payment/adjustment/bursary) is active.
      setAllocations((allocs.data || []).filter(a =>
        a.fee_payments?.status === 'active'
        || a.fee_adjustments?.status === 'active'
        || a.fee_bursary_awards?.status === 'active'));
      setAllocModeDefault(settings.data?.allocation_mode || 'priority');

      // Receipts (separate query: table may hold many years; key by payment)
      const paymentIds = (pays.data || []).map(p => p.id);
      if (paymentIds.length) {
        const { data: rcts } = await supabase
          .from('fee_receipts').select('payment_id, receipt_no, is_void, issued_at')
          .in('payment_id', paymentIds);
        setReceiptByPayment(Object.fromEntries((rcts || []).map(r => [r.payment_id, r])));
      } else {
        setReceiptByPayment({});
      }

      setStudentsList(students.data || []);
      setStructureRows((structures.data || []).filter(r => (r.status || 'published') === 'published'));
      setVoteheadsById(Object.fromEntries((vhs.data || []).map(v => [v.id, v])));

      const paid = {};
      (pays.data || []).forEach(p => {
        if (p.status === 'voided') return;
        paid[p.student_id] = (paid[p.student_id] || 0) + Number(p.amount);
      });
      setPaidByStudent(paid);
      setPayments(pays.data || []);
    } catch (err) {
      console.error('Error loading fees:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Boarder = the explicit boarding_status (falls back to dorm for old rows).
  const isBoarder = (s) => (s.boarding_status || (s.dorm_id ? 'boarder' : 'day')) === 'boarder';

  // Billed = published structure rows for the student's fee level whose
  // votehead is active and applies to them (by boarding status).
  const billedFor = (s) => {
    const level = feeLevelForGrade(s.level_id);
    return structureRows.reduce((sum, r) => {
      if (r.fee_level !== level) return sum;
      const vh = voteheadsById[r.votehead_id];
      if (vh) {
        if (vh.is_active === false) return sum;
        const scope = vh.applies_to || 'all';
        if (scope === 'boarders' && !isBoarder(s)) return sum;
        if (scope === 'day' && isBoarder(s)) return sum;
      }
      return sum + Number(r.t1) + Number(r.t2) + Number(r.t3);
    }, 0);
  };
  const paidFor = (s) => paidByStudent[s.id] || 0;

  // Active discounts/waivers + bursaries reduce the balance alongside cash.
  const concessionByStudent = useMemo(() => {
    const m = {};
    adjustments.forEach(a => { if (a.status === 'active') m[a.student_id] = (m[a.student_id] || 0) + Number(a.amount); });
    bursaries.forEach(b => { if (b.status === 'active') m[b.student_id] = (m[b.student_id] || 0) + Number(b.amount); });
    return m;
  }, [adjustments, bursaries]);
  const concessionFor = (s) => concessionByStudent[s.id] || 0;
  const balanceFor = (s) => billedFor(s) - paidFor(s) - concessionFor(s);

  // Which (student, term) pairs have real invoices generated (non-cancelled).
  const invoicedTermByStudent = useMemo(() => {
    const m = {};
    invoices.forEach(i => {
      if (i.status === 'cancelled') return;
      (m[i.student_id] = m[i.student_id] || new Set()).add(Number(i.term));
    });
    return m;
  }, [invoices]);

  // Real per-student, per-term, per-votehead settlement from allocations.
  //   realCash[sid][term][vhId], realConc[sid][term][vhId]
  const realByStudent = useMemo(() => {
    const m = {};
    allocations.forEach(a => {
      const sid = a.fee_invoices?.student_id;
      const term = Number(a.fee_invoices?.term);
      const vhId = a.fee_invoice_items?.votehead_id || 'custom';
      if (!sid || !term) return;
      const bucket = (m[sid] = m[sid] || { cash: {}, conc: {} });
      const kind = a.payment_id ? 'cash' : 'conc';
      const t = (bucket[kind][term] = bucket[kind][term] || {});
      t[vhId] = (t[vhId] || 0) + Number(a.amount);
    });
    return m;
  }, [allocations]);

  // The full per-student breakdown: owed / paid / balance by term and votehead.
  // Real allocations are used where invoices exist; the rest of the student's
  // cash is distributed virtually by the school's allocation mode.
  const breakdownFor = (s) => {
    const level = feeLevelForGrade(s.level_id);
    const applicable = structureRows
      .filter(r => r.fee_level === level)
      .map(r => ({ ...r, vh: voteheadsById[r.votehead_id] }))
      .filter(({ vh }) => {
        if (!vh || vh.is_active === false) return false;
        const scope = vh.applies_to || 'all';
        if (scope === 'boarders' && !isBoarder(s)) return false;
        if (scope === 'day' && isBoarder(s)) return false;
        return true;
      })
      .sort((a, b) => (a.vh?.priority ?? 999) - (b.vh?.priority ?? 999)
        || (a.vh?.display_order ?? 0) - (b.vh?.display_order ?? 0));

    // owed[term][vhId]
    const owed = { 1: {}, 2: {}, 3: {} };
    applicable.forEach(r => {
      owed[1][r.votehead_id] = Number(r.t1);
      owed[2][r.votehead_id] = Number(r.t2);
      owed[3][r.votehead_id] = Number(r.t3);
    });

    const real = realByStudent[s.id] || { cash: {}, conc: {} };
    const cashReal = (t, vh) => (real.cash[t] && real.cash[t][vh]) || 0;
    const concReal = (t, vh) => (real.conc[t] && real.conc[t][vh]) || 0;

    // Virtual pool = total active cash not tied to real allocations.
    const totalCash = paidFor(s);
    let totalCashReal = 0;
    [1, 2, 3].forEach(t => Object.values(real.cash[t] || {}).forEach(v => { totalCashReal += v; }));
    let pool = Math.max(0, totalCash - totalCashReal);

    // Cells needing virtual cash: owed minus real cash minus concession, >0.
    const cells = [];
    applicable.forEach(r => {
      [1, 2, 3].forEach(t => {
        const remaining = (owed[t][r.votehead_id] || 0) - cashReal(t, r.votehead_id) - concReal(t, r.votehead_id);
        if (remaining > 0.005) cells.push({ term: t, vhId: r.votehead_id, priority: r.vh?.priority ?? 999, remaining });
      });
    });

    const virtual = { 1: {}, 2: {}, 3: {} };
    if (pool > 0.005 && cells.length) {
      if (allocModeDefault === 'percentage') {
        const totalRemaining = cells.reduce((sum, c) => sum + c.remaining, 0);
        cells.forEach(c => {
          const give = Math.min(c.remaining, Math.round((pool * c.remaining / totalRemaining) * 100) / 100);
          virtual[c.term][c.vhId] = (virtual[c.term][c.vhId] || 0) + give;
        });
      } else {
        // priority: term ascending, then votehead priority
        cells.sort((a, b) => a.term - b.term || a.priority - b.priority);
        cells.forEach(c => {
          if (pool <= 0.005) return;
          const give = Math.min(c.remaining, pool);
          virtual[c.term][c.vhId] = (virtual[c.term][c.vhId] || 0) + give;
          pool -= give;
        });
      }
    }

    // Assemble per-term rows + totals.
    const terms = {};
    [1, 2, 3].forEach(t => {
      const rows = applicable.map(r => {
        const o = owed[t][r.votehead_id] || 0;
        const cash = cashReal(t, r.votehead_id) + (virtual[t][r.votehead_id] || 0);
        const conc = concReal(t, r.votehead_id);
        return {
          vhId: r.votehead_id,
          code: r.vh?.code || '—',
          description: r.vh?.description || '—',
          owed: o, paid: cash, concession: conc,
          balance: o - cash - conc,
        };
      }).filter(row => row.owed > 0 || row.paid > 0 || row.concession > 0);
      const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
      terms[t] = {
        rows,
        owed: sum('owed'), paid: sum('paid'), concession: sum('concession'), balance: sum('balance'),
        isReal: (invoicedTermByStudent[s.id] || new Set()).has(t),
      };
    });

    const yr = {
      owed: billedFor(s), paid: totalCash, concession: concessionFor(s),
      balance: billedFor(s) - totalCash - concessionFor(s),
    };
    yr.overpay = yr.balance < 0 ? -yr.balance : 0;
    return { terms, year: yr };
  };

  // Per-term view helpers for the list.
  const listMetricsFor = (s) => {
    if (termFilter === 'all') {
      const bal = balanceFor(s);
      return { billed: billedFor(s), paid: paidFor(s), balance: bal };
    }
    const b = breakdownFor(s).terms[Number(termFilter)];
    return { billed: b.owed, paid: b.paid, balance: b.balance };
  };

  const filteredStudents = useMemo(() => {
    const targetGradeId = selectedGrade === "all" ? null : GRADE_NAME_TO_CODE[selectedGrade];
    const levelGrades = GRADES_BY_LEVEL[selectedLevel].map(name => GRADE_NAME_TO_CODE[name]);

    return studentsList
      .filter(s => {
        const q = searchTerm.toLowerCase();
        const matchesSearch = studentName(s).toLowerCase().includes(q) || (s.adm_no || "").toLowerCase().includes(q);
        const matchesLevel = levelGrades.includes(s.level_id);
        const matchesGrade = selectedGrade === "all" ? true : s.level_id === targetGradeId;
        return matchesSearch && matchesLevel && matchesGrade;
      })
      .map(s => ({ ...s, concession: concessionFor(s), ...listMetricsFor(s) }))
      .sort((a, b) => b.balance - a.balance);
  }, [studentsList, structureRows, voteheadsById, paidByStudent, concessionByStudent, realByStudent, allocModeDefault, termFilter, searchTerm, selectedLevel, selectedGrade]);

  const studentById = useMemo(() => {
    const m = {};
    studentsList.forEach(s => { m[s.id] = s; });
    return m;
  }, [studentsList]);

  const filteredPayments = useMemo(() => {
    const q = searchTerm.toLowerCase();
    return payments.filter(p => {
      const s = studentById[p.student_id];
      const name = s ? studentName(s) : "";
      return name.toLowerCase().includes(q)
        || (s?.adm_no || "").toLowerCase().includes(q)
        || (p.reference || "").toLowerCase().includes(q);
    });
  }, [payments, studentById, searchTerm]);

  const openPayModal = (student) => {
    setPayForm({ amount: "", term: "", method: "mpesa", reference: "", payer_name: "", allocMode: "" });
    setPayModalFor(student);
  };

  // Records via the record_fee_payment RPC: one transaction that inserts the
  // payment, allocates it to outstanding invoices (oldest first, votehead
  // priority), updates invoice statuses and issues a sequential receipt.
  const handleSavePayment = async () => {
    const amount = parseFloat(payForm.amount);
    if (!amount || amount <= 0) { alert('Enter a valid amount.'); return; }
    setIsSavingPayment(true);
    try {
      const student = payModalFor;
      const { data, error } = await supabase.rpc('record_fee_payment', {
        p_school_id: schoolConfig.id,
        p_student_id: student.id,
        p_amount: amount,
        p_year: year,
        p_method: payForm.method || null,
        p_reference: payForm.reference.trim() || null,
        p_payer_name: payForm.payer_name.trim() || null,
        p_term: payForm.term ? parseInt(payForm.term) : null,
        p_allocation_mode: payForm.allocMode || null,
      });
      if (error) throw error;

      await loadAll();
      setPayModalFor(null);
      setReceiptView({
        receiptNo: data.receipt_no,
        student,
        amount: Number(data.amount),
        allocations: data.allocations || [],
        credit: Number(data.credit || 0),
        method: payForm.method,
        reference: payForm.reference.trim(),
        payerName: payForm.payer_name.trim(),
        paidAt: new Date().toISOString(),
        isVoid: false,
      });
    } catch (err) {
      alert('Failed to record payment: ' + err.message);
    } finally {
      setIsSavingPayment(false);
    }
  };

  const handleVoidPayment = async (p) => {
    const rct = receiptByPayment[p.id];
    const reason = window.prompt(`Void this payment of KES ${Number(p.amount).toLocaleString()}${rct ? ` (receipt ${rct.receipt_no})` : ""}?\n\nEnter the void reason (required):`);
    if (reason === null) return;
    try {
      const { error } = await supabase.rpc('void_fee_payment', { p_payment_id: p.id, p_reason: reason });
      if (error) throw error;
      await loadAll();
    } catch (err) {
      alert('Failed to void payment: ' + err.message);
    }
  };

  // Reprint from the payments list: pull this payment's allocation split.
  const handleViewReceipt = async (p) => {
    const s = studentById[p.student_id];
    let allocations = [];
    try {
      const { data } = await supabase
        .from('fee_payment_allocations')
        .select('amount, fee_invoice_items(description), fee_invoices(invoice_no)')
        .eq('payment_id', p.id);
      allocations = (data || []).map(a => ({
        description: a.fee_invoice_items?.description || '—',
        invoice_no: a.fee_invoices?.invoice_no || '',
        amount: a.amount,
      }));
    } catch (err) {
      console.error('Failed to load allocations:', err);
    }
    const allocated = allocations.reduce((sum, a) => sum + Number(a.amount), 0);
    setReceiptView({
      receiptNo: receiptByPayment[p.id]?.receipt_no || '(no receipt — recorded before receipting)',
      student: s,
      amount: Number(p.amount),
      allocations,
      credit: Number(p.amount) - allocated,
      method: p.method,
      reference: p.reference || '',
      payerName: p.payer_name || '',
      paidAt: p.paid_at,
      isVoid: p.status === 'voided',
    });
  };

  const printReceipt = () => {
    const rv = receiptView;
    if (!rv) return;
    const s = rv.student;
    const balance = s ? balanceFor(s) : null;
    const rows = (rv.allocations || []).map(a =>
      `<tr><td>${a.description}${a.invoice_no ? ` <span class="mut">(${a.invoice_no})</span>` : ""}</td><td class="amt">${Number(a.amount).toLocaleString()}</td></tr>`
    ).join("");
    const w = window.open('', '_blank', 'width=440,height=640');
    if (!w) { alert('Allow pop-ups to print receipts.'); return; }
    w.document.write(`<!doctype html><html><head><title>${rv.receiptNo}</title><style>
      body { font-family: 'Courier New', monospace; font-size: 12.5px; color: #111; margin: 18px; position: relative; }
      h2 { text-align: center; margin: 0 0 2px; font-size: 15px; }
      .sub { text-align: center; margin: 0 0 12px; font-size: 11px; }
      .line { border-top: 1px dashed #555; margin: 8px 0; }
      table { width: 100%; border-collapse: collapse; }
      td { padding: 3px 0; vertical-align: top; }
      .amt { text-align: right; white-space: nowrap; }
      .mut { color: #666; font-size: 10.5px; }
      .tot td { border-top: 1px solid #111; font-weight: bold; padding-top: 6px; }
      .void { position: absolute; top: 38%; left: 8%; font-size: 52px; color: rgba(192,57,43,0.35);
              transform: rotate(-24deg); font-weight: bold; letter-spacing: 8px; }
      .words { font-size: 11px; font-style: italic; margin-top: 6px; }
      .foot { margin-top: 14px; font-size: 10.5px; color: #444; text-align: center; }
      @media print { .noprint { display: none; } }
    </style></head><body>
      ${rv.isVoid ? '<div class="void">VOID</div>' : ''}
      <h2>${schoolConfig?.schoolName || 'School'}</h2>
      <p class="sub">${schoolConfig?.address || ''} ${schoolConfig?.phone ? '· ' + schoolConfig.phone : ''}<br/>OFFICIAL FEE RECEIPT</p>
      <div class="line"></div>
      <table>
        <tr><td>Receipt No:</td><td class="amt"><strong>${rv.receiptNo}</strong></td></tr>
        <tr><td>Date:</td><td class="amt">${new Date(rv.paidAt).toLocaleString()}</td></tr>
        <tr><td>Student:</td><td class="amt">${s ? studentName(s) : '—'}</td></tr>
        <tr><td>Adm No:</td><td class="amt">${s?.adm_no || '—'}</td></tr>
        ${rv.payerName ? `<tr><td>Paid by:</td><td class="amt">${rv.payerName}</td></tr>` : ''}
        <tr><td>Method:</td><td class="amt">${(rv.method || '—').toUpperCase()}${rv.reference ? ' · ' + rv.reference : ''}</td></tr>
      </table>
      <div class="line"></div>
      <table>
        <tr><td><strong>SETTLED</strong></td><td class="amt"><strong>KES</strong></td></tr>
        ${rows || '<tr><td class="mut" colspan="2">Held as credit — no outstanding invoice at time of payment.</td></tr>'}
        ${rv.credit > 0 ? `<tr><td>Credit carried forward</td><td class="amt">${rv.credit.toLocaleString()}</td></tr>` : ''}
        <tr class="tot"><td>TOTAL PAID</td><td class="amt">${rv.amount.toLocaleString()}</td></tr>
      </table>
      <p class="words">Amount in words: ${amountInWords(rv.amount)}</p>
      ${balance !== null ? `<div class="line"></div><table><tr><td>Balance (${year}):</td><td class="amt"><strong>KES ${balance.toLocaleString()}</strong></td></tr></table>` : ''}
      <p class="foot">Generated by EduConnect KE · ${new Date().toLocaleString()}</p>
      <div class="noprint" style="text-align:center;margin-top:14px;">
        <button onclick="window.print()" style="padding:8px 22px;">Print</button>
      </div>
    </body></html>`);
    w.document.close();
    w.focus();
  };

  // --- Invoices ---

  const filteredInvoices = useMemo(() => {
    const q = searchTerm.toLowerCase();
    return invoices.filter(inv => {
      if (invTermFilter !== "all" && String(inv.term) !== invTermFilter) return false;
      const s = studentById[inv.student_id];
      const name = s ? studentName(s) : "";
      return name.toLowerCase().includes(q)
        || (s?.adm_no || "").toLowerCase().includes(q)
        || (inv.invoice_no || "").toLowerCase().includes(q);
    });
  }, [invoices, invTermFilter, studentById, searchTerm]);

  const handleGenerateInvoices = async () => {
    setIsGenerating(true);
    setGenResult(null);
    try {
      const params = {
        p_school_id: schoolConfig.id,
        p_year: year,
        p_term: parseInt(genForm.term),
      };
      if (genForm.scope === "fee_level") params.p_fee_level = genForm.feeLevel;
      if (genForm.scope === "grade" || genForm.scope === "stream") params.p_level_id = GRADE_NAME_TO_CODE[genForm.grade];
      if (genForm.scope === "stream" && genForm.streamId) params.p_stream_id = genForm.streamId;
      if (genForm.dueDate) params.p_due_date = genForm.dueDate;

      const { data, error } = await supabase.rpc('generate_invoices', params);
      if (error) throw error;
      setGenResult(data);
      await loadAll();
    } catch (err) {
      alert('Invoice generation failed: ' + err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const openInvoice = async (inv) => {
    setInvoiceModal(inv);
    setInvoiceItems([]);
    setCustomCharge({ description: "", amount: "" });
    try {
      const { data, error } = await supabase
        .from('fee_invoice_items').select('*')
        .eq('invoice_id', inv.id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      setInvoiceItems(data || []);
    } catch (err) {
      console.error('Failed to load invoice items:', err);
    }
  };

  const handleCancelInvoice = async (inv) => {
    const reason = window.prompt(`Cancel invoice ${inv.invoice_no}?\n\nEnter the cancellation reason (required):`);
    if (reason === null) return;
    try {
      const { error } = await supabase.rpc('cancel_fee_invoice', { p_invoice_id: inv.id, p_reason: reason });
      if (error) throw error;
      setInvoiceModal(null);
      await loadAll();
    } catch (err) {
      alert('Failed to cancel invoice: ' + err.message);
    }
  };

  const handleAddCharge = async () => {
    const amount = parseFloat(customCharge.amount);
    if (!customCharge.description.trim()) { alert('Enter a description for the charge.'); return; }
    if (!amount || amount <= 0) { alert('Enter a valid amount.'); return; }
    setIsAddingCharge(true);
    try {
      const { error } = await supabase.rpc('add_invoice_item', {
        p_invoice_id: invoiceModal.id,
        p_description: customCharge.description.trim(),
        p_amount: amount,
      });
      if (error) throw error;
      setCustomCharge({ description: "", amount: "" });
      const updated = { ...invoiceModal, total: Number(invoiceModal.total) + amount };
      setInvoiceModal(updated);
      setInvoices(prev => prev.map(i => i.id === updated.id ? updated : i));
      await openInvoice(updated);
    } catch (err) {
      alert('Failed to add charge: ' + err.message);
    } finally {
      setIsAddingCharge(false);
    }
  };

  // --- Discounts & bursaries ---

  const handleAddSponsor = async () => {
    if (!newSponsor.name.trim()) { alert('Enter the sponsor name.'); return; }
    try {
      const { data, error } = await supabase.from('fee_sponsors').insert([{
        school_id: schoolConfig.id,
        name: newSponsor.name.trim(),
        type: newSponsor.type,
        contact: newSponsor.contact.trim() || null,
      }]).select().single();
      if (error) throw error;
      setSponsors(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setNewSponsor({ name: "", type: "cdf", contact: "" });
    } catch (err) {
      alert('Failed to add sponsor: ' + err.message);
    }
  };

  const handleAwardBursary = async () => {
    const amount = parseFloat(awardForm.amount);
    if (!awardForm.student_id) { alert('Pick the student.'); return; }
    if (!awardForm.sponsor_id) { alert('Pick the sponsor.'); return; }
    if (!amount || amount <= 0) { alert('Enter a valid amount.'); return; }
    setIsAwarding(true);
    try {
      const { data, error } = await supabase.rpc('award_fee_bursary', {
        p_school_id: schoolConfig.id,
        p_student_id: awardForm.student_id,
        p_sponsor_id: awardForm.sponsor_id,
        p_year: year,
        p_amount: amount,
        p_term: awardForm.term ? parseInt(awardForm.term) : null,
        p_reference: awardForm.reference.trim() || null,
      });
      if (error) throw error;
      await loadAll();
      setShowAwardModal(false);
      if (Number(data?.unapplied) > 0) {
        alert(`Bursary awarded. KES ${Number(data.unapplied).toLocaleString()} is not yet applied (no outstanding invoice) — it will settle automatically when invoices are generated.`);
      }
    } catch (err) {
      alert('Failed to award bursary: ' + err.message);
    } finally {
      setIsAwarding(false);
    }
  };

  const handleVoidBursary = async (b) => {
    const reason = window.prompt(`Void this bursary of KES ${Number(b.amount).toLocaleString()}?\n\nEnter the void reason (required):`);
    if (reason === null) return;
    try {
      const { error } = await supabase.rpc('void_fee_bursary', { p_bursary_id: b.id, p_reason: reason });
      if (error) throw error;
      await loadAll();
    } catch (err) {
      alert('Failed to void bursary: ' + err.message);
    }
  };

  const handleVoidAdjustment = async (a) => {
    const reason = window.prompt(`Void this ${a.kind} of KES ${Number(a.amount).toLocaleString()}?\n\nEnter the void reason (required):`);
    if (reason === null) return;
    try {
      const { error } = await supabase.rpc('void_fee_adjustment', { p_adjustment_id: a.id, p_reason: reason });
      if (error) throw error;
      await loadAll();
    } catch (err) {
      alert('Failed to void adjustment: ' + err.message);
    }
  };

  const handleApplyDiscount = async () => {
    const value = parseFloat(discountForm.value);
    if (!value || value <= 0) { alert('Enter a valid value.'); return; }
    if (!discountForm.reason.trim() || discountForm.reason.trim().length < 3) { alert('A reason is required.'); return; }
    setIsApplyingDiscount(true);
    try {
      const { error } = await supabase.rpc('apply_fee_adjustment', {
        p_invoice_id: invoiceModal.id,
        p_kind: discountForm.kind,
        p_calc: discountForm.calc,
        p_value: value,
        p_reason: discountForm.reason.trim(),
      });
      if (error) throw error;
      setDiscountForm({ kind: "discount", calc: "fixed", value: "", reason: "" });
      setInvoiceModal(null);
      await loadAll();
    } catch (err) {
      alert('Failed to apply: ' + err.message);
    } finally {
      setIsApplyingDiscount(false);
    }
  };

  const awardStudentMatches = useMemo(() => {
    const q = awardForm.studentQuery.toLowerCase();
    if (!q) return studentsList.slice(0, 50);
    return studentsList
      .filter(s => studentName(s).toLowerCase().includes(q) || (s.adm_no || "").toLowerCase().includes(q))
      .slice(0, 50);
  }, [studentsList, awardForm.studentQuery]);

  const tabStyle = (active) => ({
    padding: "10px 4px", fontSize: 14, fontWeight: 700,
    color: active ? "#1B6B3A" : "#8A8FA8",
    borderBottom: active ? "2px solid #1B6B3A" : "2px solid transparent",
    cursor: "pointer", transition: "all 0.2s", whiteSpace: "nowrap",
  });

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div
        style={{ display: "flex", gap: 20, marginBottom: 18, borderBottom: "1px solid #E8EAF0", overflowX: "auto", paddingBottom: 2, flexWrap: "nowrap" }}
        className="sidebar-scroll"
      >
        <div onClick={() => setActiveTab("balances")} style={tabStyle(activeTab === "balances")}>Fee Balances</div>
        <div onClick={() => setActiveTab("invoices")} style={tabStyle(activeTab === "invoices")}>Invoices</div>
        <div onClick={() => setActiveTab("transactions")} style={tabStyle(activeTab === "transactions")}>Payments</div>
        <div onClick={() => setActiveTab("concessions")} style={tabStyle(activeTab === "concessions")}>Discounts &amp; Bursaries</div>
      </div>

      <div className="grid-1" style={{ marginBottom: 16, display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 12, alignItems: "center" }}>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 13 }}>🔍</span>
            <input
              type="text"
              placeholder={activeTab === "balances" ? "Search student..." : activeTab === "invoices" ? "Search invoice or student..." : "Search payment..."}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ width: "100%", padding: "10px 12px 10px 32px", borderRadius: 8, border: "1px solid #E8EAF0", fontSize: 13, outline: "none", boxSizing: "border-box" }}
            />
          </div>

          {activeTab === "invoices" && (
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: "#8A8FA8", whiteSpace: "nowrap" }}>TERM:</span>
                <select
                  value={invTermFilter}
                  onChange={(e) => setInvTermFilter(e.target.value)}
                  style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #E8EAF0", fontSize: 13, background: "#fff", outline: "none" }}
                >
                  <option value="all">All terms</option>
                  <option value="1">Term 1</option>
                  <option value="2">Term 2</option>
                  <option value="3">Term 3</option>
                </select>
              </div>
              <button
                onClick={() => { setGenResult(null); setShowGenModal(true); }}
                style={{ padding: "9px 16px", background: "#1A5F9C", border: "none", borderRadius: 8, fontSize: 12.5, color: "#fff", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
              >⚡ Generate Invoices</button>
            </div>
          )}

          {activeTab === "balances" && (
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: "#8A8FA8", whiteSpace: "nowrap" }}>LEVEL:</span>
                <select
                  value={selectedLevel}
                  onChange={(e) => { setSelectedLevel(e.target.value); setSelectedGrade(GRADES_BY_LEVEL[e.target.value][0]); }}
                  style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #E8EAF0", fontSize: 13, background: "#fff", outline: "none", minWidth: "140px" }}
                >
                  {Object.keys(GRADES_BY_LEVEL).map(lvl => <option key={lvl} value={lvl}>{lvl}</option>)}
                </select>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: "#8A8FA8", whiteSpace: "nowrap" }}>GRADE:</span>
                <select
                  value={selectedGrade}
                  onChange={(e) => setSelectedGrade(e.target.value)}
                  style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #E8EAF0", fontSize: 13, background: "#fff", outline: "none", minWidth: "120px" }}
                >
                  <option value="all">All {selectedLevel}</option>
                  {GRADES_BY_LEVEL[selectedLevel].map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: "#8A8FA8", whiteSpace: "nowrap" }}>TERM:</span>
                <select
                  value={termFilter}
                  onChange={(e) => setTermFilter(e.target.value)}
                  style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #E8EAF0", fontSize: 13, background: "#fff", outline: "none" }}
                >
                  <option value="all">Full year</option>
                  <option value="1">Term 1</option>
                  <option value="2">Term 2</option>
                  <option value="3">Term 3</option>
                </select>
              </div>
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: "#8A8FA8", whiteSpace: "nowrap" }}>YEAR:</span>
          <select
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value))}
            style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #E8EAF0", fontSize: 13, background: "#fff", outline: "none" }}
          >
            {[new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      <div className="table-container" style={{ background: "#fff", border: "1px solid #E8EAF0", borderRadius: 12, overflow: "hidden", flex: 1 }}>
        {isLoading ? (
          <div style={{ padding: 40, textAlign: "center", color: "#8A8FA8", fontSize: 13 }}>Loading…</div>
        ) : activeTab === "balances" ? (
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 13 }}>
            <thead style={{ background: "#FAFBFC", borderBottom: "1px solid #E8EAF0" }}>
              <tr>
                <th style={thStyle}>ADM No.</th>
                <th style={thStyle}>Student Name</th>
                <th className="hide-mobile" style={thStyle}>{termFilter === "all" ? "Billed" : `Term ${termFilter} Billed`}</th>
                <th className="hide-mobile" style={thStyle}>Paid</th>
                <th style={thStyle}>{termFilter === "all" ? "Balance" : `Term ${termFilter} Balance`}</th>
                <th className="hide-mobile" style={thStyle}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.length === 0 ? (
                <tr><td colSpan="6" style={{ textAlign: "center", padding: 30, color: "#8A8FA8" }}>No students match this filter.</td></tr>
              ) : filteredStudents.slice(0, 100).map((s, idx) => {
                const over = s.balance < 0;
                return (
                <tr key={s.id} onClick={() => setStudentModal(s)}
                    style={{ borderBottom: "1px solid #F7F8FA", background: idx % 2 === 0 ? "#fff" : "#FAFBFC", cursor: "pointer" }}>
                  <td style={{ padding: "12px 18px", fontWeight: 600, color: "#1A5F9C" }}>{s.adm_no}</td>
                  <td style={{ padding: "12px 18px" }}>
                    <div style={{ fontWeight: 700, color: "#1A1A2E" }}>{studentName(s)} <span style={{ fontSize: 10.5, color: "#b8b2a6", fontWeight: 500 }}>· view breakdown</span></div>
                    {s.concession > 0 && (
                      <div style={{ fontSize: 10.5, color: "#6C3483", fontWeight: 600 }}>🎁 KES {s.concession.toLocaleString()} in bursaries/discounts</div>
                    )}
                    <div className="show-mobile" style={{ fontSize: 11, color: "#8A8FA8" }}>
                      Paid: {s.paid.toLocaleString()} / {s.billed.toLocaleString()}
                    </div>
                  </td>
                  <td className="hide-mobile" style={{ padding: "12px 18px" }}>KES {s.billed.toLocaleString()}</td>
                  <td className="hide-mobile" style={{ padding: "12px 18px", color: "#1B6B3A", fontWeight: 600 }}>KES {s.paid.toLocaleString()}</td>
                  <td style={{ padding: "12px 18px" }}>
                    {over ? (
                      <span style={{ fontWeight: 700, color: "#8A6A1F" }}>KES {Math.abs(s.balance).toLocaleString()} <span style={{ fontSize: 10, fontWeight: 800, background: "#FEF6E7", padding: "1px 6px", borderRadius: 999 }}>OVERPAID</span></span>
                    ) : (
                      <span style={{ fontWeight: 700, color: s.balance > 0 ? "#C0392B" : "#1B6B3A" }}>KES {s.balance.toLocaleString()}</span>
                    )}
                  </td>
                  <td className="hide-mobile" style={{ padding: "12px 18px" }}>
                    <button onClick={(e) => { e.stopPropagation(); openPayModal(s); }} style={{ padding: "5px 12px", background: "#1B6B3A", border: "none", borderRadius: 6, fontSize: 11, color: "#fff", fontWeight: 600, cursor: "pointer" }}>
                      + Payment
                    </button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        ) : activeTab === "invoices" ? (
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 13 }}>
            <thead style={{ background: "#FAFBFC", borderBottom: "1px solid #E8EAF0" }}>
              <tr>
                <th style={thStyle}>Invoice No.</th>
                <th style={thStyle}>Student</th>
                <th className="hide-mobile" style={thStyle}>Term</th>
                <th className="hide-mobile" style={thStyle}>Issued</th>
                <th style={thStyle}>Total</th>
                <th style={thStyle}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.length === 0 ? (
                <tr><td colSpan="6" style={{ textAlign: "center", padding: 30, color: "#8A8FA8" }}>
                  No invoices yet for {year}. Use <strong>⚡ Generate Invoices</strong> to bill students from the published fee structure.
                </td></tr>
              ) : filteredInvoices.slice(0, 200).map((inv, idx) => {
                const s = studentById[inv.student_id];
                const st = INVOICE_STATUS_STYLE[inv.status] || INVOICE_STATUS_STYLE.issued;
                return (
                  <tr key={inv.id} onClick={() => openInvoice(inv)}
                      style={{ borderBottom: "1px solid #F7F8FA", background: idx % 2 === 0 ? "#fff" : "#FAFBFC", cursor: "pointer" }}>
                    <td style={{ padding: "12px 18px", fontWeight: 600, color: "#1A5F9C", fontFamily: "monospace", fontSize: 12 }}>{inv.invoice_no}</td>
                    <td style={{ padding: "12px 18px" }}>
                      <div style={{ fontWeight: 700, color: "#1A1A2E", textDecoration: inv.status === 'cancelled' ? 'line-through' : 'none' }}>{s ? studentName(s) : "—"}</div>
                      <div style={{ fontSize: 11, color: "#8A8FA8" }}>{s?.adm_no}</div>
                    </td>
                    <td className="hide-mobile" style={{ padding: "12px 18px", color: "#4A4A6A" }}>Term {inv.term}</td>
                    <td className="hide-mobile" style={{ padding: "12px 18px", color: "#4A4A6A" }}>{new Date(inv.issue_date).toLocaleDateString()}</td>
                    <td style={{ padding: "12px 18px", fontWeight: 700, color: "#1A1A2E" }}>KES {Number(inv.total).toLocaleString()}</td>
                    <td style={{ padding: "12px 18px" }}>
                      <span style={{ padding: "3px 10px", borderRadius: 999, fontSize: 10.5, fontWeight: 800, background: st.background, color: st.color }}>{st.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : activeTab === "concessions" ? (
          <div style={{ padding: 20 }}>
            {/* Sponsors */}
            <div style={{ marginBottom: 22 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#8A8FA8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>Sponsors</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", padding: 14, background: "#F8FAFC", border: "1px dashed #D0D5DD", borderRadius: 10, marginBottom: 10 }}>
                <div style={{ flex: 2, minWidth: 160 }}>
                  <label style={modalLabel}>Sponsor name</label>
                  <input type="text" placeholder="e.g. NG-CDF Turbo" value={newSponsor.name}
                    onChange={(e) => setNewSponsor({ ...newSponsor, name: e.target.value })} style={modalInput} />
                </div>
                <div style={{ width: 140 }}>
                  <label style={modalLabel}>Type</label>
                  <select value={newSponsor.type} onChange={(e) => setNewSponsor({ ...newSponsor, type: e.target.value })} style={modalInput}>
                    <option value="cdf">CDF</option>
                    <option value="county">County</option>
                    <option value="ngo">NGO</option>
                    <option value="individual">Individual</option>
                    <option value="school">School</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <label style={modalLabel}>Contact (optional)</label>
                  <input type="text" placeholder="phone / email" value={newSponsor.contact}
                    onChange={(e) => setNewSponsor({ ...newSponsor, contact: e.target.value })} style={modalInput} />
                </div>
                <button onClick={handleAddSponsor}
                  style={{ padding: "10px 18px", background: "#1A5F9C", border: "none", borderRadius: 8, fontSize: 12.5, color: "#fff", fontWeight: 700, cursor: "pointer" }}>
                  + Add Sponsor
                </button>
              </div>
              {sponsors.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {sponsors.map(sp => (
                    <span key={sp.id} style={{ padding: "5px 12px", background: "#fff", border: "1px solid #E8EAF0", borderRadius: 999, fontSize: 12 }}>
                      <strong>{sp.name}</strong> <span style={{ color: "#8A8FA8", textTransform: "uppercase", fontSize: 10 }}>· {sp.type}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Bursary awards */}
            <div style={{ marginBottom: 22 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#8A8FA8", textTransform: "uppercase", letterSpacing: "0.05em" }}>Bursary Awards — {year}</div>
                <button onClick={() => { setAwardForm({ studentQuery: "", student_id: "", sponsor_id: sponsors[0]?.id || "", amount: "", term: "", reference: "" }); setShowAwardModal(true); }}
                  style={{ padding: "8px 14px", background: "#6C3483", border: "none", borderRadius: 8, fontSize: 12, color: "#fff", fontWeight: 700, cursor: "pointer" }}>
                  🎁 Award Bursary
                </button>
              </div>
              {bursaries.length === 0 ? (
                <div style={{ padding: 18, textAlign: "center", color: "#8A8FA8", fontSize: 12.5, background: "#FAFBFC", borderRadius: 10 }}>No bursaries awarded for {year} yet.</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                  <thead><tr style={{ borderBottom: "2px solid #E8EAF0" }}>
                    <th style={thStyle}>Date</th><th style={thStyle}>Student</th><th style={thStyle}>Sponsor</th>
                    <th style={thStyle}>Amount</th><th className="hide-mobile" style={thStyle}>Term / Ref</th><th style={thStyle}></th>
                  </tr></thead>
                  <tbody>
                    {bursaries.map(b => {
                      const s = studentById[b.student_id];
                      const voided = b.status === 'voided';
                      return (
                        <tr key={b.id} style={{ borderBottom: "1px solid #F0F2F5", opacity: voided ? 0.6 : 1 }}>
                          <td style={{ padding: "10px 14px", color: "#4A4A6A" }}>{new Date(b.created_at).toLocaleDateString()}</td>
                          <td style={{ padding: "10px 14px", fontWeight: 700 }}>{s ? studentName(s) : "—"} <span style={{ color: "#8A8FA8", fontWeight: 400 }}>{s?.adm_no}</span></td>
                          <td style={{ padding: "10px 14px" }}>{b.fee_sponsors?.name || "—"}</td>
                          <td style={{ padding: "10px 14px", fontWeight: 700, color: voided ? "#8A8FA8" : "#6C3483", textDecoration: voided ? "line-through" : "none" }}>KES {Number(b.amount).toLocaleString()}</td>
                          <td className="hide-mobile" style={{ padding: "10px 14px", color: "#4A4A6A" }}>{b.term ? `Term ${b.term}` : "Whole year"}{b.reference ? ` · ${b.reference}` : ""}</td>
                          <td style={{ padding: "10px 14px", textAlign: "right" }}>
                            {voided ? <span style={{ padding: "2px 8px", borderRadius: 999, fontSize: 9.5, fontWeight: 800, background: "#FDF0ED", color: "#C0392B" }}>VOID</span> : (
                              <button onClick={() => handleVoidBursary(b)} style={{ padding: "4px 10px", background: "#fff", border: "1px solid #C0392B", borderRadius: 6, fontSize: 11, color: "#C0392B", fontWeight: 700, cursor: "pointer" }}>Void</button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Adjustments */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#8A8FA8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
                Discounts, Waivers &amp; Credit Notes — {year}
                <span style={{ fontWeight: 500, textTransform: "none", marginLeft: 8, letterSpacing: 0 }}>(apply from an invoice: Invoices tab → open invoice)</span>
              </div>
              {adjustments.length === 0 ? (
                <div style={{ padding: 18, textAlign: "center", color: "#8A8FA8", fontSize: 12.5, background: "#FAFBFC", borderRadius: 10 }}>None yet for {year}.</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                  <thead><tr style={{ borderBottom: "2px solid #E8EAF0" }}>
                    <th style={thStyle}>Date</th><th style={thStyle}>Student</th><th style={thStyle}>Kind</th>
                    <th style={thStyle}>Amount</th><th className="hide-mobile" style={thStyle}>Reason</th><th style={thStyle}></th>
                  </tr></thead>
                  <tbody>
                    {adjustments.map(a => {
                      const s = studentById[a.student_id];
                      const voided = a.status === 'voided';
                      return (
                        <tr key={a.id} style={{ borderBottom: "1px solid #F0F2F5", opacity: voided ? 0.6 : 1 }}>
                          <td style={{ padding: "10px 14px", color: "#4A4A6A" }}>{new Date(a.created_at).toLocaleDateString()}</td>
                          <td style={{ padding: "10px 14px", fontWeight: 700 }}>{s ? studentName(s) : "—"} <span style={{ color: "#8A8FA8", fontWeight: 400 }}>{s?.adm_no}</span></td>
                          <td style={{ padding: "10px 14px", textTransform: "capitalize" }}>{a.kind.replace('_', ' ')}{a.calc === 'percentage' ? ` (${Number(a.value)}%)` : ""}</td>
                          <td style={{ padding: "10px 14px", fontWeight: 700, color: voided ? "#8A8FA8" : "#8A6A1F", textDecoration: voided ? "line-through" : "none" }}>KES {Number(a.amount).toLocaleString()}</td>
                          <td className="hide-mobile" style={{ padding: "10px 14px", color: "#4A4A6A" }}>{a.reason}</td>
                          <td style={{ padding: "10px 14px", textAlign: "right" }}>
                            {voided ? <span style={{ padding: "2px 8px", borderRadius: 999, fontSize: 9.5, fontWeight: 800, background: "#FDF0ED", color: "#C0392B" }}>VOID</span> : (
                              <button onClick={() => handleVoidAdjustment(a)} style={{ padding: "4px 10px", background: "#fff", border: "1px solid #C0392B", borderRadius: 6, fontSize: 11, color: "#C0392B", fontWeight: 700, cursor: "pointer" }}>Void</button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 13 }}>
            <thead style={{ background: "#FAFBFC", borderBottom: "1px solid #E8EAF0" }}>
              <tr>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Student</th>
                <th style={thStyle}>Amount</th>
                <th className="hide-mobile" style={thStyle}>Method</th>
                <th className="hide-mobile" style={thStyle}>Receipt</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredPayments.length === 0 ? (
                <tr><td colSpan="6" style={{ textAlign: "center", padding: 30, color: "#8A8FA8" }}>No payments recorded yet.</td></tr>
              ) : filteredPayments.map((p, idx) => {
                const s = studentById[p.student_id];
                const rct = receiptByPayment[p.id];
                const voided = p.status === 'voided';
                return (
                  <tr key={p.id} style={{ borderBottom: "1px solid #F7F8FA", background: idx % 2 === 0 ? "#fff" : "#FAFBFC", opacity: voided ? 0.65 : 1 }}>
                    <td style={{ padding: "12px 18px", color: "#4A4A6A" }}>{new Date(p.paid_at).toLocaleDateString()}</td>
                    <td style={{ padding: "12px 18px" }}>
                      <div style={{ fontWeight: 700, color: "#1A1A2E" }}>{s ? studentName(s) : "—"}</div>
                      <div style={{ fontSize: 11, color: "#8A8FA8" }}>{s?.adm_no}{p.term ? ` · Term ${p.term}` : ""}{p.payer_name ? ` · by ${p.payer_name}` : ""}</div>
                    </td>
                    <td style={{ padding: "12px 18px" }}>
                      <span style={{ fontWeight: 700, color: voided ? "#8A8FA8" : "#1B6B3A", textDecoration: voided ? "line-through" : "none" }}>
                        KES {Number(p.amount).toLocaleString()}
                      </span>
                      {voided && <span style={{ marginLeft: 8, padding: "2px 8px", borderRadius: 999, fontSize: 9.5, fontWeight: 800, background: "#FDF0ED", color: "#C0392B" }}>VOID</span>}
                    </td>
                    <td className="hide-mobile" style={{ padding: "12px 18px", color: "#4A4A6A", textTransform: "capitalize" }}>{p.method || "—"}{p.reference ? ` · ${p.reference}` : ""}</td>
                    <td className="hide-mobile" style={{ padding: "12px 18px", fontFamily: "monospace", fontSize: 12, color: "#1A5F9C" }}>{rct?.receipt_no || "—"}</td>
                    <td style={{ padding: "12px 18px", whiteSpace: "nowrap" }}>
                      <button onClick={() => handleViewReceipt(p)} title="View / print receipt"
                        style={{ padding: "5px 10px", background: "#fff", border: "1px solid #1A5F9C", borderRadius: 6, fontSize: 11, color: "#1A5F9C", fontWeight: 700, cursor: "pointer", marginRight: 6 }}>
                        🖨 Receipt
                      </button>
                      {!voided && (
                        <button onClick={() => handleVoidPayment(p)} title="Void this payment"
                          style={{ padding: "5px 10px", background: "#fff", border: "1px solid #C0392B", borderRadius: 6, fontSize: 11, color: "#C0392B", fontWeight: 700, cursor: "pointer" }}>
                          Void
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Generate Invoices Modal */}
      {showGenModal && (
        <div
          onClick={() => !isGenerating && setShowGenModal(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, padding: 24, width: "100%", maxWidth: 460, boxShadow: "0 12px 40px rgba(0,0,0,0.2)" }}>
            <h3 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 800, color: "#2a2421" }}>Generate Invoices — {year}</h3>
            <p style={{ margin: "0 0 14px", fontSize: 12.5, color: "#8A8FA8", lineHeight: 1.5 }}>
              Bills each targeted student from the <strong>published</strong> fee structure for their level.
              Boarder-only fees skip day scholars. Students already invoiced for the term are skipped.
            </p>

            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={modalLabel}>Term</label>
                <select value={genForm.term} onChange={(e) => setGenForm({ ...genForm, term: e.target.value })} style={modalInput}>
                  <option value="1">Term 1</option>
                  <option value="2">Term 2</option>
                  <option value="3">Term 3</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={modalLabel}>Due Date (optional)</label>
                <input type="date" value={genForm.dueDate} onChange={(e) => setGenForm({ ...genForm, dueDate: e.target.value })} style={modalInput} />
              </div>
            </div>

            <label style={modalLabel}>Who to invoice</label>
            <select value={genForm.scope} onChange={(e) => setGenForm({ ...genForm, scope: e.target.value })} style={modalInput}>
              <option value="school">Whole school</option>
              <option value="fee_level">One CBC level</option>
              <option value="grade">One grade</option>
              <option value="stream">One grade &amp; stream</option>
            </select>

            {genForm.scope === "fee_level" && (
              <>
                <label style={modalLabel}>CBC Level</label>
                <select value={genForm.feeLevel} onChange={(e) => setGenForm({ ...genForm, feeLevel: e.target.value })} style={modalInput}>
                  {Object.entries(FEE_LEVEL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </>
            )}

            {(genForm.scope === "grade" || genForm.scope === "stream") && (
              <>
                <label style={modalLabel}>Grade</label>
                <select value={genForm.grade} onChange={(e) => setGenForm({ ...genForm, grade: e.target.value, streamId: "" })} style={modalInput}>
                  {Object.values(GRADES_BY_LEVEL).flat().map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </>
            )}

            {genForm.scope === "stream" && (
              <>
                <label style={modalLabel}>Stream</label>
                <select value={genForm.streamId} onChange={(e) => setGenForm({ ...genForm, streamId: e.target.value })} style={modalInput}>
                  <option value="">All streams in {genForm.grade}</option>
                  {streamsList.filter(st => st.level_id === GRADE_NAME_TO_CODE[genForm.grade]).map(st => (
                    <option key={st.id} value={st.id}>{st.name}</option>
                  ))}
                </select>
              </>
            )}

            {genResult && (
              <div style={{ marginTop: 14, padding: "12px 14px", borderRadius: 10, background: "#E8F5EE", border: "1.5px solid #1B6B3A", fontSize: 13, color: "#1B6B3A", lineHeight: 1.6 }}>
                <div style={{ fontWeight: 800 }}>✓ Run complete</div>
                <div><strong>{genResult.created}</strong> invoice{genResult.created === 1 ? "" : "s"} created · KES {Number(genResult.total_billed || 0).toLocaleString()} billed</div>
                {genResult.skipped_existing > 0 && <div>{genResult.skipped_existing} skipped — already invoiced this term</div>}
                {genResult.skipped_no_structure > 0 && <div>{genResult.skipped_no_structure} skipped — no published fees for their level</div>}
              </div>
            )}

            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button onClick={() => setShowGenModal(false)} disabled={isGenerating} style={{ flex: 1, padding: 12, background: "#fff", border: "1px solid #e6dfd8", borderRadius: 10, fontWeight: 600, color: "#8a8fa8", cursor: "pointer" }}>
                {genResult ? "Close" : "Cancel"}
              </button>
              <button onClick={handleGenerateInvoices} disabled={isGenerating} style={{ flex: 1, padding: 12, background: isGenerating ? "#8a8fa8" : "#1A5F9C", border: "none", borderRadius: 10, fontWeight: 700, color: "#fff", cursor: isGenerating ? "wait" : "pointer" }}>
                {isGenerating ? "Generating…" : genResult ? "Run Again" : "Generate"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invoice Detail Modal */}
      {invoiceModal && (() => {
        const s = studentById[invoiceModal.student_id];
        const st = INVOICE_STATUS_STYLE[invoiceModal.status] || INVOICE_STATUS_STYLE.issued;
        const isCancelled = invoiceModal.status === 'cancelled';
        return (
          <div
            onClick={() => setInvoiceModal(null)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}
          >
            <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 520, maxHeight: "88vh", overflowY: "auto", boxShadow: "0 12px 40px rgba(0,0,0,0.2)" }}>
              <div style={{ padding: "20px 24px", borderBottom: "1px solid #E8EAF0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontFamily: "monospace", fontSize: 13, color: "#1A5F9C", fontWeight: 700 }}>{invoiceModal.invoice_no}</div>
                  <h3 style={{ margin: "4px 0 2px", fontSize: 18, fontWeight: 800, color: "#2a2421" }}>{s ? studentName(s) : "—"}</h3>
                  <div style={{ fontSize: 12, color: "#8A8FA8" }}>
                    {s?.adm_no} · Term {invoiceModal.term}, {invoiceModal.year}
                    {invoiceModal.due_date ? ` · due ${new Date(invoiceModal.due_date).toLocaleDateString()}` : ""}
                  </div>
                </div>
                <span style={{ padding: "4px 12px", borderRadius: 999, fontSize: 11, fontWeight: 800, background: st.background, color: st.color }}>{st.label}</span>
              </div>

              <div style={{ padding: "16px 24px" }}>
                {isCancelled && (
                  <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 10, background: "#FDF0ED", border: "1px solid #C0392B", fontSize: 12.5, color: "#C0392B" }}>
                    Cancelled{invoiceModal.cancelled_at ? ` on ${new Date(invoiceModal.cancelled_at).toLocaleDateString()}` : ""}: {invoiceModal.cancel_reason || "no reason recorded"}
                  </div>
                )}

                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid #E8EAF0" }}>
                      <th style={{ padding: "8px 4px", textAlign: "left", fontSize: 10.5, color: "#8A8FA8", fontWeight: 800 }}>ITEM</th>
                      <th style={{ padding: "8px 4px", textAlign: "right", fontSize: 10.5, color: "#8A8FA8", fontWeight: 800 }}>AMOUNT (KES)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoiceItems.length === 0 ? (
                      <tr><td colSpan="2" style={{ padding: 16, textAlign: "center", color: "#8A8FA8" }}>Loading items…</td></tr>
                    ) : invoiceItems.map(item => (
                      <tr key={item.id} style={{ borderBottom: "1px solid #F0F2F5" }}>
                        <td style={{ padding: "9px 4px", color: "#2a2421", fontWeight: 600 }}>
                          {item.description}
                          {item.is_custom && <span style={{ marginLeft: 8, padding: "1px 7px", borderRadius: 999, fontSize: 9.5, fontWeight: 800, background: "#F5EEF8", color: "#6C3483" }}>CUSTOM</span>}
                        </td>
                        <td style={{ padding: "9px 4px", textAlign: "right", fontFamily: "monospace", fontWeight: 600 }}>{Number(item.amount).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td style={{ padding: "10px 4px", fontWeight: 800, color: "#2a2421" }}>TOTAL</td>
                      <td style={{ padding: "10px 4px", textAlign: "right", fontFamily: "monospace", fontWeight: 800, fontSize: 14.5, color: "#1A5F9C" }}>{Number(invoiceModal.total).toLocaleString()}</td>
                    </tr>
                  </tfoot>
                </table>

                {!isCancelled && (
                  <div style={{ marginTop: 14, padding: 12, background: "#F8FAFC", border: "1px solid #E8EAF0", borderRadius: 10 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 800, color: "#4A4A6A", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Add custom charge</div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input type="text" placeholder='e.g. "Lost library book"' value={customCharge.description}
                        onChange={(e) => setCustomCharge({ ...customCharge, description: e.target.value })}
                        style={{ ...modalInput, flex: 2 }} />
                      <input type="number" placeholder="KES" value={customCharge.amount}
                        onChange={(e) => setCustomCharge({ ...customCharge, amount: e.target.value })}
                        style={{ ...modalInput, flex: 1 }} />
                      <button onClick={handleAddCharge} disabled={isAddingCharge}
                        style={{ padding: "0 16px", background: isAddingCharge ? "#8a8fa8" : "#2a2421", border: "none", borderRadius: 8, fontSize: 12, color: "#fff", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                        {isAddingCharge ? "…" : "+ Add"}
                      </button>
                    </div>
                  </div>
                )}

                {!isCancelled && (
                  <div style={{ marginTop: 10, padding: 12, background: "#FDF9F0", border: "1px solid #EAD9A8", borderRadius: 10 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 800, color: "#8A6A1F", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Apply discount / waiver</div>
                    <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                      <select value={discountForm.kind} onChange={(e) => setDiscountForm({ ...discountForm, kind: e.target.value })} style={{ ...modalInput, flex: 1 }}>
                        <option value="discount">Discount</option>
                        <option value="waiver">Waiver</option>
                        <option value="credit_note">Credit note</option>
                      </select>
                      <select value={discountForm.calc} onChange={(e) => setDiscountForm({ ...discountForm, calc: e.target.value })} style={{ ...modalInput, flex: 1 }}>
                        <option value="fixed">Fixed (KES)</option>
                        <option value="percentage">% of invoice</option>
                      </select>
                      <input type="number" placeholder={discountForm.calc === 'percentage' ? "%" : "KES"} value={discountForm.value}
                        onChange={(e) => setDiscountForm({ ...discountForm, value: e.target.value })}
                        style={{ ...modalInput, flex: 1 }} />
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input type="text" placeholder="Reason (required)" value={discountForm.reason}
                        onChange={(e) => setDiscountForm({ ...discountForm, reason: e.target.value })}
                        style={{ ...modalInput, flex: 2 }} />
                      <button onClick={handleApplyDiscount} disabled={isApplyingDiscount}
                        style={{ padding: "0 16px", background: isApplyingDiscount ? "#8a8fa8" : "#8A6A1F", border: "none", borderRadius: 8, fontSize: 12, color: "#fff", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                        {isApplyingDiscount ? "…" : "Apply"}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div style={{ padding: "14px 24px", background: "#f5f2eb", borderTop: "1px solid #E8EAF0", display: "flex", justifyContent: "space-between", gap: 10 }}>
                {!isCancelled ? (
                  <button onClick={() => handleCancelInvoice(invoiceModal)}
                    style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid #C0392B", background: "#fff", color: "#C0392B", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                    Cancel Invoice
                  </button>
                ) : <span />}
                <button onClick={() => setInvoiceModal(null)}
                  style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: "#1A5F9C", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  Done
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Record Payment Modal */}
      {payModalFor && (
        <div
          onClick={() => setPayModalFor(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, padding: 24, width: "100%", maxWidth: 420, boxShadow: "0 12px 40px rgba(0,0,0,0.2)" }}>
            <h3 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 800, color: "#2a2421" }}>Record Payment</h3>
            <p style={{ margin: "0 0 18px", fontSize: 13, color: "#8A8FA8" }}>
              {studentName(payModalFor)} · {payModalFor.adm_no} · {year}
            </p>

            <label style={modalLabel}>Amount (KES)</label>
            <input type="number" value={payForm.amount} autoFocus placeholder="0"
              onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} style={modalInput} />

            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={modalLabel}>Term</label>
                <select value={payForm.term} onChange={(e) => setPayForm({ ...payForm, term: e.target.value })} style={modalInput}>
                  <option value="">—</option>
                  <option value="1">Term 1</option>
                  <option value="2">Term 2</option>
                  <option value="3">Term 3</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={modalLabel}>Method</label>
                <select value={payForm.method} onChange={(e) => setPayForm({ ...payForm, method: e.target.value })} style={modalInput}>
                  <option value="mpesa">M-Pesa</option>
                  <option value="cash">Cash</option>
                  <option value="bank">Bank</option>
                  <option value="cheque">Cheque</option>
                </select>
              </div>
            </div>

            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={modalLabel}>Reference (optional)</label>
                <input type="text" value={payForm.reference} placeholder="e.g. M-Pesa code"
                  onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })} style={modalInput} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={modalLabel}>Paid by (optional)</label>
                <input type="text" value={payForm.payer_name} placeholder="e.g. parent's name"
                  onChange={(e) => setPayForm({ ...payForm, payer_name: e.target.value })} style={modalInput} />
              </div>
            </div>

            <label style={modalLabel}>Spread across voteheads by</label>
            <select value={payForm.allocMode} onChange={(e) => setPayForm({ ...payForm, allocMode: e.target.value })} style={modalInput}>
              <option value="">School default ({allocModeDefault === 'percentage' ? 'Percentage' : 'Priority'})</option>
              <option value="priority">Priority (votehead order)</option>
              <option value="percentage">Percentage (pro-rata)</option>
            </select>

            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button onClick={() => setPayModalFor(null)} style={{ flex: 1, padding: 12, background: "#fff", border: "1px solid #e6dfd8", borderRadius: 10, fontWeight: 600, color: "#8a8fa8", cursor: "pointer" }}>Cancel</button>
              <button onClick={handleSavePayment} disabled={isSavingPayment} style={{ flex: 1, padding: 12, background: isSavingPayment ? "#8a8fa8" : "#1B6B3A", border: "none", borderRadius: 10, fontWeight: 700, color: "#fff", cursor: isSavingPayment ? "wait" : "pointer" }}>
                {isSavingPayment ? "Saving…" : "Save & Issue Receipt"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Award Bursary Modal */}
      {showAwardModal && (
        <div
          onClick={() => !isAwarding && setShowAwardModal(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, padding: 24, width: "100%", maxWidth: 440, boxShadow: "0 12px 40px rgba(0,0,0,0.2)" }}>
            <h3 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 800, color: "#2a2421" }}>🎁 Award Bursary — {year}</h3>
            <p style={{ margin: "0 0 14px", fontSize: 12.5, color: "#8A8FA8", lineHeight: 1.5 }}>
              The award reduces the student's payable balance and appears as a distinct line on their statement.
            </p>

            <label style={modalLabel}>Find student</label>
            <input type="text" placeholder="Search name or adm no…" value={awardForm.studentQuery}
              onChange={(e) => setAwardForm({ ...awardForm, studentQuery: e.target.value, student_id: "" })} style={modalInput} />

            <label style={modalLabel}>Student</label>
            <select value={awardForm.student_id} onChange={(e) => setAwardForm({ ...awardForm, student_id: e.target.value })} style={modalInput}>
              <option value="">-- pick student --</option>
              {awardStudentMatches.map(s => (
                <option key={s.id} value={s.id}>{studentName(s)} · {s.adm_no}</option>
              ))}
            </select>

            <label style={modalLabel}>Sponsor</label>
            <select value={awardForm.sponsor_id} onChange={(e) => setAwardForm({ ...awardForm, sponsor_id: e.target.value })} style={modalInput}>
              <option value="">-- pick sponsor --</option>
              {sponsors.map(sp => <option key={sp.id} value={sp.id}>{sp.name} ({sp.type})</option>)}
            </select>

            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={modalLabel}>Amount (KES)</label>
                <input type="number" placeholder="0" value={awardForm.amount}
                  onChange={(e) => setAwardForm({ ...awardForm, amount: e.target.value })} style={modalInput} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={modalLabel}>Term (optional)</label>
                <select value={awardForm.term} onChange={(e) => setAwardForm({ ...awardForm, term: e.target.value })} style={modalInput}>
                  <option value="">Whole year</option>
                  <option value="1">Term 1</option>
                  <option value="2">Term 2</option>
                  <option value="3">Term 3</option>
                </select>
              </div>
            </div>

            <label style={modalLabel}>Award reference (optional)</label>
            <input type="text" placeholder="e.g. cheque / letter no." value={awardForm.reference}
              onChange={(e) => setAwardForm({ ...awardForm, reference: e.target.value })} style={modalInput} />

            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button onClick={() => setShowAwardModal(false)} disabled={isAwarding} style={{ flex: 1, padding: 12, background: "#fff", border: "1px solid #e6dfd8", borderRadius: 10, fontWeight: 600, color: "#8a8fa8", cursor: "pointer" }}>Cancel</button>
              <button onClick={handleAwardBursary} disabled={isAwarding} style={{ flex: 1, padding: 12, background: isAwarding ? "#8a8fa8" : "#6C3483", border: "none", borderRadius: 10, fontWeight: 700, color: "#fff", cursor: isAwarding ? "wait" : "pointer" }}>
                {isAwarding ? "Awarding…" : "Award Bursary"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Student Fee Breakdown Modal — votehead × term matrix */}
      {studentModal && (() => {
        const bd = breakdownFor(studentModal);
        const termsToShow = termFilter === 'all' ? [1, 2, 3] : [Number(termFilter)];
        return (
          <div
            onClick={() => setStudentModal(null)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}
          >
            <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 640, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 12px 40px rgba(0,0,0,0.2)" }}>
              <div style={{ padding: "20px 24px", borderBottom: "1px solid #E8EAF0", display: "flex", justifyContent: "space-between", alignItems: "flex-start", position: "sticky", top: 0, background: "#fff" }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#2a2421" }}>{studentName(studentModal)}</h3>
                  <div style={{ fontSize: 12, color: "#8A8FA8", marginTop: 2 }}>
                    {studentModal.adm_no} · {year} · {isBoarder(studentModal) ? 'Boarder' : 'Day scholar'}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 10.5, fontWeight: 800, color: "#8A8FA8", textTransform: "uppercase" }}>Year balance</div>
                  <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "monospace", color: bd.year.balance > 0 ? "#C0392B" : (bd.year.overpay > 0 ? "#8A6A1F" : "#1B6B3A") }}>
                    KES {Math.abs(bd.year.balance).toLocaleString()}
                  </div>
                  {bd.year.overpay > 0 && <div style={{ fontSize: 10, fontWeight: 800, color: "#8A6A1F" }}>OVERPAID</div>}
                </div>
              </div>

              <div style={{ padding: "8px 24px 20px" }}>
                {/* Year summary strip */}
                <div style={{ display: "flex", gap: 10, margin: "12px 0 6px", flexWrap: "wrap" }}>
                  {[["Billed", bd.year.owed, "#4A4A6A"], ["Paid", bd.year.paid, "#1B6B3A"], ["Concessions", bd.year.concession, "#6C3483"]].map(([lbl, val, col]) => (
                    <div key={lbl} style={{ flex: 1, minWidth: 120, padding: "8px 12px", background: "#F8FAFC", borderRadius: 8 }}>
                      <div style={{ fontSize: 10, fontWeight: 800, color: "#8A8FA8", textTransform: "uppercase" }}>{lbl}</div>
                      <div style={{ fontSize: 14, fontWeight: 800, fontFamily: "monospace", color: col }}>KES {Number(val).toLocaleString()}</div>
                    </div>
                  ))}
                </div>

                {termsToShow.map(t => {
                  const term = bd.terms[t];
                  return (
                    <div key={t} style={{ marginTop: 16 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: "#2a2421" }}>Term {t}</div>
                        <span style={{ padding: "2px 9px", borderRadius: 999, fontSize: 9.5, fontWeight: 800, background: term.isReal ? "#EAF2FA" : "#FEF6E7", color: term.isReal ? "#1A5F9C" : "#8A6A1F" }}>
                          {term.isReal ? "REAL · invoiced" : "ESTIMATED"}
                        </span>
                      </div>
                      {term.rows.length === 0 ? (
                        <div style={{ padding: "12px 14px", background: "#FAFBFC", borderRadius: 8, fontSize: 12.5, color: "#8A8FA8" }}>No charges for this term.</div>
                      ) : (
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                          <thead>
                            <tr style={{ borderBottom: "2px solid #E8EAF0" }}>
                              <th style={{ padding: "6px 8px", textAlign: "left", fontSize: 10, color: "#8A8FA8", fontWeight: 800 }}>VOTEHEAD</th>
                              <th style={{ padding: "6px 8px", textAlign: "right", fontSize: 10, color: "#8A8FA8", fontWeight: 800 }}>OWED</th>
                              <th style={{ padding: "6px 8px", textAlign: "right", fontSize: 10, color: "#8A8FA8", fontWeight: 800 }}>PAID</th>
                              <th style={{ padding: "6px 8px", textAlign: "right", fontSize: 10, color: "#8A8FA8", fontWeight: 800 }}>BALANCE</th>
                            </tr>
                          </thead>
                          <tbody>
                            {term.rows.map(r => (
                              <tr key={r.vhId} style={{ borderBottom: "1px solid #F0F2F5" }}>
                                <td style={{ padding: "7px 8px", color: "#2a2421" }}>
                                  <strong>{r.code}</strong> <span style={{ color: "#8A8FA8" }}>{r.description}</span>
                                  {r.concession > 0 && <span style={{ marginLeft: 6, fontSize: 10, color: "#6C3483" }}>🎁 {r.concession.toLocaleString()}</span>}
                                </td>
                                <td style={{ padding: "7px 8px", textAlign: "right", fontFamily: "monospace" }}>{r.owed.toLocaleString()}</td>
                                <td style={{ padding: "7px 8px", textAlign: "right", fontFamily: "monospace", color: "#1B6B3A" }}>{Math.round(r.paid).toLocaleString()}</td>
                                <td style={{ padding: "7px 8px", textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: r.balance > 0.5 ? "#C0392B" : "#1B6B3A" }}>{Math.round(r.balance).toLocaleString()}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr style={{ borderTop: "2px solid #2a2421" }}>
                              <td style={{ padding: "8px", fontWeight: 800 }}>Term {t} total</td>
                              <td style={{ padding: "8px", textAlign: "right", fontFamily: "monospace", fontWeight: 800 }}>{term.owed.toLocaleString()}</td>
                              <td style={{ padding: "8px", textAlign: "right", fontFamily: "monospace", fontWeight: 800, color: "#1B6B3A" }}>{Math.round(term.paid).toLocaleString()}</td>
                              <td style={{ padding: "8px", textAlign: "right", fontFamily: "monospace", fontWeight: 800, color: term.balance > 0.5 ? "#C0392B" : "#1B6B3A" }}>{Math.round(term.balance).toLocaleString()}</td>
                            </tr>
                          </tfoot>
                        </table>
                      )}
                    </div>
                  );
                })}

                <div style={{ marginTop: 14, fontSize: 11, color: "#8A8FA8", lineHeight: 1.5 }}>
                  {termsToShow.some(t => !bd.terms[t].isReal)
                    ? `“Estimated” terms distribute this student's payments across voteheads using the ${allocModeDefault === 'percentage' ? 'percentage (pro-rata)' : 'priority'} method. Generate that term's invoices to lock in real allocations.`
                    : "All shown terms use real invoice allocations tied to receipts and the ledger."}
                </div>
              </div>

              <div style={{ padding: "14px 24px", background: "#f5f2eb", borderTop: "1px solid #E8EAF0", display: "flex", justifyContent: "flex-end", gap: 10, position: "sticky", bottom: 0 }}>
                <button onClick={() => { const s = studentModal; setStudentModal(null); openPayModal(s); }}
                  style={{ padding: "10px 18px", borderRadius: 8, border: "none", background: "#1B6B3A", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  + Record Payment
                </button>
                <button onClick={() => setStudentModal(null)}
                  style={{ padding: "10px 20px", borderRadius: 8, border: "1px solid #e6dfd8", background: "#fff", color: "#8a8fa8", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Receipt Modal (after save, or reprint from payments list) */}
      {receiptView && (
        <div
          onClick={() => setReceiptView(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1001, padding: 20 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 400, maxHeight: "88vh", overflowY: "auto", boxShadow: "0 12px 40px rgba(0,0,0,0.2)", position: "relative" }}>
            {receiptView.isVoid && (
              <div style={{ position: "absolute", top: "40%", left: "10%", fontSize: 46, color: "rgba(192,57,43,0.25)", transform: "rotate(-24deg)", fontWeight: 900, letterSpacing: 8, pointerEvents: "none" }}>VOID</div>
            )}
            <div style={{ padding: "18px 22px", textAlign: "center", borderBottom: "1px dashed #c9c2b8" }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#2a2421" }}>{schoolConfig?.schoolName}</div>
              <div style={{ fontSize: 11, color: "#8A8FA8", marginTop: 2 }}>OFFICIAL FEE RECEIPT</div>
              <div style={{ fontFamily: "monospace", fontSize: 13, color: "#1A5F9C", fontWeight: 700, marginTop: 6 }}>{receiptView.receiptNo}</div>
            </div>
            <div style={{ padding: "14px 22px", fontSize: 13 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <tbody>
                  <tr><td style={rcptLabel}>Date</td><td style={rcptVal}>{new Date(receiptView.paidAt).toLocaleString()}</td></tr>
                  <tr><td style={rcptLabel}>Student</td><td style={rcptVal}>{receiptView.student ? studentName(receiptView.student) : "—"}</td></tr>
                  <tr><td style={rcptLabel}>Adm No</td><td style={rcptVal}>{receiptView.student?.adm_no || "—"}</td></tr>
                  {receiptView.payerName && <tr><td style={rcptLabel}>Paid by</td><td style={rcptVal}>{receiptView.payerName}</td></tr>}
                  <tr><td style={rcptLabel}>Method</td><td style={{ ...rcptVal, textTransform: "uppercase" }}>{receiptView.method || "—"}{receiptView.reference ? ` · ${receiptView.reference}` : ""}</td></tr>
                </tbody>
              </table>

              <div style={{ borderTop: "1px dashed #c9c2b8", margin: "12px 0 8px" }} />
              <div style={{ fontSize: 10.5, fontWeight: 800, color: "#8A8FA8", marginBottom: 6 }}>SETTLED AGAINST</div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                <tbody>
                  {(receiptView.allocations || []).length === 0 ? (
                    <tr><td style={{ padding: "4px 0", color: "#8A8FA8", fontStyle: "italic" }}>Held as credit — no outstanding invoice at time of payment.</td></tr>
                  ) : receiptView.allocations.map((a, i) => (
                    <tr key={i}>
                      <td style={{ padding: "3px 0", color: "#2a2421" }}>{a.description} {a.invoice_no && <span style={{ color: "#8A8FA8", fontSize: 10.5 }}>({a.invoice_no})</span>}</td>
                      <td style={{ padding: "3px 0", textAlign: "right", fontFamily: "monospace", fontWeight: 600 }}>{Number(a.amount).toLocaleString()}</td>
                    </tr>
                  ))}
                  {receiptView.credit > 0 && (
                    <tr>
                      <td style={{ padding: "3px 0", color: "#1A5F9C", fontWeight: 600 }}>Credit carried forward</td>
                      <td style={{ padding: "3px 0", textAlign: "right", fontFamily: "monospace", fontWeight: 600, color: "#1A5F9C" }}>{receiptView.credit.toLocaleString()}</td>
                    </tr>
                  )}
                  <tr>
                    <td style={{ padding: "8px 0 0", fontWeight: 800, borderTop: "1px solid #2a2421" }}>TOTAL PAID</td>
                    <td style={{ padding: "8px 0 0", textAlign: "right", fontFamily: "monospace", fontWeight: 800, fontSize: 14, borderTop: "1px solid #2a2421" }}>KES {receiptView.amount.toLocaleString()}</td>
                  </tr>
                </tbody>
              </table>
              <div style={{ fontSize: 11, fontStyle: "italic", color: "#4A4A6A", marginTop: 8 }}>
                {amountInWords(receiptView.amount)}
              </div>
              {receiptView.student && (
                <div style={{ marginTop: 10, padding: "8px 12px", background: "#F8FAFC", borderRadius: 8, fontSize: 12.5, display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#4A4A6A" }}>Balance ({year})</span>
                  <strong style={{ fontFamily: "monospace" }}>KES {balanceFor(receiptView.student).toLocaleString()}</strong>
                </div>
              )}
            </div>
            <div style={{ padding: "12px 22px 18px", display: "flex", gap: 10 }}>
              <button onClick={() => setReceiptView(null)} style={{ flex: 1, padding: 11, background: "#fff", border: "1px solid #e6dfd8", borderRadius: 10, fontWeight: 600, color: "#8a8fa8", cursor: "pointer" }}>Close</button>
              <button onClick={printReceipt} style={{ flex: 1, padding: 11, background: "#1A5F9C", border: "none", borderRadius: 10, fontWeight: 700, color: "#fff", cursor: "pointer" }}>🖨 Print</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const rcptLabel = { padding: "3px 0", color: "#8A8FA8", fontSize: 12, width: 90 };
const rcptVal = { padding: "3px 0", color: "#2a2421", fontWeight: 600, textAlign: "right" };

const thStyle = { padding: "12px 18px", fontWeight: 700, color: "#8A8FA8", fontSize: 11, textTransform: "uppercase" };
const modalLabel = { display: "block", fontSize: 12, fontWeight: 700, color: "#4A4A6A", margin: "12px 0 6px", textTransform: "uppercase", letterSpacing: "0.04em" };
const modalInput = { width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #e6dfd8", fontSize: 14, outline: "none", boxSizing: "border-box", background: "#fafafa" };

export default Fees;

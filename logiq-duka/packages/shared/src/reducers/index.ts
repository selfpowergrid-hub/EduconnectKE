/**
 * The one reducer codebase (PRD §28): folds events into domain rows,
 * identically on client and server. Monetary and stock state is
 * append-only (no conflict class exists); catalog/entity rows are
 * LWW by (clientTs, eventId) with deterministic tiebreak.
 */
import type { EventEnvelope, EventType, PayloadOf } from "../events/index.js";
import { insert, update, upsert, type Effect } from "./effects.js";

export type { Effect } from "./effects.js";

type Reducer<T extends EventType> = (e: EventEnvelope<T>) => Effect[];

function common(e: EventEnvelope) {
  return {
    tenant_id: e.tenantId,
    device_id: e.deviceId,
    created_by: e.userId ?? null,
  };
}

function lwwOf(e: EventEnvelope): { ts: string; tiebreak: string } {
  return { ts: e.clientTs, tiebreak: e.eventId };
}

const saleCompleted: Reducer<"sale.completed"> = (e) => {
  const p = e.payload;
  const effects: Effect[] = [
    insert("sales", {
      id: p.saleId,
      ...common(e),
      branch_id: p.branchId ?? null,
      device_receipt_ref: p.deviceReceiptRef,
      status: "completed",
      sold_by: p.soldBy ?? null,
      customer_id: p.customerId ?? null,
      subtotal_cents: p.subtotalCents,
      discount_cents: p.discountCents,
      vat_cents: p.vatCents,
      total_cents: p.totalCents,
      sold_at: p.soldAt,
    }),
  ];
  for (const line of p.lines) {
    effects.push(
      insert("sale_lines", {
        id: line.id,
        tenant_id: e.tenantId,
        sale_id: p.saleId,
        product_id: line.productId,
        batch_id: line.batchId ?? null,
        qty: line.qty,
        unit: line.unit,
        weight_kg: line.weightKg ?? null,
        unit_price_cents: line.unitPriceCents,
        line_total_cents: line.lineTotalCents,
        vat_class: line.vatClass,
        vat_cents: line.vatCents,
        is_deni_priced: false,
      }),
      // stock deduction — the ONLY way stock changes on a sale
      insert("stock_movements", {
        id: deterministicChildId(line.id, "mv"),
        ...common(e),
        branch_id: p.branchId ?? null,
        product_id: line.productId,
        batch_id: line.batchId ?? null,
        type: "sale",
        qty_delta: -line.qty,
        unit_cost_cents: p.unitCostCentsByProduct[line.productId] ?? null,
        ref_table: "sales",
        ref_id: p.saleId,
        created_at: e.clientTs,
      }),
    );
  }
  for (const pay of p.payments) {
    effects.push(
      insert("payments", {
        id: pay.id,
        ...common(e),
        sale_id: p.saleId,
        customer_id: p.customerId ?? null,
        tender: pay.tender,
        amount_cents: pay.amountCents,
        mpesa_ref: pay.mpesaRef ?? null,
        mpesa_phone: pay.mpesaPhone ?? null,
        matched: pay.tender !== "mpesa_manual",
        created_at: e.clientTs,
      }),
    );
    if (pay.tender === "deni") {
      if (!p.customerId) throw new Error("deni sale requires customerId");
      effects.push(
        insert("customer_transactions", {
          id: deterministicChildId(pay.id, "deni"),
          tenant_id: e.tenantId,
          customer_id: p.customerId,
          type: "charge",
          amount_cents: pay.amountCents,
          sale_id: p.saleId,
          payment_method: "deni",
          created_at: e.clientTs,
          created_by: e.userId ?? null,
          device_id: e.deviceId,
        }),
      );
    }
  }
  return effects;
};

const saleVoided: Reducer<"sale.voided"> = (e) => {
  const p = e.payload;
  const effects: Effect[] = [
    update("sales", { id: p.saleId }, { status: "voided" }),
  ];
  for (const r of p.restock) {
    effects.push(
      insert("stock_movements", {
        id: deterministicChildId(e.eventId, `restock-${r.productId}`),
        ...common(e),
        product_id: r.productId,
        batch_id: r.batchId ?? null,
        type: "return",
        qty_delta: r.qty,
        unit_cost_cents: r.unitCostCents ?? null,
        ref_table: "sales",
        ref_id: p.saleId,
        created_at: e.clientTs,
      }),
    );
  }
  return effects;
};

const reducers: { [T in EventType]: Reducer<T> } = {
  "sale.completed": saleCompleted,
  "sale.voided": saleVoided,
  "sale.parked": (e) =>
    [upsert("sales", {
      id: e.payload.saleId,
      ...common(e),
      status: "parked",
      parked_label: e.payload.label,
      device_receipt_ref: "",
      subtotal_cents: 0, discount_cents: 0, vat_cents: 0, total_cents: 0,
      sold_at: e.clientTs,
    }, lwwOf(e))],
  "sale.unparked": (e) => [update("sales", { id: e.payload.saleId }, { status: "completed" })],
  "payment.recorded": (e) => {
    const p = e.payload;
    const effects: Effect[] = [
      insert("payments", {
        id: p.paymentId,
        ...common(e),
        sale_id: p.saleId ?? null,
        customer_id: p.customerId ?? null,
        tender: p.tender,
        amount_cents: p.amountCents,
        mpesa_ref: p.mpesaRef ?? null,
        mpesa_phone: p.mpesaPhone ?? null,
        matched: p.matched,
        created_at: e.clientTs,
      }),
    ];
    return effects;
  },
  "payment.matched": (e) =>
    [update("payments", { id: e.payload.paymentId }, {
      matched: true,
      sale_id: e.payload.saleId ?? null,
      matched_by: e.payload.matchedBy ?? null,
    })],
  "deni.charged": (e) => {
    const p = e.payload;
    return [insert("customer_transactions", {
      id: p.txnId,
      tenant_id: e.tenantId,
      customer_id: p.customerId,
      type: "charge",
      amount_cents: p.amountCents,
      sale_id: p.saleId ?? null,
      due_date: p.dueDate ?? null,
      note: p.note ?? null,
      created_at: e.clientTs,
      created_by: e.userId ?? null,
      device_id: e.deviceId,
    })];
  },
  "deni.paid": (e) => {
    const p = e.payload;
    return [insert("customer_transactions", {
      id: p.txnId,
      tenant_id: e.tenantId,
      customer_id: p.customerId,
      type: "payment",
      amount_cents: p.amountCents,
      payment_method: p.paymentMethod ?? "cash",
      mpesa_ref: p.mpesaRef ?? null,
      note: p.note ?? null,
      created_at: e.clientTs,
      created_by: e.userId ?? null,
      device_id: e.deviceId,
    })];
  },
  "customer.upserted": (e) => {
    const p = e.payload;
    return [upsert("customers", {
      id: p.customerId,
      ...common(e),
      name: p.name,
      phone: p.phone ?? null,
      id_number: p.idNumber ?? null,
      credit_limit_cents: p.creditLimitCents ?? null,
      notes: p.notes ?? null,
      opt_out_reminders: p.optOutReminders,
    }, lwwOf(e))];
  },
  "product.upserted": (e) => {
    const p = e.payload;
    return [upsert("products", {
      id: p.productId,
      ...common(e),
      name: p.name,
      name_sw: p.nameSw ?? null,
      category_id: p.categoryId ?? null,
      unit: p.unit,
      base_unit: p.baseUnit,
      sell_price_cents: p.sellPriceCents,
      wholesale_price_cents: p.wholesalePriceCents ?? null,
      min_price_cents: p.minPriceCents ?? null,
      vat_class: p.vatClass,
      reorder_level: p.reorderLevel ?? null,
      reorder_qty: p.reorderQty ?? null,
      track_batches: p.trackBatches,
      is_weight_item: p.isWeightItem,
      kg_price_cents: p.kgPriceCents ?? null,
      parent_product_id: p.parentProductId ?? null,
      conversion_factor: p.conversionFactor ?? null,
      active: p.active,
    }, lwwOf(e))];
  },
  "price_board.set": (e) => {
    const p = e.payload;
    return [
      insert("price_board_entries", {
        id: p.entryId,
        tenant_id: e.tenantId,
        product_id: p.productId,
        kg_price_cents: p.kgPriceCents,
        effective_from: p.effectiveFrom,
        set_by: e.userId ?? null,
        device_id: e.deviceId,
      }),
      // convenience mirror on the product row, LWW by effective_from
      upsert("product_kg_price", {
        id: p.productId,
        kg_price_cents: p.kgPriceCents,
      }, { ts: p.effectiveFrom, tiebreak: e.eventId }),
    ];
  },
  "stock.adjusted": (e) => {
    const p = e.payload;
    return [insert("stock_movements", {
      id: p.movementId,
      ...common(e),
      product_id: p.productId,
      batch_id: p.batchId ?? null,
      type: "adjust",
      qty_delta: p.qtyDelta,
      unit_cost_cents: p.unitCostCents ?? null,
      reason_code: p.reasonCode,
      created_at: e.clientTs,
    })];
  },
  "stock.repacked": (e) => {
    const p = e.payload;
    return [
      insert("stock_movements", {
        id: p.parentMovementId,
        ...common(e),
        product_id: p.parentProductId,
        type: "repack_out",
        qty_delta: -p.parentQty,
        unit_cost_cents: p.unitCostCents ?? null,
        created_at: e.clientTs,
      }),
      insert("stock_movements", {
        id: p.childMovementId,
        ...common(e),
        product_id: p.childProductId,
        type: "repack_in",
        qty_delta: p.childQty,
        unit_cost_cents: null,
        reason_code: p.wastageQty > 0 ? `wastage:${p.wastageQty}` : null,
        created_at: e.clientTs,
      }),
    ];
  },
  "stock.take_line": (e) => {
    const p = e.payload;
    return [insert("stock_movements", {
      id: p.movementId,
      ...common(e),
      product_id: p.productId,
      batch_id: p.batchId ?? null,
      type: "stock_take",
      qty_delta: p.countedQty - p.expectedQty,
      reason_code: "stock_take",
      ref_id: p.sessionId ?? null,
      created_at: e.clientTs,
    })];
  },
  "grn.received": (e) => {
    const p = e.payload;
    const effects: Effect[] = [
      insert("grns", {
        id: p.grnId,
        ...common(e),
        po_id: p.poId ?? null,
        supplier_id: p.supplierId,
        ref: p.ref ?? null,
        received_at: p.receivedAt,
      }),
    ];
    for (const line of p.lines) {
      effects.push(
        insert("grn_lines", {
          id: line.id,
          tenant_id: e.tenantId,
          grn_id: p.grnId,
          product_id: line.productId,
          qty: line.qty,
          unit_cost_cents: line.unitCostCents,
          batch_no: line.batchNo ?? null,
          expiry_date: line.expiryDate ?? null,
        }),
        insert("stock_movements", {
          id: line.movementId,
          ...common(e),
          product_id: line.productId,
          type: "purchase",
          qty_delta: line.qty,
          unit_cost_cents: line.unitCostCents,
          ref_table: "grns",
          ref_id: p.grnId,
          created_at: e.clientTs,
        }),
      );
    }
    return effects;
  },
  "expense.recorded": (e) => {
    const p = e.payload;
    return [insert("expenses", {
      id: p.expenseId,
      ...common(e),
      category: p.category,
      amount_cents: p.amountCents,
      note: p.note ?? null,
      incurred_at: p.incurredAt,
    })];
  },
  "cash.moved": (e) => {
    const p = e.payload;
    return [insert("cash_movements", {
      id: p.movementId,
      ...common(e),
      shift_id: p.shiftId ?? null,
      type: p.type,
      amount_cents: p.amountCents,
      reason: p.reason ?? null,
      created_at: e.clientTs,
    })];
  },
  "shift.opened": (e) => {
    const p = e.payload;
    return [insert("shifts", {
      id: p.shiftId,
      tenant_id: e.tenantId,
      branch_id: p.branchId ?? null,
      opened_by: p.openedBy ?? null,
      opened_at: p.openedAt,
      device_id: e.deviceId,
    })];
  },
  "shift.closed": (e) => {
    const p = e.payload;
    return [update("shifts", { id: p.shiftId }, {
      closed_at: p.closedAt,
      expected_cash_cents: p.expectedCashCents,
      counted_cash_cents: p.countedCashCents,
      variance_cents: p.countedCashCents - p.expectedCashCents,
    })];
  },
  "day.closed": (e) => {
    const p = e.payload;
    return [upsert("day_closes", {
      id: p.dayCloseId,
      tenant_id: e.tenantId,
      branch_id: p.branchId ?? null,
      business_date: p.businessDate,
      totals: p.totals,
      variance_cents: p.varianceCents ?? null,
      closed_by: e.userId ?? null,
      device_id: e.deviceId,
    }, lwwOf(e))];
  },
  "user.upserted": (e) => {
    const p = e.payload;
    return [upsert("users", {
      id: p.userId,
      tenant_id: e.tenantId,
      full_name: p.fullName,
      phone: p.phone ?? null,
      role: p.role,
      pin_hash: p.pinHash ?? null,
      active: p.active,
    }, lwwOf(e))];
  },
  "settings.changed": (e) =>
    [upsert("tenant_settings_patches", {
      id: e.eventId,
      tenant_id: e.tenantId,
      patch: e.payload.patch,
    }, lwwOf(e))],
};

export function reduce(e: EventEnvelope): Effect[] {
  const r = reducers[e.type] as Reducer<EventType>;
  return r(e);
}

/**
 * Deterministic child id: same event always produces the same derived row
 * ids on every device/server, keeping replays idempotent. (Simple FNV-1a
 * fold of parent id + tag into a uuid-shaped string; uniqueness scope is
 * within a tenant's derived rows.)
 */
export function deterministicChildId(parentId: string, tag: string): string {
  const s = `${parentId}:${tag}`;
  let h1 = 0x811c9dc5, h2 = 0x01000193, h3 = 0xdeadbeef, h4 = 0xcafebabe;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x85ebca6b) >>> 0;
    h3 = Math.imul(h3 ^ c, 0xc2b2ae35) >>> 0;
    h4 = Math.imul(h4 ^ c, 0x27d4eb2f) >>> 0;
  }
  const hex = (n: number) => n.toString(16).padStart(8, "0");
  const raw = hex(h1) + hex(h2) + hex(h3) + hex(h4);
  // set version 4 / variant bits so it parses as a UUID
  return (
    raw.slice(0, 8) + "-" + raw.slice(8, 12) + "-4" + raw.slice(13, 16) +
    "-8" + raw.slice(17, 20) + "-" + raw.slice(20, 32)
  );
}

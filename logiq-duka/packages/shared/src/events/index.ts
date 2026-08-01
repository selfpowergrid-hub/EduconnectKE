/**
 * Event definitions — the vocabulary of the sync engine (PRD §28).
 * Every local mutation is one of these events; reducers fold them into
 * domain state identically on client (SQLite) and server (Postgres).
 */
import { z } from "zod";

const uuid = z.string().uuid();
const cents = z.number().int().safe();
const qty = z.number().finite();
const isoTs = z.string().datetime({ offset: true });

export const vatClassSchema = z.enum(["vat16", "zero", "exempt"]);
export const unitSchema = z.enum([
  "pc", "kg", "g", "l", "ml", "bale", "packet", "sack", "tray", "crate", "bunch", "m", "ft",
]);
export const tenderSchema = z.enum(["cash", "mpesa_stk", "mpesa_manual", "bank", "card_ext", "deni"]);
export const roleSchema = z.enum(["owner", "manager", "attendant", "accountant"]);

// ---------- payload schemas (one per event type) ----------

export const saleLineSchema = z.object({
  id: uuid,
  productId: uuid,
  batchId: uuid.nullish(),
  qty, // base units, positive
  unit: unitSchema,
  weightKg: qty.nullish(),
  unitPriceCents: cents,
  lineTotalCents: cents,
  vatClass: vatClassSchema,
  vatCents: cents,
});

export const salePaymentSchema = z.object({
  id: uuid,
  tender: tenderSchema,
  amountCents: cents,
  mpesaRef: z.string().nullish(),
  mpesaPhone: z.string().nullish(),
});

export const payloads = {
  "sale.completed": z.object({
    saleId: uuid,
    branchId: uuid.nullish(),
    deviceReceiptRef: z.string(),
    soldBy: uuid.nullish(),
    customerId: uuid.nullish(), // required when any payment tender is deni
    soldAt: isoTs,
    subtotalCents: cents,
    discountCents: cents,
    vatCents: cents,
    totalCents: cents,
    lines: z.array(saleLineSchema).min(1),
    payments: z.array(salePaymentSchema).min(1),
    unitCostCentsByProduct: z.record(uuid, cents).default({}), // for stock valuation
  }),
  "sale.voided": z.object({
    saleId: uuid,
    reason: z.string(),
    voidedBy: uuid.nullish(),
    restock: z.array(z.object({ productId: uuid, batchId: uuid.nullish(), qty, unitCostCents: cents.nullish() })),
  }),
  "sale.parked": z.object({
    saleId: uuid,
    label: z.string(),
    cart: z.unknown(), // opaque cart snapshot; not folded into domain tables
  }),
  "sale.unparked": z.object({ saleId: uuid }),
  "payment.recorded": z.object({
    paymentId: uuid,
    saleId: uuid.nullish(),
    customerId: uuid.nullish(),
    tender: tenderSchema,
    amountCents: cents,
    mpesaRef: z.string().nullish(),
    mpesaPhone: z.string().nullish(),
    matched: z.boolean().default(true),
  }),
  "payment.matched": z.object({
    paymentId: uuid,
    saleId: uuid.nullish(),
    matchedBy: uuid.nullish(),
  }),
  "deni.charged": z.object({
    txnId: uuid,
    customerId: uuid,
    saleId: uuid.nullish(),
    amountCents: cents,
    dueDate: z.string().date().nullish(),
    note: z.string().nullish(),
  }),
  "deni.paid": z.object({
    txnId: uuid,
    customerId: uuid,
    amountCents: cents,
    paymentMethod: tenderSchema.nullish(),
    mpesaRef: z.string().nullish(),
    note: z.string().nullish(),
  }),
  "customer.upserted": z.object({
    customerId: uuid,
    name: z.string(),
    phone: z.string().nullish(),
    idNumber: z.string().nullish(),
    creditLimitCents: cents.nullish(),
    notes: z.string().nullish(),
    optOutReminders: z.boolean().default(false),
  }),
  "product.upserted": z.object({
    productId: uuid,
    name: z.string(),
    nameSw: z.string().nullish(),
    categoryId: uuid.nullish(),
    unit: unitSchema,
    baseUnit: unitSchema,
    sellPriceCents: cents,
    wholesalePriceCents: cents.nullish(),
    minPriceCents: cents.nullish(),
    vatClass: vatClassSchema,
    reorderLevel: qty.nullish(),
    reorderQty: qty.nullish(),
    trackBatches: z.boolean().default(false),
    isWeightItem: z.boolean().default(false),
    kgPriceCents: cents.nullish(),
    parentProductId: uuid.nullish(),
    conversionFactor: qty.nullish(),
    active: z.boolean().default(true),
  }),
  "price_board.set": z.object({
    entryId: uuid,
    productId: uuid,
    kgPriceCents: cents,
    effectiveFrom: isoTs,
  }),
  "stock.adjusted": z.object({
    movementId: uuid,
    productId: uuid,
    batchId: uuid.nullish(),
    qtyDelta: qty, // signed
    unitCostCents: cents.nullish(),
    reasonCode: z.enum(["breakage", "expiry", "theft", "gift", "correction", "other"]),
    note: z.string().nullish(),
  }),
  "stock.repacked": z.object({
    parentMovementId: uuid,
    childMovementId: uuid,
    parentProductId: uuid,
    childProductId: uuid,
    parentQty: qty.positive(),   // parent units consumed
    childQty: qty.positive(),    // child units produced
    wastageQty: qty.min(0).default(0),
    unitCostCents: cents.nullish(),
  }),
  "stock.take_line": z.object({
    movementId: uuid,
    productId: uuid,
    batchId: uuid.nullish(),
    countedQty: qty.min(0),
    expectedQty: qty,
    sessionId: uuid.nullish(),
  }),
  "grn.received": z.object({
    grnId: uuid,
    poId: uuid.nullish(),
    supplierId: uuid,
    ref: z.string().nullish(),
    receivedAt: isoTs,
    lines: z.array(z.object({
      id: uuid,
      movementId: uuid,
      productId: uuid,
      qty: qty.positive(),
      unitCostCents: cents,
      batchNo: z.string().nullish(),
      expiryDate: z.string().date().nullish(),
    })).min(1),
  }),
  "expense.recorded": z.object({
    expenseId: uuid,
    category: z.enum(["stock_purchase", "rent", "transport", "wages", "airtime", "utilities", "licence", "misc"]),
    amountCents: cents,
    note: z.string().nullish(),
    incurredAt: isoTs,
  }),
  "cash.moved": z.object({
    movementId: uuid,
    shiftId: uuid.nullish(),
    type: z.enum(["opening_float", "cash_in", "cash_out", "drop", "closing_count"]),
    amountCents: cents,
    reason: z.string().nullish(),
  }),
  "shift.opened": z.object({
    shiftId: uuid,
    branchId: uuid.nullish(),
    openedBy: uuid.nullish(),
    openedAt: isoTs,
  }),
  "shift.closed": z.object({
    shiftId: uuid,
    closedAt: isoTs,
    expectedCashCents: cents,
    countedCashCents: cents,
  }),
  "day.closed": z.object({
    dayCloseId: uuid,
    branchId: uuid.nullish(),
    businessDate: z.string().date(),
    totals: z.record(z.string(), z.unknown()),
    varianceCents: cents.nullish(),
  }),
  "user.upserted": z.object({
    userId: uuid,
    fullName: z.string(),
    phone: z.string().nullish(),
    role: roleSchema,
    pinHash: z.string().nullish(),
    active: z.boolean().default(true),
  }),
  "settings.changed": z.object({
    patch: z.record(z.string(), z.unknown()),
  }),
} as const;

export type EventType = keyof typeof payloads;
export const EVENT_TYPES = Object.keys(payloads) as EventType[];

export type PayloadOf<T extends EventType> = z.infer<(typeof payloads)[T]>;

// ---------- envelope ----------

export const envelopeSchema = z.object({
  eventId: uuid,          // UUIDv7, client-generated, globally unique
  tenantId: uuid,
  deviceId: uuid,
  userId: uuid.nullish(), // staff attribution (public.users.id)
  type: z.enum(EVENT_TYPES as [EventType, ...EventType[]]),
  aggregate: z.string(),
  aggregateId: uuid,
  clientTs: isoTs,
  clientSeq: z.number().int().nonnegative(),
  payload: z.unknown(),
});

export type EventEnvelope<T extends EventType = EventType> = Omit<z.infer<typeof envelopeSchema>, "payload" | "type"> & {
  type: T;
  payload: PayloadOf<T>;
};

/** Parse + validate an incoming envelope, including its typed payload. */
export function parseEvent(raw: unknown): EventEnvelope {
  const env = envelopeSchema.parse(raw);
  const payload = payloads[env.type].parse(env.payload);
  return { ...env, payload } as EventEnvelope;
}

const AGGREGATES: Record<EventType, string> = {
  "sale.completed": "sale", "sale.voided": "sale", "sale.parked": "sale", "sale.unparked": "sale",
  "payment.recorded": "payment", "payment.matched": "payment",
  "deni.charged": "customer", "deni.paid": "customer", "customer.upserted": "customer",
  "product.upserted": "product", "price_board.set": "product",
  "stock.adjusted": "stock", "stock.repacked": "stock", "stock.take_line": "stock",
  "grn.received": "grn",
  "expense.recorded": "expense", "cash.moved": "cash",
  "shift.opened": "shift", "shift.closed": "shift", "day.closed": "day",
  "user.upserted": "user", "settings.changed": "tenant",
};

export function aggregateOf(type: EventType): string {
  return AGGREGATES[type];
}

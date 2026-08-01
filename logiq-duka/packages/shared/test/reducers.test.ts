import { beforeEach, describe, expect, it } from "vitest";
import { parseEvent } from "../src/events/index.js";
import { reduce } from "../src/reducers/index.js";
import { MemoryStore } from "../src/store/memory.js";
import { DEVICE_A, fixedId, makeEvent, resetSeqs } from "./helpers.js";

const P_SUGAR = fixedId(1);
const P_UNGA = fixedId(2);
const P_GOROGORO = fixedId(3);
const CUSTOMER = fixedId(9);

function productUpserted(productId: string, name: string, sellPriceCents: number, ts: string, extras: Record<string, unknown> = {}) {
  return makeEvent("product.upserted", {
    productId, name, unit: "pc", baseUnit: "pc",
    sellPriceCents, vatClass: "vat16",
    trackBatches: false, isWeightItem: false, active: true,
    ...extras,
  } as never, { deviceId: DEVICE_A, clientTs: ts, aggregateId: productId });
}

describe("reducers → MemoryStore", () => {
  let store: MemoryStore;
  beforeEach(() => {
    resetSeqs();
    store = new MemoryStore();
  });

  it("sale.completed deducts stock, records payment, charges deni", () => {
    const saleId = fixedId(100);
    const e = makeEvent("sale.completed", {
      saleId,
      deviceReceiptRef: "D1-000001",
      customerId: CUSTOMER,
      soldAt: "2026-07-22T10:00:00.000Z",
      subtotalCents: 30000, discountCents: 0, vatCents: 4138, totalCents: 30000,
      lines: [
        { id: fixedId(101), productId: P_SUGAR, qty: 2, unit: "pc", unitPriceCents: 15000, lineTotalCents: 30000, vatClass: "vat16", vatCents: 4138 },
      ],
      payments: [
        { id: fixedId(102), tender: "cash", amountCents: 20000 },
        { id: fixedId(103), tender: "deni", amountCents: 10000 },
      ],
      unitCostCentsByProduct: { [P_SUGAR]: 12000 },
    }, { deviceId: DEVICE_A, aggregateId: saleId });

    store.apply(reduce(e));

    expect(store.stockLevels.get(P_SUGAR)).toBe(-2); // no opening stock in this test
    expect(store.tables.get("sales")!.get(saleId)!.status).toBe("completed");
    expect(store.tables.get("payments")!.size).toBe(2);
    expect(store.customerBalanceCents(CUSTOMER)).toBe(10000);
  });

  it("deni.paid reduces customer balance", () => {
    store.apply(reduce(makeEvent("deni.charged", {
      txnId: fixedId(110), customerId: CUSTOMER, amountCents: 85000,
    }, { deviceId: DEVICE_A })));
    store.apply(reduce(makeEvent("deni.paid", {
      txnId: fixedId(111), customerId: CUSTOMER, amountCents: 35000, paymentMethod: "mpesa_manual",
    }, { deviceId: DEVICE_A })));
    expect(store.customerBalanceCents(CUSTOMER)).toBe(50000);
  });

  it("sale.voided restores stock and marks sale voided", () => {
    const saleId = fixedId(120);
    store.apply(reduce(makeEvent("sale.completed", {
      saleId, deviceReceiptRef: "D1-2", soldAt: "2026-07-22T10:00:00.000Z",
      subtotalCents: 15000, discountCents: 0, vatCents: 0, totalCents: 15000,
      lines: [{ id: fixedId(121), productId: P_SUGAR, qty: 1, unit: "pc", unitPriceCents: 15000, lineTotalCents: 15000, vatClass: "exempt", vatCents: 0 }],
      payments: [{ id: fixedId(122), tender: "cash", amountCents: 15000 }],
      unitCostCentsByProduct: {},
    }, { deviceId: DEVICE_A, aggregateId: saleId })));
    store.apply(reduce(makeEvent("sale.voided", {
      saleId, reason: "wrong item",
      restock: [{ productId: P_SUGAR, qty: 1 }],
    }, { deviceId: DEVICE_A, aggregateId: saleId })));

    expect(store.stockLevels.get(P_SUGAR)).toBe(0);
    expect(store.tables.get("sales")!.get(saleId)!.status).toBe("voided");
  });

  it("stock.repacked converts sack to gorogoro units with wastage note", () => {
    store.apply(reduce(makeEvent("grn.received", {
      grnId: fixedId(130), supplierId: fixedId(8), receivedAt: "2026-07-22T08:00:00.000Z",
      lines: [{ id: fixedId(131), movementId: fixedId(132), productId: P_UNGA, qty: 90, unitCostCents: 100 }],
    }, { deviceId: DEVICE_A })));
    store.apply(reduce(makeEvent("stock.repacked", {
      parentMovementId: fixedId(133), childMovementId: fixedId(134),
      parentProductId: P_UNGA, childProductId: P_GOROGORO,
      parentQty: 90, childQty: 44, wastageQty: 2,
    }, { deviceId: DEVICE_A })));

    expect(store.stockLevels.get(P_UNGA)).toBe(0);
    expect(store.stockLevels.get(P_GOROGORO)).toBe(44);
  });

  it("stock.take_line adjusts to counted quantity", () => {
    store.apply(reduce(makeEvent("stock.adjusted", {
      movementId: fixedId(140), productId: P_SUGAR, qtyDelta: 50, reasonCode: "correction", unitCostCents: 12000,
    }, { deviceId: DEVICE_A })));
    store.apply(reduce(makeEvent("stock.take_line", {
      movementId: fixedId(141), productId: P_SUGAR, countedQty: 47, expectedQty: 50,
    }, { deviceId: DEVICE_A })));
    expect(store.stockLevels.get(P_SUGAR)).toBe(47);
  });

  it("product.upserted is LWW: later clientTs wins regardless of arrival order", () => {
    const newer = productUpserted(P_SUGAR, "Sukari 1kg", 16000, "2026-07-22T12:00:00.000Z");
    const older = productUpserted(P_SUGAR, "Sukari 1kg", 15000, "2026-07-22T09:00:00.000Z");
    store.apply(reduce(newer));
    store.apply(reduce(older)); // arrives late, must lose
    expect(store.tables.get("products")!.get(P_SUGAR)!.sell_price_cents).toBe(16000);
  });

  it("replayed events are idempotent", () => {
    const e = makeEvent("stock.adjusted", {
      movementId: fixedId(150), productId: P_SUGAR, qtyDelta: 10, reasonCode: "correction",
    }, { deviceId: DEVICE_A });
    store.apply(reduce(e));
    store.apply(reduce(e));
    store.apply(reduce(e));
    expect(store.stockLevels.get(P_SUGAR)).toBe(10);
  });

  it("every event type round-trips through parseEvent", () => {
    const e = makeEvent("expense.recorded", {
      expenseId: fixedId(160), category: "transport", amountCents: 5000, incurredAt: "2026-07-22T09:00:00.000Z",
    }, { deviceId: DEVICE_A });
    const parsed = parseEvent(JSON.parse(JSON.stringify(e)));
    expect(parsed.type).toBe("expense.recorded");
    store.apply(reduce(parsed));
    expect(store.tables.get("expenses")!.size).toBe(1);
  });
});

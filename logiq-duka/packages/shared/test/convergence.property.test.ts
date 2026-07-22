/**
 * PRD §28 definition of done: "any interleaving of N devices' event
 * streams converges to identical stock/balance state."
 * fast-check generates random multi-device event streams and random
 * interleavings (including duplicate delivery); the folded state must
 * be byte-identical however events arrive.
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { EventEnvelope } from "../src/events/index.js";
import { reduce } from "../src/reducers/index.js";
import { MemoryStore } from "../src/store/memory.js";
import { DEVICE_A, DEVICE_B, DEVICE_C, fixedId, makeEvent, resetSeqs } from "./helpers.js";

const DEVICES = [DEVICE_A, DEVICE_B, DEVICE_C];
const PRODUCTS = [fixedId(1), fixedId(2), fixedId(3)];
const CUSTOMERS = [fixedId(11), fixedId(12)];

let idCounter = 1000;
function nextId(): string {
  return fixedId(idCounter++);
}

type Op =
  | { op: "sell"; device: number; product: number; qty: number; deni: boolean; customer: number; ts: number }
  | { op: "adjust"; device: number; product: number; delta: number; ts: number }
  | { op: "grn"; device: number; product: number; qty: number; cost: number; ts: number }
  | { op: "deniPay"; device: number; customer: number; amount: number; ts: number }
  | { op: "priceEdit"; device: number; product: number; price: number; ts: number };

const opArb: fc.Arbitrary<Op> = fc.oneof(
  fc.record({
    op: fc.constant<"sell">("sell"),
    device: fc.nat({ max: 2 }),
    product: fc.nat({ max: 2 }),
    qty: fc.integer({ min: 1, max: 5 }),
    deni: fc.boolean(),
    customer: fc.nat({ max: 1 }),
    ts: fc.integer({ min: 0, max: 86_400_000 }),
  }),
  fc.record({
    op: fc.constant<"adjust">("adjust"),
    device: fc.nat({ max: 2 }),
    product: fc.nat({ max: 2 }),
    delta: fc.integer({ min: -5, max: 20 }).filter((d) => d !== 0),
    ts: fc.integer({ min: 0, max: 86_400_000 }),
  }),
  fc.record({
    op: fc.constant<"grn">("grn"),
    device: fc.nat({ max: 2 }),
    product: fc.nat({ max: 2 }),
    qty: fc.integer({ min: 1, max: 100 }),
    cost: fc.integer({ min: 100, max: 50_000 }),
    ts: fc.integer({ min: 0, max: 86_400_000 }),
  }),
  fc.record({
    op: fc.constant<"deniPay">("deniPay"),
    device: fc.nat({ max: 2 }),
    customer: fc.nat({ max: 1 }),
    amount: fc.integer({ min: 100, max: 100_000 }),
    ts: fc.integer({ min: 0, max: 86_400_000 }),
  }),
  fc.record({
    op: fc.constant<"priceEdit">("priceEdit"),
    device: fc.nat({ max: 2 }),
    product: fc.nat({ max: 2 }),
    price: fc.integer({ min: 1_000, max: 100_000 }),
    ts: fc.integer({ min: 0, max: 86_400_000 }),
  }),
);

function toEvent(o: Op): EventEnvelope {
  const device = DEVICES[o.device]!;
  const ts = new Date(Date.UTC(2026, 6, 22) + o.ts).toISOString();
  switch (o.op) {
    case "sell": {
      const saleId = nextId();
      const total = 15_000 * o.qty;
      return makeEvent("sale.completed", {
        saleId,
        deviceReceiptRef: `D${o.device}-${saleId.slice(-6)}`,
        customerId: o.deni ? CUSTOMERS[o.customer]! : null,
        soldAt: ts,
        subtotalCents: total, discountCents: 0, vatCents: 0, totalCents: total,
        lines: [{
          id: nextId(), productId: PRODUCTS[o.product]!, qty: o.qty, unit: "pc",
          unitPriceCents: 15_000, lineTotalCents: total, vatClass: "exempt", vatCents: 0,
        }],
        payments: [{ id: nextId(), tender: o.deni ? "deni" : "cash", amountCents: total }],
        unitCostCentsByProduct: {},
      }, { deviceId: device, clientTs: ts, aggregateId: saleId }) as EventEnvelope;
    }
    case "adjust":
      return makeEvent("stock.adjusted", {
        movementId: nextId(), productId: PRODUCTS[o.product]!, qtyDelta: o.delta, reasonCode: "correction",
      }, { deviceId: device, clientTs: ts }) as EventEnvelope;
    case "grn":
      return makeEvent("grn.received", {
        grnId: nextId(), supplierId: fixedId(99), receivedAt: ts,
        lines: [{ id: nextId(), movementId: nextId(), productId: PRODUCTS[o.product]!, qty: o.qty, unitCostCents: o.cost }],
      }, { deviceId: device, clientTs: ts }) as EventEnvelope;
    case "deniPay":
      return makeEvent("deni.paid", {
        txnId: nextId(), customerId: CUSTOMERS[o.customer]!, amountCents: o.amount, paymentMethod: "cash",
      }, { deviceId: device, clientTs: ts }) as EventEnvelope;
    case "priceEdit":
      return makeEvent("product.upserted", {
        productId: PRODUCTS[o.product]!, name: `Product ${o.product}`,
        unit: "pc", baseUnit: "pc", sellPriceCents: o.price, vatClass: "vat16",
        trackBatches: false, isWeightItem: false, active: true,
      }, { deviceId: device, clientTs: ts, aggregateId: PRODUCTS[o.product]! }) as EventEnvelope;
  }
}

function foldInOrder(events: EventEnvelope[], order: number[]): MemoryStore {
  const store = new MemoryStore();
  for (const i of order) store.apply(reduce(events[i]!));
  return store;
}

function shuffled(n: number, seed: number): number[] {
  // deterministic Fisher-Yates from a seed
  const order = Array.from({ length: n }, (_, i) => i);
  let s = seed >>> 0;
  for (let i = n - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order;
}

describe("multi-device convergence (property-based)", () => {
  it("any interleaving of device streams converges to identical state", () => {
    fc.assert(
      fc.property(
        fc.array(opArb, { minLength: 1, maxLength: 40 }),
        fc.integer(), fc.integer(),
        (ops, seedA, seedB) => {
          resetSeqs();
          idCounter = 1000;
          const events = ops.map(toEvent);
          const a = foldInOrder(events, shuffled(events.length, seedA));
          const b = foldInOrder(events, shuffled(events.length, seedB));
          expect(a.snapshot()).toBe(b.snapshot());
        },
      ),
      { numRuns: 200 },
    );
  });

  it("duplicate delivery (at-least-once) does not change state", () => {
    fc.assert(
      fc.property(
        fc.array(opArb, { minLength: 1, maxLength: 25 }),
        fc.integer(),
        fc.array(fc.nat({ max: 24 }), { maxLength: 15 }),
        (ops, seed, dupIdx) => {
          resetSeqs();
          idCounter = 1000;
          const events = ops.map(toEvent);
          const once = foldInOrder(events, Array.from({ length: events.length }, (_, i) => i));
          const order = shuffled(events.length, seed);
          const withDups = [...order, ...dupIdx.filter((i) => i < events.length)];
          const dups = foldInOrder(events, withDups);
          expect(dups.snapshot()).toBe(once.snapshot());
        },
      ),
      { numRuns: 150 },
    );
  });

  it("stock is always Σ movements — no interleaving can clobber it", () => {
    fc.assert(
      fc.property(
        fc.array(opArb, { minLength: 1, maxLength: 30 }),
        fc.integer(),
        (ops, seed) => {
          resetSeqs();
          idCounter = 1000;
          const events = ops.map(toEvent);
          const store = foldInOrder(events, shuffled(events.length, seed));
          for (const productId of PRODUCTS) {
            let sum = 0;
            for (const row of store.tables.get("stock_movements")?.values() ?? []) {
              if (row.product_id === productId) sum += Number(row.qty_delta);
            }
            expect(store.stockLevels.get(productId) ?? 0).toBeCloseTo(sum, 3);
          }
        },
      ),
      { numRuns: 150 },
    );
  });
});

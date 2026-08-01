import { describe, expect, it } from "vitest";
import { formatKes, lineTotalCents, vatFromInclusiveCents, weightPriceCents } from "../src/money.js";
import { toBaseQty, weightNeedsConfirmation } from "../src/units.js";
import { uuidv7, uuidv7Time } from "../src/ids.js";

describe("money", () => {
  it("back-computes 16% VAT from inclusive price", () => {
    // KSh 116.00 inclusive → KSh 16.00 VAT
    expect(vatFromInclusiveCents(11600, "vat16")).toBe(1600);
    expect(vatFromInclusiveCents(11600, "zero")).toBe(0);
    expect(vatFromInclusiveCents(11600, "exempt")).toBe(0);
  });

  it("rounds VAT half-up on awkward totals", () => {
    // 150.00 * 160/1160 = 20.689... → 2069 cents
    expect(vatFromInclusiveCents(15000, "vat16")).toBe(2069);
  });

  it("rejects non-integer cents", () => {
    expect(() => vatFromInclusiveCents(100.5, "vat16")).toThrow(TypeError);
  });

  it("computes weight-mode prices from KES/kg", () => {
    // 550/kg × 1.250kg = 687.50
    expect(weightPriceCents(55000, 1.25)).toBe(68750);
    expect(() => weightPriceCents(55000, 0)).toThrow(RangeError);
  });

  it("computes line totals with fractional qty", () => {
    expect(lineTotalCents(18000, 2)).toBe(36000);
    expect(lineTotalCents(9000, 0.5)).toBe(4500);
  });

  it("formats KES", () => {
    expect(formatKes(1234500)).toBe("KSh 12,345");
    expect(formatKes(68750)).toBe("KSh 687.50");
    expect(formatKes(-850)).toBe("-KSh 8.50");
  });
});

describe("units", () => {
  it("converts metric units to base", () => {
    expect(toBaseQty(500, "g", "kg")).toBe(0.5);
    expect(toBaseQty(250, "ml", "l")).toBe(0.25);
  });
  it("uses product conversion factor for container units", () => {
    // 90kg sack → kg
    expect(toBaseQty(2, "sack", "kg", 90)).toBe(180);
    expect(() => toBaseQty(1, "sack", "kg")).toThrow(RangeError);
  });
  it("flags implausible butchery weights (>25kg)", () => {
    expect(weightNeedsConfirmation(26)).toBe(true);
    expect(weightNeedsConfirmation(3.2)).toBe(false);
  });
});

describe("uuidv7", () => {
  it("is time-ordered and well-formed", () => {
    const a = uuidv7(1_000_000);
    const b = uuidv7(2_000_000);
    expect(a < b).toBe(true);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(uuidv7Time(a)).toBe(1_000_000);
  });
});

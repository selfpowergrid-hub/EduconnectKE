/**
 * Quantity units. All stock quantities are stored in a product's BASE unit;
 * sale/purchase lines convert at entry (PRD §12 design rules).
 */

export type Unit =
  | "pc" | "kg" | "g" | "l" | "ml"
  | "bale" | "packet" | "sack" | "tray" | "crate" | "bunch"
  | "m" | "ft";

/** Fixed metric conversions; container units (sack, crate…) convert via
 * product-level conversion_factor, not here. */
const METRIC: Partial<Record<Unit, { base: Unit; factor: number }>> = {
  g: { base: "kg", factor: 0.001 },
  ml: { base: "l", factor: 0.001 },
  ft: { base: "m", factor: 0.3048 },
};

export function toBaseQty(qty: number, unit: Unit, baseUnit: Unit, conversionFactor?: number | null): number {
  if (unit === baseUnit) return qty;
  const metric = METRIC[unit];
  if (metric && metric.base === baseUnit) return round3(qty * metric.factor);
  if (conversionFactor && conversionFactor > 0) return round3(qty * conversionFactor);
  throw new RangeError(`no conversion from ${unit} to ${baseUnit}`);
}

export function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/** Butchery plausibility guard (PRD §8.2): single line > 25kg needs confirm. */
export const WEIGHT_CONFIRM_THRESHOLD_KG = 25;
export function weightNeedsConfirmation(weightKg: number): boolean {
  return weightKg > WEIGHT_CONFIRM_THRESHOLD_KG;
}

// GENERATED from packages/shared/src — DO NOT EDIT. Run `pnpm sync:functions`.
/**
 * Money utilities. LAW: money is ALWAYS integer cents (KES × 100).
 * Kenyan retail prices are entered VAT-INCLUSIVE (PRD §9.2); VAT is
 * back-computed for eTIMS payloads.
 */

export type VatClass = "vat16" | "zero" | "exempt";

export const VAT_RATE_PERMILLE: Record<VatClass, number> = {
  vat16: 160,
  zero: 0,
  exempt: 0,
};

/** VAT portion of a VAT-inclusive amount, in cents (round half up). */
export function vatFromInclusiveCents(totalCents: number, vatClass: VatClass): number {
  assertCents(totalCents);
  const rate = VAT_RATE_PERMILLE[vatClass];
  if (rate === 0) return 0;
  // vat = total * r / (1000 + r)
  return Math.round((totalCents * rate) / (1000 + rate));
}

export function lineTotalCents(unitPriceCents: number, qty: number): number {
  assertCents(unitPriceCents);
  return Math.round(unitPriceCents * qty);
}

/** Weight-mode price: KES/kg board price × weight (PRD §7.1). */
export function weightPriceCents(kgPriceCents: number, weightKg: number): number {
  assertCents(kgPriceCents);
  if (!(weightKg > 0)) throw new RangeError(`invalid weight: ${weightKg}`);
  return Math.round(kgPriceCents * weightKg);
}

export function formatKes(cents: number, locale: "en" | "sw" = "en"): string {
  assertCents(cents);
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const shillings = Math.floor(abs / 100);
  const rem = abs % 100;
  const grouped = shillings.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const body = rem === 0 ? grouped : `${grouped}.${rem.toString().padStart(2, "0")}`;
  void locale; // KSh prefix is identical in en/sw
  return `${sign}KSh ${body}`;
}

export function assertCents(v: number): void {
  if (!Number.isSafeInteger(v)) {
    throw new TypeError(`money must be integer cents, got ${v}`);
  }
}

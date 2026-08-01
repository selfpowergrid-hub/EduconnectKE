/**
 * Catalog seed templates per business type (PRD §8, §16): ~150 common
 * Kenyan FMCG items for duka, price-board cuts for butchery, batch-tracked
 * agrochemicals for agrovet, etc. Built in milestone M2 alongside the
 * Sell/Stock modules. JSON files will live in ./templates/<type>.json
 * with { name, name_sw, unit, vat_class, typical_price_cents }.
 */
export const TEMPLATE_TYPES = [
  "duka", "butchery", "agrovet", "supa", "wines", "hardware", "cereals",
] as const;

export type TemplateType = (typeof TEMPLATE_TYPES)[number];

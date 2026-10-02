import { COLLECTION, type AdProduct } from "./products";
import type { AdScalarFieldDef } from "./types";

/** How many volumes the product includes - a book's own, a pack's three books together, or the whole collection. */
export function productVolumes(product: AdProduct): number {
  if (product.kind === "book") return product.book.volumes;
  if (product.kind === "pack") return product.pack.volumes;
  return COLLECTION.volumes;
}

/**
 * The offer lines every ad template shares: "All 9 Volumes" above the price
 * chip, and a word before or after the price ("Just Rs 2,490", or after the
 * price for Sinhala word order). Spread after the template's "price" field.
 */
export const offerFields: AdScalarFieldDef[] = [
  { key: "pricePrefix", label: "Word before the price", type: "text", hint: "e.g. \"Just\". Empty = nothing before the price." },
  { key: "priceSuffix", label: "Word after the price", type: "text", lang: "si", hint: "For Sinhala word order - put the word here and clear the one before." },
  {
    key: "volumesLine",
    label: "Volumes line (above the price)",
    type: "text",
    auto: (p) => `All ${productVolumes(p)} Volumes`,
    hint: "Empty = the product's volume count. Type a single space to hide it.",
  },
];

export const offerDefaults = { pricePrefix: "Just", priceSuffix: "", volumesLine: "" };

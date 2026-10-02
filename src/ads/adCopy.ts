import { COLLECTION, VALUE_LINE_SI, type AdProduct } from "./products";
import type { PostFields, PostLists } from "../posts/types";

/** Ads Manager's headline limit (Part 12). */
export const HEADLINE_MAX = 40;

const DEFAULT_BENEFITS = ["Pronunciation in Sinhala letters", "Meaning + when to use it", "Real-life situations"];

/** A price still holding the plan's "Rs ____" placeholder isn't worth putting in the copy. */
const isRealPrice = (s: string | undefined) => !!s && !/_{2,}/.test(s);

/** The copy-bank headline (Part 12.2) for a product. */
export function suggestHeadline(product: AdProduct): string {
  if (product.kind === "book") return product.book.headline;
  if (product.kind === "pack") return product.pack.headline;
  return COLLECTION.headline;
}

/**
 * Primary text from the ads plan's template (Part 12.3), Sinhala-first:
 * hook, what's inside, three ticks, offer, CTA. A starting point - the
 * Sinhala lines are drafts the plan says a native speaker should review.
 */
export function suggestPrimaryText(product: AdProduct, fields: PostFields, lists: PostLists): string {
  const hook =
    product.kind === "book" ? product.book.hook || product.book.hookEn : product.kind === "pack" ? product.pack.hook || product.pack.hookEn : COLLECTION.hook;
  const count =
    product.kind === "book"
      ? `${product.book.phrasesLabel} English phrases`
      : product.kind === "pack"
        ? `3 books · ${product.pack.phrasesLabel} English phrases`
        : `${COLLECTION.books} books · ${COLLECTION.phrasesLabel} English phrases`;

  const listed = (lists.bullets ?? []).map((b) => b.text?.trim()).filter((t): t is string => !!t);
  const benefits = (listed.length ? listed : DEFAULT_BENEFITS).slice(0, 3);

  const lines = [hook, `${count}. ${VALUE_LINE_SI}`, ...benefits.map((b) => `✓ ${b}`)];
  if (isRealPrice(fields.price)) lines.push(`Now ${fields.price}${isRealPrice(fields.priceWas) ? ` (was ${fields.priceWas})` : ""}`);
  lines.push("👉 Order: studypal.store");
  return lines.join("\n");
}

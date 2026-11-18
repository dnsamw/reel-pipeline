import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { listCatalogBooks, lmsContentDir, type CatalogBook } from "./lmsCatalog";

/**
 * The sales block at the end of a caption (docs/16 §6: at most 2 lines,
 * prices only from the code). Prices are read from the LMS API's
 * src/config/products.ts, never typed and never written by Claude.
 */

export const APP_HOST = "app.studypal.store";

function productsFile(): string {
  return resolve(process.env.LMS_PRODUCTS_FILE ?? join(lmsContentDir(), "..", "src", "config", "products.ts"));
}

let cache: { at: number; prices: Record<string, number> } | null = null;

/** `export const NAME_PRICE_LKR = 1990;` → { NAME_PRICE_LKR: 1990 }. */
export function prices(): Record<string, number> {
  if (cache && Date.now() - cache.at < 60_000) return cache.prices;
  const file = productsFile();
  if (!existsSync(file)) throw new Error(`products.ts not found at ${file} (set LMS_PRODUCTS_FILE)`);
  const out: Record<string, number> = {};
  for (const m of readFileSync(file, "utf8").matchAll(/export const ([A-Z0-9_]+_PRICE_LKR)\s*=\s*(\d+)\s*;/g)) out[m[1]] = Number(m[2]);
  cache = { at: Date.now(), prices: out };
  return out;
}

const price = (name: string): string => {
  const v = prices()[name];
  if (v === undefined) throw new Error(`${name} is not in products.ts`);
  return `රු. ${v.toLocaleString("en-US")}`;
};

function phraseVolumes(): number | null {
  try {
    const m = JSON.parse(readFileSync(join(lmsContentDir(), "manifest.json"), "utf8"));
    return typeof m?.totals?.volumes === "number" ? m.totals.volumes : null;
  } catch {
    return null;
  }
}

export interface SalesInput {
  book: CatalogBook | null;
  /** Pillar subject (english, grammar, japanese, korean, monk, brand). */
  subject: string;
  kind: string;
  landingPath: string;
  /** Free section key ("4-a-1") for a "try it free" link, when the post's unit is free. */
  freeUnit: string | null;
}

/** A section key "4-a-1" → /learn/4/a/1 (the reader opens free sections without buying). */
export const learnPath = (unit: string): string | null => {
  const m = /^(\d+)-([a-z]+)-(\d+)$/.exec(unit);
  return m ? `/learn/${m[1]}/${m[2]}/${m[3]}` : null;
};

/** Line 1: the offer from products.ts; line 2: where to go. Never more than 2 lines. */
export function salesBlock(s: SalesInput): string[] {
  const link = (s.freeUnit && learnPath(s.freeUnit)) || null;
  const where = link ? `👉 නොමිලේ බලන්න: ${APP_HOST}${link}` : `👉 ${APP_HOST}${s.landingPath && s.landingPath !== "/" ? s.landingPath : ""}`;
  const image = s.kind === "image" || s.kind === "carousel";
  const no = s.book?.no ?? 0;

  if (s.subject === "english" || s.subject === "grammar") {
    // Image posts carry the offer in the first comment (marketing/first-comment/COMMENTS.md).
    if (image) {
      const vols = phraseVolumes();
      const grammarBooks = listCatalogBooks().filter((b) => b.subject === "grammar").length;
      return [`📚 ${vols ? `පොත් ${vols + grammarBooks}ක ` : ""}සම්පූර්ණ කට්ටලය ගැන විස්තර පළමු comment එකේ 👇`, where];
    }
    if (s.subject === "grammar") return [`📚 Grammar පොත් 12ම ${price("GRAMMAR_ALL_PRICE_LKR")} · එක පොතක් ${price("GRAMMAR_BOOK_PRICE_LKR")}`, where];
    return [`📚 ${s.book ? `${s.book.title}: ` : ""}පොත ${price("BOOK_PRICE_LKR")} · පොත් 10ම ${price("BUNDLE_PRICE_LKR")}`, where];
  }
  if (s.subject === "japanese") {
    const pack = no >= 28 ? `JLPT N4 (J5-J7) ${price("JP_N4_PRICE_LKR")}` : `JLPT N5 (J1-J4) ${price("JP_N5_PRICE_LKR")}`;
    return [`📚 ${pack} · J1-J7 සියල්ල ${price("JP_ALL_PRICE_LKR")}`, where];
  }
  if (s.subject === "korean") {
    const pack = no >= 34 ? `EPS-TOPIK (K4-K7) ${price("KO_EPS_PRICE_LKR")}` : `මූලික (K1-K3) ${price("KO_L1_PRICE_LKR")}`;
    return [`📚 ${pack} · K1-K7 සියල්ල ${price("KO_ALL_PRICE_LKR")}`, where];
  }
  if (s.subject === "monk") return [`📚 Dhamma in English ${price("MONK_PRICE_LKR")}`, where];
  return [where];
}

/** Every price string the sales block can print, so the checker can tell code prices from typed ones. */
export function knownPriceStrings(): Set<string> {
  return new Set(Object.values(prices()).map((v) => `රු. ${v.toLocaleString("en-US")}`));
}

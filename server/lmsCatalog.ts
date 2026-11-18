import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Read-only view of the LMS content export (studypal-lms-api/content/), the
 * one source that holds every StudyPal book in the same shape (docs/16 §4).
 * New languages show up here as soon as the LMS exports them.
 */

export interface CatalogBook {
  slug: string;
  /** LMS book number (1-10 phrase, 11-22 grammar, 23 monk, 24-30 Japanese, 31-37 Korean, …). */
  no: number;
  subject: string;
  title: string;
  titleSi: string;
}

export function lmsContentDir(): string {
  return resolve(process.env.LMS_CONTENT_DIR ?? join(process.cwd(), "..", "studypal-lms", "studypal-lms-api", "content"));
}

function subjectOf(no: number, slug: string): string {
  if (no >= 1 && no <= 10) return "english";
  if (no === 23) return "monk";
  const lang = slug.split("-")[0];
  return lang || "other";
}

let cache: { at: number; books: CatalogBook[] } | null = null;

export function listCatalogBooks(): CatalogBook[] {
  if (cache && Date.now() - cache.at < 60_000) return cache.books;
  const dir = lmsContentDir();
  const books: CatalogBook[] = [];
  const catalogDir = join(dir, "catalog");
  if (existsSync(catalogDir)) {
    for (const f of readdirSync(catalogDir)) {
      if (!f.endsWith(".json")) continue;
      try {
        const b = JSON.parse(readFileSync(join(catalogDir, f), "utf8"));
        if (typeof b.slug !== "string" || typeof b.no !== "number" || !b.title) continue;
        books.push({ slug: b.slug, no: b.no, subject: subjectOf(b.no, b.slug), title: b.title.en ?? b.slug, titleSi: b.title.si ?? "" });
      } catch {
        // a half-written export file: skip it, the next read picks it up
      }
    }
  }
  const grammarIndex = join(dir, "grammar", "index.json");
  if (existsSync(grammarIndex)) {
    try {
      const g = JSON.parse(readFileSync(grammarIndex, "utf8"));
      const list: unknown = Array.isArray(g) ? g : (g.books ?? Object.values(g).find(Array.isArray));
      if (Array.isArray(list))
        for (const b of list)
          if (b && typeof b.slug === "string")
            books.push({ slug: `grammar-${b.slug}`, no: Number(b.book) || 10 + Number(b.no), subject: "grammar", title: b.title?.en ?? b.slug, titleSi: b.title?.si ?? "" });
    } catch {
      // ignore, as above
    }
  }
  books.sort((a, b) => a.no - b.no);
  cache = { at: Date.now(), books };
  return books;
}

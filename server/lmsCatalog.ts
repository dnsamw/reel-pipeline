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

// --- Book content (docs/16 §4): the units of a book and the lines in a unit ---

/** A section (phrase / monk / Japanese / Korean books) or a lesson (grammar books). */
export interface SourceUnit {
  /** Section key ("4-a-1") or grammar lesson slug ("a-an-uses"). */
  id: string;
  title: string;
  titleSi: string;
  /** Free units can be opened before buying, so they are preferred for "try it" posts. */
  free: boolean;
  /** Number of lines, when known without opening the unit. */
  count: number | null;
}

export interface SourceGroup {
  /** Volume letter, or grammar unit number. */
  id: string;
  title: string;
  units: SourceUnit[];
}

export interface BookOutline {
  book: CatalogBook;
  groups: SourceGroup[];
}

export const SOURCE_LINE_KINDS = ["phrase", "mistake", "example", "hook", "tip"] as const;
export type SourceLineKind = (typeof SOURCE_LINE_KINDS)[number];

/** One line a post can use, in the same shape for every kind of book. */
export interface SourceLine {
  /** Stable within one export: "4:12" (book:ord) or "g:a-an-uses:m0". */
  id: string;
  kind: SourceLineKind;
  /** The line to teach: English phrase, Japanese/Korean word, or the right sentence. */
  text: string;
  /** Sinhala pronunciation of `text`. */
  say: string;
  /** Sinhala meaning. */
  meaning: string;
  /** English meaning or usage note. */
  note: string;
  /** Mistakes only: the wrong sentence. */
  wrong?: string;
}

const readJson = (path: string): any => JSON.parse(readFileSync(path, "utf8"));
const GRAMMAR_PREFIX = "grammar-";

function grammarIndex(): any[] {
  const p = join(lmsContentDir(), "grammar", "index.json");
  if (!existsSync(p)) return [];
  const g = readJson(p);
  return Array.isArray(g.books) ? g.books : [];
}

export function bookOutline(slug: string): BookOutline {
  const book = listCatalogBooks().find((b) => b.slug === slug);
  if (!book) throw new Error(`Unknown book "${slug}"`);
  if (slug.startsWith(GRAMMAR_PREFIX)) {
    const g = grammarIndex().find((x) => `${GRAMMAR_PREFIX}${x.slug}` === slug);
    if (!g) throw new Error(`Grammar book "${slug}" is not in grammar/index.json`);
    const groups: SourceGroup[] = (g.units ?? []).map((u: any) => ({
      id: String(u.no),
      title: u.title?.en ?? `Unit ${u.no}`,
      units: (u.lessons ?? []).map((l: any) => ({
        id: l.slug,
        title: l.title?.en ?? l.slug,
        titleSi: l.title?.si ?? "",
        free: l.free === true,
        count: null,
      })),
    }));
    return { book, groups };
  }
  const c = readJson(join(lmsContentDir(), "catalog", `book-${book.no}.json`));
  const groups: SourceGroup[] = (c.volumes ?? []).map((v: any) => ({
    id: v.letter,
    title: v.title?.en ?? v.letter,
    units: (v.sections ?? []).map((s: any) => ({
      id: s.key,
      title: s.title?.en ?? s.key,
      titleSi: s.title?.si ?? "",
      free: s.free === true,
      count: typeof s.phraseCount === "number" ? s.phraseCount : null,
    })),
  }));
  return { book, groups };
}

/** The unit as listed in the book outline (unit ids are only accepted from there, never used as raw paths). */
export function findUnit(slug: string, unitId: string): SourceUnit {
  for (const g of bookOutline(slug).groups) {
    const u = g.units.find((x) => x.id === unitId);
    if (u) return u;
  }
  throw new Error(`"${unitId}" is not a unit of ${slug}`);
}

export function unitLines(slug: string, unitId: string): SourceLine[] {
  findUnit(slug, unitId);
  const dir = lmsContentDir();
  if (slug.startsWith(GRAMMAR_PREFIX)) {
    const lesson = readJson(join(dir, "grammar", "lessons", `${unitId}.json`));
    const lines: SourceLine[] = [];
    (lesson.blocks ?? []).forEach((b: any, bi: number) => {
      if (b.type === "hook" && b.text_en)
        lines.push({ id: `g:${unitId}:hook`, kind: "hook", text: b.text_en, say: "", meaning: b.text_si ?? "", note: "" });
      if (b.type === "mistakes")
        (b.items ?? []).forEach((m: any, i: number) => {
          if (m.right)
            lines.push({ id: `g:${unitId}:m${bi}-${i}`, kind: "mistake", text: m.right, wrong: m.wrong ?? "", say: m.right_pronunciation ?? "", meaning: m.why_si ?? "", note: m.why_en ?? "" });
        });
      if (b.type === "usage")
        (b.examples ?? []).forEach((e: any, i: number) => {
          if (e.sentence)
            lines.push({ id: `g:${unitId}:u${bi}-${i}`, kind: "example", text: e.sentence, say: e.pronunciation ?? "", meaning: e.translation ?? "", note: b.heading_en ?? "" });
        });
      if (b.type === "tip" && b.body_en)
        lines.push({ id: `g:${unitId}:t${bi}`, kind: "tip", text: b.body_en, say: "", meaning: b.body_si ?? "", note: "" });
    });
    return lines;
  }
  const s = readJson(join(dir, "sections", `${unitId}.json`));
  return (s.phrases ?? [])
    .filter((p: any) => typeof p.p === "string" && p.p.trim())
    .map((p: any) => ({
      id: `${s.book}:${p.ord}`,
      kind: "phrase" as const,
      text: p.p,
      say: p.pr ?? "",
      meaning: p.tr ?? "",
      note: p.ex?.en ?? "",
    }));
}

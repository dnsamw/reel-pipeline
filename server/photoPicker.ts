import { existsSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative, resolve, sep } from "node:path";
import { db } from "./db";
import { listCatalogBooks, type CatalogBook } from "./lmsCatalog";
import { addDays, PHOTO_REPEAT_DAYS, todaySriLanka } from "./planner";
import { socialMediaDir } from "./weekPack";

/**
 * Background photos for posts (docs/16 §3 "Background photos"): the book's
 * own folder in social-media/stock-images/ first, then the subject's
 * _shared folder; a photo is not reused within 30 days. Grok images
 * (`ai-grok-…`) are a last resort and always need the owner (§10.2).
 */

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);
export const LOW_STOCK = 6;

export const stockDir = () => join(socialMediaDir(), "stock-images");

/** A path relative to stock-images/, with forward slashes (what posts store). */
const rel = (abs: string) => relative(stockDir(), abs).split(sep).join("/");

function imagesIn(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...imagesIn(p));
    else if (IMAGE_EXT.has(extname(name).toLowerCase())) out.push(p);
  }
  return out;
}

/** "n5-j2-j4" covers j2..j4, "k4-factory-construction" covers k4, "03-getting-things-done-travel" covers book 3. */
function folderCovers(folder: string, book: CatalogBook): boolean {
  const lang = book.subject === "japanese" ? "j" : book.subject === "korean" ? "k" : null;
  if (lang) {
    const n = Number(book.slug.split("-").pop()?.slice(1));
    const nums = [...folder.matchAll(new RegExp(`(?:^|-)${lang}(\\d)`, "g"))].map((m) => Number(m[1]));
    if (nums.length === 0) return false;
    return nums.length === 1 ? nums[0] === n : n >= Math.min(...nums) && n <= Math.max(...nums);
  }
  const lead = /^(\d{2})-/.exec(folder);
  if (!lead) return false;
  const want = book.subject === "grammar" ? book.no - 10 : book.no;
  return Number(lead[1]) === want;
}

/** Folders to look in, best first: [book folder(s), subject _shared or the whole subject]. */
export function photoFolders(subject: string, book: CatalogBook | null): string[][] {
  const subj = join(stockDir(), subject);
  if (!existsSync(subj)) return [];
  if (!book || subject === "monk" || subject === "brand") return [[subj]];
  const own = readdirSync(subj)
    .filter((f) => !f.startsWith("_") && statSync(join(subj, f)).isDirectory() && folderCovers(f, book))
    .map((f) => join(subj, f));
  return [own, [join(subj, "_shared")]];
}

function usedPhotos(around: string): Map<string, string> {
  const rows = db
    .prepare("SELECT photo, date FROM planner_posts WHERE photo != '' AND status != 'rejected' AND (date IS NULL OR (date >= ? AND date <= ?))")
    .all(addDays(around, -PHOTO_REPEAT_DAYS), addDays(around, PHOTO_REPEAT_DAYS)) as { photo: string; date: string | null }[];
  return new Map(rows.map((r) => [r.photo, r.date ?? "reserve"]));
}

function everUsed(): Map<string, number> {
  const rows = db.prepare("SELECT photo, COUNT(*) AS n FROM planner_posts WHERE photo != '' GROUP BY photo").all() as { photo: string; n: number }[];
  return new Map(rows.map((r) => [r.photo, r.n]));
}

/**
 * A free photo for a post on `date`, or null when the folders are empty or
 * used up. Least-used photos first (then random), real photos before
 * `ai-grok-` ones.
 */
export function pickPhoto(subject: string, bookSlug: string, date: string | null, opts: { exclude?: string[]; random?: () => number } = {}): string | null {
  const book = listCatalogBooks().find((b) => b.slug === bookSlug) ?? null;
  const used = usedPhotos(date ?? todaySriLanka());
  for (const x of opts.exclude ?? []) used.set(x, "this run");
  const counts = everUsed();
  const random = opts.random ?? Math.random;
  for (const ai of [false, true]) {
    for (const tier of photoFolders(subject, book)) {
      const free = tier
        .flatMap(imagesIn)
        .map(rel)
        .filter((p) => !used.has(p) && p.split("/").pop()!.startsWith("ai-grok-") === ai);
      if (free.length === 0) continue;
      const ranked = free.map((p) => ({ p, n: counts.get(p) ?? 0, r: random() })).sort((a, b) => a.n - b.n || a.r - b.r);
      return ranked[0].p;
    }
  }
  return null;
}

export interface PhotoStock {
  folder: string;
  total: number;
  /** Not used within the 30-day window around today. */
  free: number;
  low: boolean;
}

/** Every book / shared folder with how many photos are free now ("download more of these"). */
export function photoStock(): PhotoStock[] {
  const root = stockDir();
  if (!existsSync(root)) return [];
  const used = usedPhotos(todaySriLanka());
  const out: PhotoStock[] = [];
  const walk = (dir: string, depth: number) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (!statSync(p).isDirectory() || name === "_incoming") continue;
      const leaf = readdirSync(p).every((n) => !statSync(join(p, n)).isDirectory());
      if (leaf || depth >= 2) {
        const imgs = imagesIn(p).map(rel);
        const free = imgs.filter((x) => !used.has(x)).length;
        out.push({ folder: rel(p), total: imgs.length, free, low: free < LOW_STOCK });
      } else walk(p, depth + 1);
    }
  };
  walk(root, 0);
  return out.sort((a, b) => a.folder.localeCompare(b.folder));
}

/** Absolute path of a stock photo for serving, or null when it isn't inside stock-images/ or isn't an image. */
export function stockPhotoPath(relPath: string): string | null {
  const abs = resolve(stockDir(), relPath);
  if (!abs.startsWith(resolve(stockDir()) + sep) || !IMAGE_EXT.has(extname(abs).toLowerCase()) || !existsSync(abs)) return null;
  return abs;
}

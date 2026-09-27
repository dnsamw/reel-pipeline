import { copyFileSync, existsSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { basename, extname, join, relative, resolve, sep } from "node:path";
import { defaultConfig } from "../src/config/config";
import { loadManifest, saveManifest, type Manifest } from "../src/render/manifest";
import { listRecipes } from "./recipes";
import { listTemplates } from "./templates";
import { listRuns } from "./renderRunner";
import { listPublications } from "./publications";
import { getSettings } from "./settings";

/**
 * The Media Library (gui /library): lists every generated/uploaded media file
 * the GUI knows about, deletes selected ones, and resets/prunes the render
 * manifest. Everything is scoped to three folders and a fixed set of
 * extensions - ids are "<kind>:<file name>", never raw paths, so a request
 * can't reach anything else on disk.
 */

const ROOT = process.cwd();
const OUTPUT_DIR = resolve(ROOT, defaultConfig.outputDir);
const POSTS_DIR = join(OUTPUT_DIR, "posts");
const IMAGES_DIR = resolve(ROOT, "assets", "images");
const MANIFEST_PATH = resolve(ROOT, defaultConfig.manifestPath);

export type LibraryKind = "reel" | "post" | "image";

const DIRS: Record<LibraryKind, { dir: string; exts: string[]; url: (file: string) => string }> = {
  // /media is Express's static route over output/ (server/index.ts); /images is Vite's publicDir (assets/).
  reel: { dir: OUTPUT_DIR, exts: [".mp4"], url: (f) => `/media/${encodeURIComponent(f)}` },
  post: { dir: POSTS_DIR, exts: [".png", ".mp4"], url: (f) => `/media/posts/${encodeURIComponent(f)}` },
  image: { dir: IMAGES_DIR, exts: [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"], url: (f) => `/images/${encodeURIComponent(f)}` },
};

export interface LibraryItem {
  id: string;
  kind: LibraryKind;
  name: string;
  /** Repo-relative, forward slashes - what the GUI shows. */
  path: string;
  url: string;
  mediaType: "video" | "image";
  sizeBytes: number;
  modifiedAt: string;
  /** Batch reels: the manifest entry pointing at this file, if any. */
  manifest?: { key: string; chapterTitle: string; template: string; renderedAt: string } | null;
  /** Batch reels / post exports: whether it has been published to Facebook. */
  published?: boolean;
  /** Uploaded images: recipes/templates/settings that reference it. */
  usedBy?: string[];
}

function listDir(kind: LibraryKind): string[] {
  const { dir, exts } = DIRS[kind];
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && exts.includes(extname(e.name).toLowerCase()))
    .map((e) => e.name);
}

function relPath(abs: string): string {
  return relative(ROOT, abs).split(sep).join("/");
}

function sameFile(a: string, b: string): boolean {
  return resolve(ROOT, a).toLowerCase() === resolve(ROOT, b).toLowerCase();
}

/** Every place an uploaded image path ("images/<file>") can be referenced from - recipes' image layers, template/settings configs. */
function imageReferences(): { label: string; json: string }[] {
  const refs: { label: string; json: string }[] = [];
  for (const r of listRecipes()) refs.push({ label: `Recipe "${r.name}"`, json: JSON.stringify(r) });
  for (const t of listTemplates()) refs.push({ label: `Template "${t.name}"`, json: JSON.stringify(t) });
  refs.push({ label: "Settings", json: JSON.stringify(getSettings()) });
  return refs;
}

export function listLibrary(): { items: LibraryItem[]; manifest: { entries: number; missingFiles: number } } {
  const manifest = loadManifest(MANIFEST_PATH);
  const manifestEntries = Object.entries(manifest);
  const publications = listPublications().filter((p) => p.status === "published" && (p.outcome ?? "live") === "live");
  const refs = imageReferences();

  const items: LibraryItem[] = [];
  for (const kind of Object.keys(DIRS) as LibraryKind[]) {
    const { dir, url } = DIRS[kind];
    for (const name of listDir(kind)) {
      const abs = join(dir, name);
      const st = statSync(abs);
      const item: LibraryItem = {
        id: `${kind}:${name}`,
        kind,
        name,
        path: relPath(abs),
        url: url(name),
        mediaType: extname(name).toLowerCase() === ".mp4" ? "video" : "image",
        sizeBytes: st.size,
        modifiedAt: st.mtime.toISOString(),
      };
      if (kind === "reel") {
        const hit = manifestEntries.find(([, e]) => sameFile(e.outputPath, abs));
        item.manifest = hit ? { key: hit[0], chapterTitle: hit[1].chapterTitle, template: hit[1].template, renderedAt: hit[1].renderedAt } : null;
        item.published = hit ? publications.some((p) => p.batchId === hit[1].batchId && p.template === hit[1].template) : false;
      } else if (kind === "post") {
        item.published = publications.some((p) => p.batchId === `post:${name}`);
      } else {
        const needle = `images/${name}`;
        item.usedBy = refs.filter((r) => r.json.includes(needle)).map((r) => r.label);
      }
      items.push(item);
    }
  }
  items.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));

  const missingFiles = manifestEntries.filter(([, e]) => !existsSync(resolve(ROOT, e.outputPath))).length;
  return { items, manifest: { entries: manifestEntries.length, missingFiles } };
}

/** renderBatch.ts rewrites manifest.json after every reel - editing it mid-run would be silently overwritten. */
function assertNoRunningRender(): void {
  if (listRuns().some((r) => r.status === "running")) {
    throw Object.assign(new Error("A render is running - wait for it to finish (or cancel it on Monitor) before changing reels or the manifest."), { status: 409 });
  }
}

function resolveId(id: string): { kind: LibraryKind; name: string; abs: string } {
  const i = id.indexOf(":");
  const kind = id.slice(0, i) as LibraryKind;
  const name = id.slice(i + 1);
  const spec = DIRS[kind];
  // basename() equality rejects any "../" or sub-path smuggled into the name.
  if (!spec || !name || basename(name) !== name || !spec.exts.includes(extname(name).toLowerCase())) throw new Error(`Invalid media id: ${id}`);
  return { kind, name, abs: join(spec.dir, name) };
}

export function deleteLibraryItems(ids: string[]): { deleted: string[]; manifestEntriesRemoved: number; errors: { id: string; error: string }[] } {
  const targets = ids.map((id) => ({ id, ...resolveId(id) }));
  if (targets.some((t) => t.kind === "reel")) assertNoRunningRender();

  const deleted: string[] = [];
  const errors: { id: string; error: string }[] = [];
  const deletedReels: string[] = [];
  for (const t of targets) {
    try {
      if (existsSync(t.abs)) unlinkSync(t.abs);
      deleted.push(t.id);
      if (t.kind === "reel") deletedReels.push(t.abs);
    } catch (err) {
      errors.push({ id: t.id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  // A deleted batch reel's manifest entry goes too, so the batch reads as
  // "not rendered yet" again (Queue Render / Batch Render pick it back up).
  let manifestEntriesRemoved = 0;
  if (deletedReels.length > 0) {
    const manifest = loadManifest(MANIFEST_PATH);
    for (const [key, entry] of Object.entries(manifest)) {
      if (deletedReels.some((abs) => sameFile(entry.outputPath, abs))) {
        delete manifest[key];
        manifestEntriesRemoved++;
      }
    }
    if (manifestEntriesRemoved > 0) saveManifest(MANIFEST_PATH, manifest);
  }
  return { deleted, manifestEntriesRemoved, errors };
}

/**
 * Empties the manifest - every batch then reads as not rendered, so the next
 * run re-renders them. Rendered videos are NOT deleted (they show up as
 * untracked in the library). The old manifest is copied next to it first, so
 * a reset can be undone by hand.
 */
export function resetManifest(): { cleared: number; backupPath: string | null } {
  assertNoRunningRender();
  const manifest = loadManifest(MANIFEST_PATH);
  const cleared = Object.keys(manifest).length;
  let backupPath: string | null = null;
  if (existsSync(MANIFEST_PATH)) {
    const backup = MANIFEST_PATH.replace(/\.json$/i, `.backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    copyFileSync(MANIFEST_PATH, backup);
    backupPath = relPath(backup);
  }
  saveManifest(MANIFEST_PATH, {});
  return { cleared, backupPath };
}

/** Drops only the entries whose video file no longer exists. */
export function pruneManifest(): { removed: number } {
  assertNoRunningRender();
  const manifest: Manifest = loadManifest(MANIFEST_PATH);
  let removed = 0;
  for (const [key, entry] of Object.entries(manifest)) {
    if (!existsSync(resolve(ROOT, entry.outputPath))) {
      delete manifest[key];
      removed++;
    }
  }
  if (removed > 0) saveManifest(MANIFEST_PATH, manifest);
  return { removed };
}

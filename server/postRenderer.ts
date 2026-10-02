import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { getPostTemplate } from "../src/posts/registry";
import type { PostColors, PostFields, PostLists } from "../src/posts/types";

const ROOT = process.cwd();
const SRC_DIR = join(ROOT, "src");
const ASSETS_DIR = join(ROOT, "assets");
export const POSTS_OUTPUT_DIR = join(ROOT, "output", "posts");

// bundle() is the slow part (webpack, ~10-30s) - reuse it across renders and
// only rebuild when something under src/ has changed since, so editing a post
// template while the server runs is picked up on the next render.
let cached: { stamp: number; location: Promise<string> } | null = null;

function newestMtime(dir: string): number {
  let newest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    newest = Math.max(newest, entry.isDirectory() ? newestMtime(p) : statSync(p).mtimeMs);
  }
  return newest;
}

function getBundle(): Promise<string> {
  const stamp = newestMtime(SRC_DIR);
  if (!cached || cached.stamp !== stamp) {
    const location = bundle({
      entryPoint: join(SRC_DIR, "compositions", "Root.tsx"),
      publicDir: ASSETS_DIR,
    });
    // Don't keep a failed bundle cached - next request retries.
    location.catch(() => {
      if (cached?.location === location) cached = null;
    });
    cached = { stamp, location };
  }
  return cached.location;
}

/** Kick off the bundle in the background so the first real render is quicker. */
export function warmPostBundle(): void {
  getBundle().catch((err) => console.warn("Post bundle warm-up failed:", err));
}

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

/**
 * bundle() snapshots assets/ when it builds, so an image uploaded after that
 * would 404 inside the render. Inline an assets/-relative image path as a
 * data: URI instead - always current, and no rebundle per upload. URLs and
 * data:/blob: values pass through unchanged.
 */
export function inlineAssetImage(value: string): string {
  if (!value || /^(data:|https?:|blob:)/.test(value)) return value;
  const abs = resolve(ASSETS_DIR, value.replace(/^\/+/, ""));
  if (!abs.startsWith(ASSETS_DIR + sep) || !existsSync(abs)) throw new Error(`Image not found in assets/: ${value}`);
  const mime = MIME[extname(abs).toLowerCase()] ?? "application/octet-stream";
  return `data:${mime};base64,${readFileSync(abs).toString("base64")}`;
}

function inlineAssetImages(templateId: string, fields: PostFields): PostFields {
  const def = getPostTemplate(templateId)!;
  const out = { ...fields };
  for (const f of def.fields) if (f.type === "image") out[f.key] = inlineAssetImage(out[f.key] ?? "");
  return out;
}

/** Renders one of Root.tsx's <Still>s to a PNG buffer - shared by post and ad exports. */
export async function renderStillPng(compositionId: string, inputProps: Record<string, unknown>): Promise<{ png: Buffer; width: number; height: number }> {
  const serveUrl = await getBundle();
  const composition = await selectComposition({ serveUrl, id: compositionId, inputProps });
  const { buffer } = await renderStill({ composition, serveUrl, inputProps, imageFormat: "png" });
  if (!buffer) throw new Error("renderStill returned no image");
  return { png: buffer, width: composition.width, height: composition.height };
}

export async function renderPostPng(input: { templateId: string; fields: PostFields; lists: PostLists; colors: PostColors; safeZones?: boolean }): Promise<{ png: Buffer; savedPath: string; width: number; height: number }> {
  const def = getPostTemplate(input.templateId);
  if (!def) throw new Error(`Unknown post template "${input.templateId}"`);

  const inputProps = {
    templateId: def.id,
    fields: inlineAssetImages(def.id, { ...def.defaultFields, ...input.fields }),
    lists: { ...def.defaultLists, ...input.lists },
    colors: { ...def.defaultColors, ...input.colors },
    safeZones: !!input.safeZones,
  };

  const { png, width, height } = await renderStillPng("Post", inputProps);

  mkdirSync(POSTS_OUTPUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const savedPath = join(POSTS_OUTPUT_DIR, `${def.id}-${stamp}.png`);
  writeFileSync(savedPath, png);
  return { png, savedPath, width, height };
}

import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { extname, relative, resolve, sep } from "node:path";
import { defaultConfig } from "../../src/config/config";
import { loadManifest } from "../../src/render/manifest";
import { resolveTool } from "../postReel";
import type { MediaFile } from "./types";

const ROOT = process.cwd();
const OUTPUT_DIR = resolve(ROOT, defaultConfig.outputDir);
const POSTS_DIR = resolve(OUTPUT_DIR, "posts");

/**
 * What's being published:
 * - a Post Creator export, by the savedPath its export returned (output/posts/...)
 * - a batch-rendered reel, by its manifest batch + template (Monitor page)
 */
export type PublishSource = { type: "post"; savedPath: string } | { type: "batch"; batchId: string; template: string };

/** The publication-row identity for a source: batch reels keep their real batch id; posts use "post:<file>". */
export function sourceKey(source: PublishSource, file: MediaFile): { batchId: string; template: string } {
  if (source.type === "batch") return { batchId: source.batchId, template: source.template };
  return { batchId: `post:${file.relPath.split("/").pop()}`, template: "post" };
}

export function resolveSourcePath(source: PublishSource): string {
  if (source.type === "post") {
    const abs = resolve(ROOT, source.savedPath);
    if (!abs.startsWith(POSTS_DIR + sep) || !existsSync(abs)) throw new Error(`Exported file not found: ${source.savedPath}`);
    if (![".png", ".mp4"].includes(extname(abs).toLowerCase())) throw new Error("Only exported .png and .mp4 files can be published");
    return abs;
  }
  const manifest = loadManifest(resolve(ROOT, defaultConfig.manifestPath));
  // Same key shape as server/index.ts's manifestKey(): built-in template "1" has no suffix.
  const key = source.template === "1" ? source.batchId : `t${source.template}-${source.batchId}`;
  const entry = manifest[key] ?? Object.values(manifest).find((e) => e.batchId === source.batchId && e.template === source.template);
  if (!entry) throw new Error("This reel isn't in the manifest - render it first");
  const abs = resolve(ROOT, entry.outputPath);
  if (!existsSync(abs)) throw new Error(`The rendered file is missing: ${entry.outputPath}`);
  return abs;
}

/** Dimensions (and duration for video) via ffprobe - works for PNG/JPEG as well as MP4. */
export function probeMedia(absPath: string): MediaFile {
  const out = spawnSync(
    resolveTool("ffprobe"),
    ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "json", absPath],
    { encoding: "utf8" },
  );
  const json = JSON.parse(out.stdout || "{}");
  const isVideo = extname(absPath).toLowerCase() === ".mp4";
  return {
    absPath,
    relPath: relative(ROOT, absPath).split(sep).join("/"),
    kind: isVideo ? "video" : "image",
    width: Number(json.streams?.[0]?.width) || 0,
    height: Number(json.streams?.[0]?.height) || 0,
    durationSeconds: isVideo ? Number(json.format?.duration) || 0 : null,
    sizeBytes: statSync(absPath).size,
  };
}

export function isVertical916(m: MediaFile): boolean {
  return m.width > 0 && m.width * 16 === m.height * 9;
}

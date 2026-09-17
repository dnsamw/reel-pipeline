import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface ManifestEntry {
  batchId: string;
  /** "1" | "2" | "3" - see renderBatch.ts's Template type / --template flag. */
  template: string;
  chapterOrder: number;
  chapterTitle: string;
  phraseIds: string[];
  musicFile: string | null;
  musicStartFrame: number;
  tickFile: string | null;
  revealSoundFile: string | null;
  introVoiceFile: string | null;
  ttsEnabled: boolean;
  ttsPhraseFiles: (string | null)[];
  ttsRevealFiles: (string | null)[];
  /** Whether the music track was ducked against dialogue/sfx via ffmpeg's sidechaincompress - see --sidechain in renderBatch.ts. */
  sidechain: boolean;
  outputPath: string;
  renderedAt: string;
  suggestedCaption: string;
}

export type Manifest = Record<string, ManifestEntry>;

export function loadManifest(path: string): Manifest {
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf-8"));
}

export function saveManifest(path: string, manifest: Manifest): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(manifest, null, 2));
}

/**
 * A batch counts as already rendered only if both the manifest entry AND
 * its output file exist - if the mp4 was deleted by hand, this treats it
 * as not-rendered so a plain rerun repairs it instead of silently leaving
 * a manifest entry that points at nothing.
 */
export function isRendered(manifest: Manifest, batchId: string): boolean {
  const entry = manifest[batchId];
  return entry != null && existsSync(entry.outputPath);
}

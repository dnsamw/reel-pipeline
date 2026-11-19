import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { defaultConfig, type ReelConfig } from "../src/config/config";
import { listAudioFiles } from "../src/audio/listAudioFiles";
import type { Phrase } from "../src/data/phrase";
import type { ReelProps } from "../src/compositions/reelProps";
import { listCatalogBooks, unitLines } from "./lmsCatalog";
import { listPillars, type PlannerPost } from "./planner";
import { APP_HOST } from "./salesBlock";
import { getBundle } from "./postRenderer";
import { getRecipe } from "./recipes";
import { getSettings, resolveDefaultConfig } from "./settings";

/**
 * Silent Planner reels (owner 2026-11-18: "silent reels with music only for
 * now"): the post's book lines go into the default reel composition (Settings
 * → Composition) as its phrases, with a music track and nothing else: no
 * voice-over (no TTS quota), no intro voice, no tick or reveal sounds.
 * Japanese and Korean lines work too (the reel asks for the Sinhala meaning).
 */

const REPO = fileURLToPath(new URL("..", import.meta.url));
const BUILT_IN: Record<string, string> = { "1": "Reel", "2": "Reel-T2", "3": "Reel-T3" };
export const REEL_OUTPUT_DIR = () => join(process.cwd(), "output", "planner-reels");

/**
 * Tracks the Planner may use. When `assets/music/planner-music.txt` exists,
 * only the file names listed in it (one per line) are used; otherwise every
 * track in assets/music.
 */
export function plannerMusic(): string[] {
  const dir = join(REPO, defaultConfig.musicDir);
  const all = listAudioFiles(dir);
  const allow = join(dir, "planner-music.txt");
  if (!existsSync(allow)) return all;
  const names = new Set(
    readFileSync(allow, "utf8")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#")),
  );
  return all.filter((f) => names.has(f));
}

/** Track length in seconds (ffprobe), or null when it can't be read. */
function trackSeconds(file: string): number | null {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file], { encoding: "utf8", windowsHide: true, timeout: 15_000 });
  const s = Number(r.stdout?.trim());
  return Number.isFinite(s) && s > 0 ? s : null;
}

/**
 * Where to start in the track: a fixed spot from the seed, kept inside the
 * track (a start past its end breaks the looped music layer). Short or
 * unreadable tracks start at 0.
 */
export function musicStart(file: string | null, seed: number, fps: number): number {
  if (!file) return 0;
  const secs = trackSeconds(join(REPO, defaultConfig.musicDir, file));
  if (!secs || secs < 40) return 0;
  const room = Math.min(30, secs - 20);
  return Math.round((seed % Math.floor(room)) * fps);
}

/** A number from the post id, so a re-render picks the same track and start. */
const seedOf = (id: string) => createHash("sha1").update(id).digest().readUInt32BE(0);

/** The book lines as the reel's phrases (text → phrase, Sinhala meaning → the answer). */
export function reelPhrases(p: PlannerPost): Phrase[] {
  const full = p.book && p.source.unit ? unitLines(p.book, p.source.unit) : [];
  return (p.source.lines ?? []).map((l, i) => {
    const f = full.find((x) => x.id === l.id);
    return {
      id: l.id,
      phrase: l.text,
      translationSi: f?.meaning || null,
      pronunciationSi: f?.say || null,
      explanation: f?.note || "",
      explanationSi: null,
      chapterId: p.source.unit ?? "",
      chapterTitle: p.source.unitTitle ?? "",
      chapterOrder: 0,
      order: i + 1,
    };
  });
}

/**
 * The reel's fixed words for this post's subject (header label, outro
 * heading and line, outro link). Only facts the export gives: the book's
 * title, no counts.
 */
export function reelTexts(p: PlannerPost): Pick<ReelConfig, "brandLabel" | "outroHeading" | "outroSub" | "ctaUrl"> {
  const book = listCatalogBooks().find((b) => b.slug === p.book);
  const pillar = listPillars().find((x) => x.id === p.pillarId);
  const subject = pillar?.subject ?? book?.subject ?? "english";
  const title = book?.title.split(":")[0].trim() ?? "";
  const link = `${APP_HOST}${pillar?.landingPath && pillar.landingPath !== "/" ? pillar.landingPath : ""}`;
  switch (subject) {
    case "japanese":
      return { brandLabel: "StudyPal Japanese", outroHeading: "Learn Japanese in Sinhala", outroSub: `${title}: Japanese with Sinhala pronunciation & meaning`, ctaUrl: link };
    case "korean":
      return { brandLabel: "StudyPal Korean", outroHeading: "Learn Korean in Sinhala", outroSub: `${title}: Korean with Sinhala pronunciation & meaning`, ctaUrl: link };
    case "grammar":
      return { brandLabel: "StudyPal Grammar", outroHeading: "Get your English grammar right", outroSub: `${title}: every lesson explained in Sinhala`, ctaUrl: link };
    case "monk":
      return { brandLabel: "Dhamma in English", outroHeading: "Get the full book", outroSub: `${title}: English with Sinhala pronunciation & meaning`, ctaUrl: link };
    default:
      return { brandLabel: "StudyPal Phrasebook", outroHeading: "Get the full phrasebook", outroSub: `${title}: English phrases with Sinhala pronunciation & meaning`, ctaUrl: link };
  }
}

function composition(): { id: string; recipe: unknown | null } {
  const chosen = getSettings().defaultRecipeId || "1";
  if (BUILT_IN[chosen]) return { id: BUILT_IN[chosen], recipe: null };
  const custom = getRecipe(chosen);
  return custom ? { id: "Reel-Custom", recipe: custom } : { id: "Reel", recipe: null };
}

/** Renders the post's lines to output/planner-reels/<date>-<slot>-<id>.mp4; returns the repo-relative path. */
export async function renderPlannerReel(p: PlannerPost, log: (l: string) => void = () => {}): Promise<string> {
  const phrases = reelPhrases(p);
  if (phrases.length === 0) throw new Error("A reel needs book lines");
  const config: ReelConfig = { ...resolveDefaultConfig(defaultConfig), ...reelTexts(p), ttsEnabled: false, phrasesPerReel: Math.min(6, phrases.length) };
  const tracks = plannerMusic();
  const seed = seedOf(p.id);
  const musicFile = tracks.length ? tracks[seed % tracks.length] : null;
  const props: ReelProps = {
    phrases: phrases.slice(0, 6),
    config,
    musicFile,
    musicStartFrame: musicStart(musicFile, seed, config.fps),
    tickFile: null,
    revealSoundFile: null,
    introVoiceFile: null,
    ttsPhraseFiles: phrases.map(() => null),
    ttsRevealFiles: phrases.map(() => null),
  };
  const comp = composition();
  const inputProps = comp.recipe ? { ...props, recipe: comp.recipe } : props;
  const serveUrl = await getBundle();
  const selected = await selectComposition({ serveUrl, id: comp.id, inputProps });
  mkdirSync(REEL_OUTPUT_DIR(), { recursive: true });
  const out = join(REEL_OUTPUT_DIR(), `${p.date ?? "reserve"}-${p.slotId ?? "x"}-${p.id.slice(0, 8)}.mp4`);
  log(`rendering reel ${p.date} ${p.slotId} (${comp.id}, ${Math.round(selected.durationInFrames / selected.fps)} s, music: ${props.musicFile ?? "none"})`);
  await renderMedia({ serveUrl, composition: selected, inputProps, codec: "h264", outputLocation: out });
  return relative(process.cwd(), out).split("\\").join("/");
}

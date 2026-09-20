import { mkdirSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { getPhrases, disconnect } from "../data/getPhrases";
import { batchPhrases, type ReelBatch } from "../data/batch";
import { defaultConfig, type ReelConfig } from "../config/config";
import { pickMusicTrack, pickMusicStartFrame } from "../audio/music";
import { findTickFile } from "../audio/tick";
import { findRevealSound } from "../audio/revealSound";
import { pickIntroVoice } from "../audio/voice";
import { synthesizeSpeech } from "../audio/tts";
import { isFfmpegAvailable } from "../audio/ffmpeg";
import { applyMusicSidechain } from "./sidechain";
import { loadManifest, saveManifest, isRendered, type ManifestEntry } from "./manifest";
import { buildCaption } from "./caption";
import type { ReelProps } from "../compositions/Reel";

/**
 * Bulk, resumable production renderer. Node-only (Prisma + fs + the
 * headless-Chrome-driving @remotion/renderer) - this is the one place all
 * the pieces (DB, batching, audio selection, the Reel composition) come
 * together into actual mp4 files.
 *
 * Usage:
 *   npm run render:batch -- --chapters=0-0        # DB BookChapter.order range (0-indexed - see the printed chapter titles to confirm which is which)
 *   npm run render:batch -- --limit=3             # render at most 3 NEW reels this run, then stop (skips still count toward nothing - already-rendered batches don't consume the limit)
 *   npm run render:batch -- --force                # re-render even batches already in the manifest
 *   npm run render:batch -- --tts=true             # override config.ttsEnabled for this run
 *   npm run render:batch -- --template=2           # 1 (default) | 2 | 3 - see src/compositions/ReelTemplate2.tsx/ReelTemplate3.tsx
 *   npm run render:batch -- --book=volume-2        # Book.id or a substring of Book.title - required once more than one book exists (see docs/ARCHITECTURE.md)
 *   npm run render:batch -- --sidechain=true        # duck music under dialogue/sfx via ffmpeg sidechaincompress (see render/sidechain.ts) -
 *                                                    # costs a second full render pass per batch; falls back to the normal single-pass mix
 *                                                    # with a console warning if ffmpeg isn't on PATH
 *   npm run render:batch -- --presetFile=path.json  # merge a JSON ReelConfig (partial) into defaultConfig as the baseline for this run,
 *                                                    # before the flags above are applied - this is how the GUI's template library
 *                                                    # (server/templates.ts) applies a saved preset (durations/volumes/theme/ttsRate/etc.)
 *                                                    # without needing a dedicated CLI flag per config field
 */
type Template = "1" | "2" | "3";

function parseArgs(argv: string[]) {
  const args: Record<string, string | boolean> = {};
  for (const arg of argv) {
    const match = arg.match(/^--([^=]+)(?:=(.*))?$/);
    if (match) args[match[1]] = match[2] ?? true;
  }
  const template: Template = args.template === "2" ? "2" : args.template === "3" ? "3" : "1";
  return {
    chapters: typeof args.chapters === "string" ? args.chapters : null,
    limit: typeof args.limit === "string" ? parseInt(args.limit, 10) : null,
    force: args.force === true,
    tts: args.tts === "true" ? true : args.tts === "false" ? false : null,
    template,
    book: typeof args.book === "string" ? args.book : null,
    sidechain: args.sidechain === "true",
    presetFile: typeof args.presetFile === "string" ? args.presetFile : null,
  };
}

/** Filesystem-safe tag from the --book value, used to prefix output filenames so two books' overlapping chapter/phrase numbers never collide. */
function sanitizeTag(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

const COMPOSITION_IDS: Record<Template, string> = { "1": "Reel", "2": "Reel-T2", "3": "Reel-T3" };
// Template 3 reverses direction (asks for the English meaning instead of
// the Sinhala one), so it needs the separate "WhatIsEnglishMeaning_*" intro
// voice set - see audio/voice.ts.
const INTRO_VOICE_KEYWORDS: Record<Template, "sinhala" | "english"> = { "1": "sinhala", "2": "sinhala", "3": "english" };

// English/Sinhala voice pairs, alternated per reel so the same two voices
// aren't used for every single video - female pairs with female, male with
// male, so each reel's phrase and reveal narration sound like one narrator.
const VOICE_PAIRS = [
  { en: "en-US-JennyNeural", si: "si-LK-ThiliniNeural" },
  { en: "en-US-GuyNeural", si: "si-LK-SameeraNeural" },
];

function paddedOrder(n: number): string {
  return String(n).padStart(3, "0");
}

// Template 1 keeps its original (unsuffixed) filenames/manifest keys so
// already-rendered production reels stay recognized as done - only 2/3 (new,
// nothing to preserve) get a suffix, so the three templates never collide
// when rendering the same phrase range.
function outputFilename(batch: ReelBatch, template: Template, bookTag: string | null): string {
  const first = batch.phrases[0].order;
  const last = batch.phrases[batch.phrases.length - 1].order;
  const suffix = template === "1" ? "" : `-t${template}`;
  const prefix = bookTag ? `${bookTag}-` : "";
  return `${prefix}ch${paddedOrder(batch.chapterOrder)}-${paddedOrder(first)}-${paddedOrder(last)}${suffix}.mp4`;
}

function manifestKey(batch: ReelBatch, template: Template): string {
  return template === "1" ? batch.id : `t${template}-${batch.id}`;
}

async function main() {
  const { chapters, limit, force, tts, template, book, sidechain, presetFile } = parseArgs(process.argv.slice(2));
  const compositionId = COMPOSITION_IDS[template];
  const introVoiceKeyword = INTRO_VOICE_KEYWORDS[template];
  const bookTag = book ? sanitizeTag(book) : null;

  // Checked once up front (not per-batch) so a missing ffmpeg doesn't fail
  // partway through a run - falls back to the normal single-pass render,
  // same as how a missing Azure key only breaks the TTS step, not the whole batch.
  let sidechainEnabled = sidechain;
  if (sidechainEnabled && !isFfmpegAvailable()) {
    console.warn("--sidechain=true was passed but ffmpeg isn't on PATH - falling back to the normal (non-ducked) music mix.");
    sidechainEnabled = false;
  }
  if (sidechainEnabled) {
    console.log("Sidechain ducking enabled - each batch gets a second render pass to duck music under dialogue/sfx via ffmpeg.");
  }

  const config: ReelConfig = { ...defaultConfig };
  // Applied before the flag overrides below so a preset (a saved GUI
  // template) sets the baseline, but --chapters/--tts/--book etc. on the
  // same command line still win for a one-off tweak.
  if (presetFile) {
    const preset = JSON.parse(readFileSync(presetFile, "utf-8")) as Partial<ReelConfig>;
    Object.assign(config, preset);
  }
  if (chapters) {
    const [min, max] = chapters.split("-").map(Number);
    config.chapterOrderRange = [min, max];
  }
  if (tts != null) config.ttsEnabled = tts;
  if (book) config.bookId = book;

  const phrases = await getPhrases(config.chapterOrderRange, config.bookId);
  const batches = batchPhrases(phrases, config.phrasesPerReel);
  if (batches.length === 0) {
    console.log("No phrases matched - check --chapters/--book and that the DB is seeded.");
    await disconnect();
    return;
  }

  const chapterTitles = [...new Set(batches.map((b) => `${b.chapterOrder}: ${b.chapterTitle}`))];
  console.log(`Chapters in scope:\n  ${chapterTitles.join("\n  ")}`);
  console.log(`${batches.length} total batch(es), phrasesPerReel=${config.phrasesPerReel}`);

  mkdirSync(config.outputDir, { recursive: true });
  const manifest = loadManifest(config.manifestPath);
  const tickFile = findTickFile(config.sfxDir);
  const revealSoundFile = findRevealSound(config.sfxDir);

  // Decide which batches this run will actually render *before* bundling -
  // bundle() below takes a one-time snapshot copy of assets/, so any TTS
  // audio generated after that point would silently 404 at render time.
  const toRender: { batch: ReelBatch; index: number }[] = [];
  let skipped = 0;
  for (let i = 0; i < batches.length; i++) {
    if (!force && isRendered(manifest, manifestKey(batches[i], template))) {
      skipped++;
      continue;
    }
    if (limit != null && toRender.length >= limit) break;
    toRender.push({ batch: batches[i], index: i });
  }
  console.log(`Selected ${toRender.length} batch(es) to render this run (${skipped} already in manifest).`);

  const audioPlan = new Map<
    string,
    { musicFile: string | null; musicStartFrame: number; introVoiceFile: string | null; ttsPhraseFiles: (string | null)[]; ttsRevealFiles: (string | null)[] }
  >();

  if (toRender.length > 0 && config.ttsEnabled) {
    console.log(`Synthesizing TTS audio for ${toRender.length} batch(es) (cached by content hash - reruns won't re-pay)...`);
  }
  for (const { batch, index } of toRender) {
    const voicePair = VOICE_PAIRS[index % VOICE_PAIRS.length];
    const ttsPhraseFiles: (string | null)[] = [];
    const ttsRevealFiles: (string | null)[] = [];
    if (config.ttsEnabled) {
      for (const phrase of batch.phrases) {
        ttsPhraseFiles.push(await synthesizeSpeech(phrase.phrase, voicePair.en, config.ttsDir, config.ttsRate));
        ttsRevealFiles.push(
          await synthesizeSpeech(phrase.translationSi ?? phrase.phrase, voicePair.si, config.ttsDir, config.ttsRate),
        );
      }
    } else {
      batch.phrases.forEach(() => {
        ttsPhraseFiles.push(null);
        ttsRevealFiles.push(null);
      });
    }
    audioPlan.set(batch.id, {
      musicFile: pickMusicTrack(config.musicDir, index),
      musicStartFrame: pickMusicStartFrame(index, config.fps),
      introVoiceFile: pickIntroVoice(config.voiceDir, index, introVoiceKeyword),
      ttsPhraseFiles,
      ttsRevealFiles,
    });
  }

  console.log("Bundling Remotion project...");
  // The programmatic bundle()/renderMedia() APIs, unlike the `remotion` CLI,
  // do NOT read remotion.config.ts automatically - publicDir must be passed
  // explicitly here or staticFile() URLs 404 (fonts fail to load, audio is
  // silently missing) since the bundler defaults to looking for a "public/"
  // folder instead of "assets/". This must run AFTER the TTS pre-pass above.
  const bundleLocation = await bundle({
    entryPoint: join(process.cwd(), "src/compositions/Root.tsx"),
    publicDir: join(process.cwd(), "assets"),
  });

  let rendered = 0;

  for (const { batch, index } of toRender) {
    const plan = audioPlan.get(batch.id)!;
    const outputPath = join(config.outputDir, outputFilename(batch, template, bookTag));
    // Only worth ducking if there's actually a music track playing - with no
    // musicFile, sidechain would just be a wasted second render pass.
    const duckThisBatch = sidechainEnabled && plan.musicFile != null;
    const renderTarget = duckThisBatch ? `${outputPath}.dialogue.mp4` : outputPath;

    const inputProps: ReelProps = {
      phrases: batch.phrases,
      config,
      // Music is left out of the Remotion mix entirely when ducking - the
      // real track gets layered back in afterward by applyMusicSidechain,
      // compressed against this render's dialogue/sfx audio as the trigger.
      musicFile: duckThisBatch ? null : plan.musicFile,
      musicStartFrame: plan.musicStartFrame,
      tickFile,
      revealSoundFile,
      introVoiceFile: plan.introVoiceFile,
      ttsPhraseFiles: plan.ttsPhraseFiles,
      ttsRevealFiles: plan.ttsRevealFiles,
    };

    console.log(`[${index + 1}/${batches.length}] Rendering ${outputPath} - "${batch.phrases[0].phrase}" ...`);

    const composition = await selectComposition({ serveUrl: bundleLocation, id: compositionId, inputProps });
    await renderMedia({
      serveUrl: bundleLocation,
      composition,
      inputProps,
      codec: "h264",
      outputLocation: renderTarget,
    });

    if (duckThisBatch) {
      console.log(`[${index + 1}/${batches.length}] Ducking music against dialogue/sfx via ffmpeg...`);
      applyMusicSidechain({
        dialogueVideoPath: renderTarget,
        musicDir: config.musicDir,
        musicFile: plan.musicFile!,
        musicStartFrame: plan.musicStartFrame,
        fps: config.fps,
        durationInFrames: composition.durationInFrames,
        outputPath,
      });
      unlinkSync(renderTarget);
    }

    const entry: ManifestEntry = {
      batchId: batch.id,
      template,
      chapterOrder: batch.chapterOrder,
      chapterTitle: batch.chapterTitle,
      phraseIds: batch.phrases.map((p) => p.id),
      musicFile: plan.musicFile,
      musicStartFrame: plan.musicStartFrame,
      tickFile,
      revealSoundFile,
      introVoiceFile: plan.introVoiceFile,
      ttsEnabled: config.ttsEnabled,
      ttsPhraseFiles: plan.ttsPhraseFiles,
      ttsRevealFiles: plan.ttsRevealFiles,
      sidechain: duckThisBatch,
      outputPath,
      renderedAt: new Date().toISOString(),
      suggestedCaption: buildCaption(batch, config.ctaUrl),
    };
    manifest[manifestKey(batch, template)] = entry;
    saveManifest(config.manifestPath, manifest);

    rendered++;
  }

  console.log(`Done. Rendered ${rendered}, skipped ${skipped} (already in manifest), ${batches.length} total.`);
  await disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await disconnect();
  process.exit(1);
});

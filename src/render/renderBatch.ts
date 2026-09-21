import { mkdirSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { getPhrases, getPhrasesByIds, disconnect } from "../data/getPhrases";
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
import type { ReelProps } from "../compositions/reelProps";
import type { ReelPropsWithRecipe } from "../compositions/recipe/CompositionFromRecipe";
import { compositionRecipeSchema, type CompositionRecipe } from "../compositions/recipe/schema";

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
 *   npm run render:batch -- --template=2           # 1 (default) | 2 | 3 - see src/compositions/recipe/recipes/template-2.json/template-3.json
 *   npm run render:batch -- --book=volume-2        # Book.id or a substring of Book.title - required once more than one book exists (see docs/ARCHITECTURE.md)
 *   npm run render:batch -- --sidechain=true        # duck music under dialogue/sfx via ffmpeg sidechaincompress (see render/sidechain.ts) -
 *                                                    # costs a second full render pass per batch; falls back to the normal single-pass mix
 *                                                    # with a console warning if ffmpeg isn't on PATH
 *   npm run render:batch -- --presetFile=path.json  # merge a JSON ReelConfig (partial) into defaultConfig as the baseline for this run,
 *                                                    # before the flags above are applied - this is how the GUI's template library
 *                                                    # (server/templates.ts) applies a saved preset (durations/volumes/theme/ttsRate/etc.)
 *                                                    # without needing a dedicated CLI flag per config field
 *   npm run render:batch -- --phraseIds=id1,id2,id3 # render (or re-render) exactly these phrases as one reel, in this order - ignores
 *                                                    # --chapters/--book/--limit entirely and always renders regardless of manifest state
 *                                                    # (no need for --force). This is how the GUI's Queue Render page (server/index.ts's
 *                                                    # /api/queue + /api/render/start) targets one specific reel instead of "whatever
 *                                                    # the chapter range's next unrendered batch happens to be" - see ARCHITECTURE.md.
 *   npm run render:batch -- --recipeFile=path.json  # render through a CUSTOM (non-built-in) CompositionRecipe instead of --template's
 *                                                    # 3 built-ins - the file is a full CompositionRecipe (src/compositions/recipe/schema.ts),
 *                                                    # e.g. one exported by the GUI's Recipe library (server/recipes.ts's writeRecipeFile).
 *                                                    # Takes precedence over --template; the recipe's own `id` becomes the manifest-key/
 *                                                    # output-filename "template" tag instead of "1"/"2"/"3".
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
    phraseIds: typeof args.phraseIds === "string" ? args.phraseIds.split(",").filter(Boolean) : null,
    recipeFile: typeof args.recipeFile === "string" ? args.recipeFile : null,
  };
}

/** Filesystem-safe tag from the --book value, used to prefix output filenames so two books' overlapping chapter/phrase numbers never collide. */
function sanitizeTag(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// Backed by the recipe renderer (src/compositions/recipe/) as of
// feature/composition-designer-schema - see docs/COMPOSITION_DESIGNER.md.
// The old hand-written Reel/ReelTemplate2/ReelTemplate3 these ids used to
// point at are preserved on the backup/legacy-composition-renderer branch.
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
// nothing to preserve) get a suffix, so the templates never collide when
// rendering the same phrase range. Takes a plain string (not just Template)
// so a custom recipe's own `id` works the same way - see --recipeFile.
function outputFilename(batch: ReelBatch, template: string, bookTag: string | null): string {
  const first = batch.phrases[0].order;
  const last = batch.phrases[batch.phrases.length - 1].order;
  const suffix = template === "1" ? "" : `-t${template}`;
  const prefix = bookTag ? `${bookTag}-` : "";
  return `${prefix}ch${paddedOrder(batch.chapterOrder)}-${paddedOrder(first)}-${paddedOrder(last)}${suffix}.mp4`;
}

function manifestKey(batch: ReelBatch, template: string): string {
  return template === "1" ? batch.id : `t${template}-${batch.id}`;
}

async function main() {
  const { chapters, limit, force, tts, template, book, sidechain, presetFile, phraseIds, recipeFile } = parseArgs(process.argv.slice(2));

  // --recipeFile (a custom, GUI-authored CompositionRecipe) takes over
  // composition/intro-voice/manifest-tag selection entirely; --template's 3
  // built-ins are otherwise completely unaffected - same static
  // Reel/Reel-T2/Reel-T3 compositions, same manifest keys/filenames as
  // always. See docs/COMPOSITION_DESIGNER.md.
  let customRecipe: CompositionRecipe | null = null;
  let compositionId: string = COMPOSITION_IDS[template];
  let introVoiceKeyword: "sinhala" | "english" = INTRO_VOICE_KEYWORDS[template];
  let effectiveTemplate: string = template;
  if (recipeFile) {
    customRecipe = compositionRecipeSchema.parse(JSON.parse(readFileSync(recipeFile, "utf-8")));
    compositionId = "Reel-Custom";
    introVoiceKeyword = customRecipe.intro.introVoiceKeyword;
    effectiveTemplate = customRecipe.id;
  }

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

  // --phraseIds bypasses the normal chapter-range scan entirely - it's an
  // explicit "render exactly this reel" request (new or a re-render after a
  // Queue Render correction), not "whatever the next unrendered batch is".
  let batches: ReelBatch[];
  if (phraseIds) {
    const phrases = await getPhrasesByIds(phraseIds);
    batches = [
      {
        id: phrases.map((p) => p.id).join("-"),
        chapterId: phrases[0].chapterId,
        chapterTitle: phrases[0].chapterTitle,
        chapterOrder: phrases[0].chapterOrder,
        phrases,
      },
    ];
  } else {
    const phrases = await getPhrases(config.chapterOrderRange, config.bookId);
    batches = batchPhrases(phrases, config.phrasesPerReel);
  }
  if (batches.length === 0) {
    console.log("No phrases matched - check --chapters/--book/--phraseIds and that the DB is seeded.");
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
  // --phraseIds implies force - an explicit single-target request should
  // always render, never silently skip because a manifest entry already
  // exists (that's exactly the "I corrected a typo, re-render this one"
  // case the Render Queue relies on).
  const effectiveForce = force || phraseIds != null;
  const toRender: { batch: ReelBatch; index: number; rotationSeed: number }[] = [];
  let skipped = 0;
  for (let i = 0; i < batches.length; i++) {
    if (!effectiveForce && isRendered(manifest, manifestKey(batches[i], effectiveTemplate))) {
      skipped++;
      continue;
    }
    if (limit != null && toRender.length >= limit) break;
    // Music/voice rotation is normally seeded by position within the full
    // chapter-scope batch list (stable across runs of the same scope). A
    // --phraseIds run only ever has one synthetic batch, so `i` would
    // always be 0 - use the first phrase's own DB order instead, so
    // repeated single-reel renders from the Render Queue still get some
    // variety instead of always picking the same track/voice pair.
    const rotationSeed = phraseIds ? batches[i].phrases[0].order : i;
    toRender.push({ batch: batches[i], index: i, rotationSeed });
  }
  console.log(`Selected ${toRender.length} batch(es) to render this run (${skipped} already in manifest).`);

  const audioPlan = new Map<
    string,
    { musicFile: string | null; musicStartFrame: number; introVoiceFile: string | null; ttsPhraseFiles: (string | null)[]; ttsRevealFiles: (string | null)[] }
  >();

  if (toRender.length > 0 && config.ttsEnabled) {
    console.log(`Synthesizing TTS audio for ${toRender.length} batch(es) (cached by content hash - reruns won't re-pay)...`);
  }
  for (const { batch, rotationSeed } of toRender) {
    const voicePair = VOICE_PAIRS[rotationSeed % VOICE_PAIRS.length];
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
      musicFile: pickMusicTrack(config.musicDir, rotationSeed),
      musicStartFrame: pickMusicStartFrame(rotationSeed, config.fps),
      introVoiceFile: pickIntroVoice(config.voiceDir, rotationSeed, introVoiceKeyword),
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
    const outputPath = join(config.outputDir, outputFilename(batch, effectiveTemplate, bookTag));
    // Only worth ducking if there's actually a music track playing - with no
    // musicFile, sidechain would just be a wasted second render pass.
    const duckThisBatch = sidechainEnabled && plan.musicFile != null;
    const renderTarget = duckThisBatch ? `${outputPath}.dialogue.mp4` : outputPath;

    const baseProps: ReelProps = {
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
    // The dynamic Reel-Custom composition needs `recipe` in inputProps
    // itself (that's what makes a recipe render-time data instead of
    // bundle-time fixed) - the 3 built-ins' static compositions don't take it.
    const inputProps: ReelProps | ReelPropsWithRecipe = customRecipe ? { ...baseProps, recipe: customRecipe } : baseProps;

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
      template: effectiveTemplate,
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
    manifest[manifestKey(batch, effectiveTemplate)] = entry;
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

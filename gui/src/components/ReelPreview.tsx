import { useEffect, useState } from "react";
import { Player } from "@remotion/player";
import { CompositionFromRecipeDynamic, type ReelPropsWithRecipe } from "../../../src/compositions/recipe/CompositionFromRecipe";
import { buildTimelineFromRecipe, totalDurationFromRecipe } from "../../../src/compositions/recipe/timeline";
import { registerFonts } from "../../../src/theme/fonts";
import type { Phrase } from "../../../src/data/phrase";
import type { CompositionRecipe, ReelConfig } from "../types";

// Two phrases are enough to see a full guess/reveal cycle plus the
// intro/outro without needing real DB data - this preview is about colors,
// not content, so hardcoded sample text (not src/compositions/sample-data.json,
// which is gitignored and only exists after running `npm run data:export-sample`
// against the DB) keeps the GUI usable right after a fresh `npm install`.
const SAMPLE_PHRASES: Phrase[] = [
  {
    id: "preview-1",
    phrase: "I couldn't agree more.",
    translationSi: "මමත් ඒකට සම්පූර්ණයෙන්ම එකඟයි.",
    pronunciationSi: "අයි කුඩ්න්ට් අග්‍රී මෝර්",
    explanation: "Used to show complete agreement with what someone just said.",
    explanationSi: "කවුරුහරි කිව්ව දෙයකට සම්පූර්ණයෙන්ම එකඟ බව පෙන්වන ක්‍රමයක්.",
    chapterId: "preview",
    chapterTitle: "Preview",
    chapterOrder: 0,
    order: 0,
  },
  {
    id: "preview-2",
    phrase: "Let's touch base tomorrow.",
    translationSi: "අපි හෙට කතා කරමු.",
    pronunciationSi: "ලෙට්ස් ටච් බේස් ටුමෝරෝ",
    explanation: "A casual way to suggest a short follow-up conversation later.",
    explanationSi: "පස්සේ පොඩි කතාබහක් කරමු කියලා කැෂුවල් විදිහට කියන ක්‍රමයක්.",
    chapterId: "preview",
    chapterTitle: "Preview",
    chapterOrder: 0,
    order: 1,
  },
];

let fontsReady: Promise<unknown> | null = null;

/**
 * Takes a full `recipe` object (not just a built-in id) so it can preview
 * an in-progress, unsaved edit (the Recipe Editor) just as well as a saved
 * built-in/custom one (the Template Editor). Uses CompositionFromRecipeDynamic
 * directly - a stable component reference that reads `recipe` from props -
 * so editing a recipe's fields updates the preview live without remounting
 * the Player (only `key={recipe.id}` forces a remount, for switching to a
 * genuinely different recipe/composition).
 *
 * `config` here doubles as both `src/config/config.ts`'s ReelConfig (what
 * the recipe-driven components actually expect) and this file's
 * structurally-identical local copy - not worrying about exact timing per
 * the brief, so this just reuses the real timeline math for a duration
 * that's close enough to scrub through intro/phrase/countdown/reveal/outro.
 */
export function ReelPreview({
  recipe,
  config,
  focusBeatIndex = null,
}: {
  recipe: CompositionRecipe;
  config: ReelConfig;
  /**
   * Index into `recipe.perPhraseBeats` to scope playback to (the first
   * phrase's occurrence of that beat) instead of the whole recipe - lets
   * RecipeEditor.tsx's "Preview this beat" button seek/loop just the beat
   * being edited, since scrubbing through intro/other beats/outro to find
   * it every time makes it hard to focus on the one thing changing.
   */
  focusBeatIndex?: number | null;
}) {
  const [fontsLoaded, setFontsLoaded] = useState(false);

  useEffect(() => {
    fontsReady ??= registerFonts();
    fontsReady.then(() => setFontsLoaded(true));
  }, []);

  if (!fontsLoaded) {
    return (
      <div className="preview-frame preview-loading">
        <span className="hint">Loading preview fonts...</span>
      </div>
    );
  }

  const timeline = buildTimelineFromRecipe(recipe, SAMPLE_PHRASES.length, config);
  const transitionFrames = Math.round(config.transitionSeconds * config.fps);
  const durationInFrames = Math.max(1, totalDurationFromRecipe(timeline, transitionFrames));

  let focusRange: { inFrame: number; outFrame: number } | null = null;
  if (focusBeatIndex != null) {
    // perPhraseBeats maps 1:1 onto timeline items per phrase (each beat kind
    // produces exactly one timeline item) - so the Nth non-intro/outro item
    // for phraseIndex 0 is the beat at perPhraseBeats[N].
    const phrase0Items = timeline.filter((item) => item.type !== "intro" && item.type !== "outro" && "phraseIndex" in item && item.phraseIndex === 0);
    const target = phrase0Items[focusBeatIndex];
    if (target) {
      const start = timeline.slice(0, timeline.indexOf(target)).reduce((sum, it) => sum + it.durationInFrames, 0);
      focusRange = { inFrame: start, outFrame: Math.min(durationInFrames - 1, start + target.durationInFrames - 1) };
    }
  }

  const inputProps: ReelPropsWithRecipe = {
    recipe,
    phrases: SAMPLE_PHRASES,
    config,
    musicFile: null,
    musicStartFrame: 0,
    tickFile: null,
    revealSoundFile: null,
    introVoiceFile: null,
    ttsPhraseFiles: SAMPLE_PHRASES.map(() => null),
    ttsRevealFiles: SAMPLE_PHRASES.map(() => null),
  };

  return (
    <Player
      key={`${recipe.id}-${focusBeatIndex ?? "full"}`}
      component={CompositionFromRecipeDynamic}
      inputProps={inputProps}
      durationInFrames={durationInFrames}
      fps={config.fps}
      compositionWidth={config.width}
      compositionHeight={config.height}
      style={{ width: "100%" }}
      className="preview-frame"
      controls
      loop
      inFrame={focusRange?.inFrame ?? null}
      outFrame={focusRange?.outFrame ?? null}
      initialFrame={focusRange?.inFrame ?? 0}
      clickToPlay
      doubleClickToFullscreen={false}
    />
  );
}

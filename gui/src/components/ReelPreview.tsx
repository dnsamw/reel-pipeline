import { useEffect, useState } from "react";
import { Player } from "@remotion/player";
import { makeCompositionFromRecipe } from "../../../src/compositions/recipe/CompositionFromRecipe";
import { builtInRecipes } from "../../../src/compositions/recipe/recipes";
import { buildTimelineFromRecipe, totalDurationFromRecipe } from "../../../src/compositions/recipe/timeline";
import { registerFonts } from "../../../src/theme/fonts";
import type { Phrase } from "../../../src/data/phrase";
import type { ReelConfig } from "../types";

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

// Stable component references, computed once at module load (not per-render)
// so the Player doesn't see a "new" component type on every unrelated
// config change and reset playback - see makeCompositionFromRecipe's own
// note on why it's a factory rather than a fixed export.
const COMPONENTS = {
  "1": makeCompositionFromRecipe(builtInRecipes["1"]).component,
  "2": makeCompositionFromRecipe(builtInRecipes["2"]).component,
  "3": makeCompositionFromRecipe(builtInRecipes["3"]).component,
} as const;

let fontsReady: Promise<unknown> | null = null;

/** ReelConfig here is gui/src/types.ts's decoupled copy, structurally identical to src/config/config.ts's - see that file's own comment on why it's duplicated rather than imported. */
export function ReelPreview({ templateNumber, config }: { templateNumber: "1" | "2" | "3"; config: ReelConfig }) {
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

  const Component = COMPONENTS[templateNumber];
  // Config here doubles as both `src/config/config.ts`'s ReelConfig (what
  // the recipe-driven components actually expect) and this file's
  // structurally-identical local copy - not worrying about exact timing per
  // the brief, so this just reuses the real timeline math for a duration
  // that's close enough to scrub through intro/phrase/countdown/reveal/outro.
  const timeline = buildTimelineFromRecipe(builtInRecipes[templateNumber], SAMPLE_PHRASES.length, config);
  const transitionFrames = Math.round(config.transitionSeconds * config.fps);
  const durationInFrames = Math.max(1, totalDurationFromRecipe(timeline, transitionFrames));

  const inputProps = {
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
      key={templateNumber}
      component={Component}
      inputProps={inputProps}
      durationInFrames={durationInFrames}
      fps={config.fps}
      compositionWidth={config.width}
      compositionHeight={config.height}
      style={{ width: "100%" }}
      className="preview-frame"
      controls
      loop
      clickToPlay
      doubleClickToFullscreen={false}
    />
  );
}

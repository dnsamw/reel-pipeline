import { Fragment, type ReactNode } from "react";
import { Html5Audio, staticFile, type CalculateMetadataFunction } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { IntroScene } from "../scenes/IntroScene";
import { PhraseScene } from "../scenes/PhraseScene";
import { CountdownScene } from "../scenes/CountdownScene";
import { RevealScene } from "../scenes/RevealScene";
import { OutroScene } from "../scenes/OutroScene";
import { GuessRevealSceneT2 } from "../scenes/GuessRevealSceneT2";
import { GuessRevealSceneT3 } from "../scenes/GuessRevealSceneT3";
import { ThemeProvider } from "../../theme/ThemeContext";
import type { ReelConfig } from "../../config/config";
import { reelPropsSchema, reelDefaultProps, type ReelProps } from "../Reel";
import { buildTimelineFromRecipe, totalDurationFromRecipe } from "./timeline";
import type { CompositionRecipe } from "./schema";

function resolveIntroText(recipe: CompositionRecipe, config: ReelConfig): string {
  return recipe.intro.text.source === "literal" ? recipe.intro.text.value : config.introText;
}

/**
 * Maps a guessReveal beat's abstract `prompt`/`answer: "phrase"|"translationSi"`
 * onto the concrete TTS file array + volume config field that field actually
 * corresponds to - this part IS fully generic today (both built-in recipes'
 * prompt/answer choices round-trip correctly through it). What's NOT generic
 * yet is the secondary content (pronunciation line, which side gets the
 * explanation card) baked into GuessRevealSceneT2/T3's own JSX - see
 * `pickGuessRevealComponent` below and docs/COMPOSITION_DESIGNER.md.
 */
function ttsFor(field: "phrase" | "translationSi", ttsPhraseFiles: (string | null)[], ttsRevealFiles: (string | null)[], config: ReelConfig, phraseIndex: number) {
  return field === "phrase"
    ? { file: ttsPhraseFiles[phraseIndex] ?? null, volume: config.phraseVoiceVolume }
    : { file: ttsRevealFiles[phraseIndex] ?? null, volume: config.revealVoiceVolume };
}

/**
 * Picks which of the two existing hand-written guessReveal components to
 * mount for a given theme. This is the one honest gap in "recipes are fully
 * data-driven": GuessRevealSceneT2/T3 don't yet accept `promptField`/
 * `answerField` as props (their secondary content - pronunciation line,
 * which side shows the explanation card - is hardcoded per file), so a
 * recipe combo that doesn't match either component's existing shape (e.g.
 * dark theme with an English prompt) isn't actually renderable yet. Both
 * built-in recipes (template-2.json, template-3.json) only ever request the
 * combo their matching component already implements, so this holds for them.
 */
function pickGuessRevealComponent(theme: "light" | "dark") {
  return theme === "dark" ? GuessRevealSceneT3 : GuessRevealSceneT2;
}

export const calculateMetadataForRecipe =
  (recipe: CompositionRecipe): CalculateMetadataFunction<ReelProps> =>
  ({ props }) => {
    const timeline = buildTimelineFromRecipe(recipe, props.phrases.length, props.config);
    const transitionFrames = Math.round(props.config.transitionSeconds * props.config.fps);
    return {
      durationInFrames: totalDurationFromRecipe(timeline, transitionFrames),
      fps: props.config.fps,
      width: props.config.width,
      height: props.config.height,
    };
  };

/**
 * Interprets a CompositionRecipe at render time - one component instead of
 * a hand-written Reel*.tsx per composition. Dispatches each timeline beat to
 * the SAME scene components Reel.tsx/ReelTemplate2.tsx/ReelTemplate3.tsx
 * already use; nothing about those scene components changes.
 */
export function makeCompositionFromRecipe(recipe: CompositionRecipe) {
  function CompositionFromRecipe({
    phrases,
    config,
    musicFile,
    musicStartFrame,
    tickFile,
    revealSoundFile,
    introVoiceFile,
    ttsPhraseFiles,
    ttsRevealFiles,
  }: ReelProps) {
    const timeline = buildTimelineFromRecipe(recipe, phrases.length, config);
    const transitionFrames = Math.round(config.transitionSeconds * config.fps);
    // Same rule as every hand-written template: only the cut into the outro
    // crossfades - matches recipe.transition, which is closed to that one
    // junction point today (see schema.ts).
    const lastPerPhraseIndex = timeline.map((item) => item.type !== "intro" && item.type !== "outro").lastIndexOf(true);

    return (
      <ThemeProvider theme={config.theme}>
        {musicFile && (
          <Html5Audio src={staticFile(`music/${musicFile}`)} loop trimBefore={musicStartFrame} volume={config.musicVolume} />
        )}
        <TransitionSeries>
          {timeline.map((item, i) => {
            let content: ReactNode;
            if (item.type === "intro") {
              content = (
                <IntroScene
                  text={resolveIntroText(recipe, config)}
                  voiceFile={introVoiceFile}
                  voiceVolume={config.introVoiceVolume}
                  theme={recipe.intro.theme}
                />
              );
            } else if (item.type === "phrase") {
              content = (
                <PhraseScene
                  phrase={phrases[item.phraseIndex]}
                  index={item.phraseIndex}
                  total={phrases.length}
                  ttsFile={ttsPhraseFiles[item.phraseIndex] ?? null}
                  ttsVolume={config.phraseVoiceVolume}
                />
              );
            } else if (item.type === "countdown") {
              content = (
                <CountdownScene
                  durationInFrames={item.durationInFrames}
                  index={item.phraseIndex}
                  total={phrases.length}
                  tickFile={tickFile}
                  tickVolume={config.tickVolume}
                />
              );
            } else if (item.type === "reveal") {
              content = (
                <RevealScene
                  phrase={phrases[item.phraseIndex]}
                  index={item.phraseIndex}
                  total={phrases.length}
                  revealSoundFile={revealSoundFile}
                  revealSoundVolume={config.revealSoundVolume}
                  ttsFile={ttsRevealFiles[item.phraseIndex] ?? null}
                  ttsVolume={config.revealVoiceVolume}
                />
              );
            } else if (item.type === "guessReveal") {
              const GuessReveal = pickGuessRevealComponent(item.theme);
              const promptTts = ttsFor(item.prompt, ttsPhraseFiles, ttsRevealFiles, config, item.phraseIndex);
              const answerTts = ttsFor(item.answer, ttsPhraseFiles, ttsRevealFiles, config, item.phraseIndex);
              content = (
                <GuessReveal
                  phrase={phrases[item.phraseIndex]}
                  index={item.phraseIndex}
                  total={phrases.length}
                  promptFrames={item.promptFrames}
                  countdownFrames={item.countdownFrames}
                  tickFile={tickFile}
                  tickVolume={config.tickVolume}
                  revealSoundFile={revealSoundFile}
                  revealSoundVolume={config.revealSoundVolume}
                  promptTtsFile={promptTts.file}
                  promptTtsVolume={promptTts.volume}
                  answerTtsFile={answerTts.file}
                  answerTtsVolume={answerTts.volume}
                />
              );
            } else {
              content = <OutroScene ctaUrl={config.ctaUrl} theme={recipe.outro.theme} />;
            }

            return (
              <Fragment key={i}>
                <TransitionSeries.Sequence durationInFrames={item.durationInFrames}>{content}</TransitionSeries.Sequence>
                {i === lastPerPhraseIndex && (
                  <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: transitionFrames })} />
                )}
              </Fragment>
            );
          })}
        </TransitionSeries>
      </ThemeProvider>
    );
  }

  return {
    component: CompositionFromRecipe,
    calculateMetadata: calculateMetadataForRecipe(recipe),
    propsSchema: reelPropsSchema,
    defaultProps: reelDefaultProps,
  };
}

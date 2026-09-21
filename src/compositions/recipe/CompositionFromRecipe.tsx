import { Fragment, type ReactNode } from "react";
import { Html5Audio, staticFile, type CalculateMetadataFunction } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { IntroScene } from "../scenes/IntroScene";
import { PhraseScene } from "../scenes/PhraseScene";
import { CountdownScene } from "../scenes/CountdownScene";
import { RevealScene } from "../scenes/RevealScene";
import { OutroScene } from "../scenes/OutroScene";
import { GuessRevealScene } from "../scenes/GuessRevealScene";
import { ThemeProvider } from "../../theme/ThemeContext";
import type { ReelConfig } from "../../config/config";
import { reelPropsSchema, reelDefaultProps, type ReelProps } from "../reelProps";
import { buildTimelineFromRecipe, totalDurationFromRecipe } from "./timeline";
import type { CompositionRecipe } from "./schema";

function resolveIntroText(recipe: CompositionRecipe, config: ReelConfig): string {
  return recipe.intro.text.source === "literal" ? recipe.intro.text.value : config.introText;
}

/**
 * Maps a guessReveal beat's abstract `prompt`/`answer: "phrase"|"translationSi"`
 * onto the concrete TTS file array + volume config field that field actually
 * corresponds to.
 */
function ttsFor(field: "phrase" | "translationSi", ttsPhraseFiles: (string | null)[], ttsRevealFiles: (string | null)[], config: ReelConfig, phraseIndex: number) {
  return field === "phrase"
    ? { file: ttsPhraseFiles[phraseIndex] ?? null, volume: config.phraseVoiceVolume }
    : { file: ttsRevealFiles[phraseIndex] ?? null, volume: config.revealVoiceVolume };
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
 * a hand-written Reel*.tsx per composition (the old per-template files this
 * replaced are preserved on the backup/legacy-composition-renderer branch).
 * Dispatches each timeline beat to the scene component that kind already
 * has - see src/compositions/scenes/.
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
              const promptTts = ttsFor(item.prompt, ttsPhraseFiles, ttsRevealFiles, config, item.phraseIndex);
              const answerTts = ttsFor(item.answer, ttsPhraseFiles, ttsRevealFiles, config, item.phraseIndex);
              content = (
                <GuessRevealScene
                  phrase={phrases[item.phraseIndex]}
                  index={item.phraseIndex}
                  total={phrases.length}
                  promptFrames={item.promptFrames}
                  countdownFrames={item.countdownFrames}
                  theme={item.theme}
                  promptField={item.prompt}
                  answerField={item.answer}
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

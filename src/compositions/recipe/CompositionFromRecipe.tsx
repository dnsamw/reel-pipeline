import { Fragment, type ReactNode } from "react";
import { z } from "zod";
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
import { compositionRecipeSchema, type CompositionRecipe } from "./schema";

/**
 * Props schema for the ONE dynamic composition ("Reel-Custom" in Root.tsx)
 * that renders an arbitrary CompositionRecipe passed at render time, not
 * baked in at bundle time - what makes a custom (non-built-in) recipe
 * actually renderable. The 3 built-ins still also get their own static
 * <Composition> (via makeCompositionFromRecipe below, unchanged) purely for
 * backward compatibility with existing manifest/output-filename behavior;
 * both paths render identically, see docs/COMPOSITION_DESIGNER.md.
 */
export const reelPropsWithRecipeSchema = reelPropsSchema.extend({ recipe: compositionRecipeSchema });
export type ReelPropsWithRecipe = z.infer<typeof reelPropsWithRecipeSchema>;

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

export const calculateMetadataForRecipeDynamic: CalculateMetadataFunction<ReelPropsWithRecipe> = ({ props }) => {
  const timeline = buildTimelineFromRecipe(props.recipe, props.phrases.length, props.config);
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
 * has - see src/compositions/scenes/. Takes `recipe` as a genuine prop
 * (not a closure) so it works for both a bundle-time-fixed built-in
 * (via makeCompositionFromRecipe below) and a render-time-chosen custom one.
 */
export function CompositionFromRecipeDynamic({
  recipe,
  phrases,
  config,
  musicFile,
  musicStartFrame,
  tickFile,
  revealSoundFile,
  introVoiceFile,
  ttsPhraseFiles,
  ttsRevealFiles,
}: ReelPropsWithRecipe) {
  const timeline = buildTimelineFromRecipe(recipe, phrases.length, config);
  const transitionFrames = Math.round(config.transitionSeconds * config.fps);
  // Same rule as every hand-written template used to: only the cut into the
  // outro crossfades - matches recipe.transition, which is closed to that
  // one junction point today (see schema.ts).
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

/**
 * Binds a fixed recipe at bundle time - used for the 3 built-in
 * compositions (Root.tsx registers each under its original "Reel"/
 * "Reel-T2"/"Reel-T3" id, ReelPreview.tsx uses it for the built-in live
 * preview). Renders identically to CompositionFromRecipeDynamic with the
 * same recipe passed as a prop - verified byte-identical, see
 * docs/COMPOSITION_DESIGNER.md.
 */
export function makeCompositionFromRecipe(recipe: CompositionRecipe) {
  function BoundCompositionFromRecipe(props: ReelProps) {
    return <CompositionFromRecipeDynamic recipe={recipe} {...props} />;
  }

  return {
    component: BoundCompositionFromRecipe,
    calculateMetadata: calculateMetadataForRecipe(recipe),
    propsSchema: reelPropsSchema,
    defaultProps: reelDefaultProps,
  };
}

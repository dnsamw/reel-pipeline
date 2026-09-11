import { Fragment, type ReactNode } from "react";
import { Html5Audio, staticFile, type CalculateMetadataFunction } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { IntroScene } from "./scenes/IntroScene";
import { GuessRevealSceneT2 } from "./scenes/GuessRevealSceneT2";
import { OutroScene } from "./scenes/OutroScene";
import { buildTimelineT2, totalDuration } from "./timings";
import { type ReelProps, reelPropsSchema, reelDefaultProps } from "./Reel";

// Template 2 reuses the exact same props shape as Template 1 (see Reel.tsx)
// - the DB/TTS data prep doesn't change per template, only which text is
// shown as prompt vs answer and how scenes are laid out.
export const reelTemplate2PropsSchema = reelPropsSchema;
export const reelTemplate2DefaultProps: ReelProps = reelDefaultProps;

export const calculateReelTemplate2Metadata: CalculateMetadataFunction<ReelProps> = ({ props }) => {
  const timeline = buildTimelineT2(props.phrases.length, props.config);
  const transitionFrames = Math.round(props.config.transitionSeconds * props.config.fps);
  return {
    durationInFrames: totalDuration(timeline, transitionFrames),
    fps: props.config.fps,
    width: props.config.width,
    height: props.config.height,
  };
};

export function ReelTemplate2({
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
  const timeline = buildTimelineT2(phrases.length, config);
  const transitionFrames = Math.round(config.transitionSeconds * config.fps);
  const lastGuessRevealIndex = timeline.map((item) => item.type).lastIndexOf("guessReveal");

  return (
    <>
      {musicFile && (
        <Html5Audio src={staticFile(`music/${musicFile}`)} loop trimBefore={musicStartFrame} volume={config.musicVolume} />
      )}
      <TransitionSeries>
        {timeline.map((item, i) => {
          let content: ReactNode;
          if (item.type === "intro") {
            content = <IntroScene text={config.introText} voiceFile={introVoiceFile} voiceVolume={config.introVoiceVolume} />;
          } else if (item.type === "guessReveal") {
            content = (
              <GuessRevealSceneT2
                phrase={phrases[item.phraseIndex]}
                index={item.phraseIndex}
                total={phrases.length}
                promptFrames={item.promptFrames}
                countdownFrames={item.countdownFrames}
                tickFile={tickFile}
                tickVolume={config.tickVolume}
                revealSoundFile={revealSoundFile}
                revealSoundVolume={config.revealSoundVolume}
                promptTtsFile={ttsPhraseFiles[item.phraseIndex] ?? null}
                promptTtsVolume={config.phraseVoiceVolume}
                answerTtsFile={ttsRevealFiles[item.phraseIndex] ?? null}
                answerTtsVolume={config.revealVoiceVolume}
              />
            );
          } else {
            content = <OutroScene ctaUrl={config.ctaUrl} theme="dark" />;
          }

          return (
            <Fragment key={i}>
              <TransitionSeries.Sequence durationInFrames={item.durationInFrames}>{content}</TransitionSeries.Sequence>
              {i === lastGuessRevealIndex && (
                <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: transitionFrames })} />
              )}
            </Fragment>
          );
        })}
      </TransitionSeries>
    </>
  );
}

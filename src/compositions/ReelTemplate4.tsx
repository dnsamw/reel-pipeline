import { Fragment, type ReactNode } from "react";
import { Html5Audio, staticFile, type CalculateMetadataFunction } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { IntroScene } from "./scenes/IntroScene";
import { GuessRevealSceneT3 } from "./scenes/GuessRevealSceneT3";
import { OutroScene } from "./scenes/OutroScene";
import { Watermark } from "./scenes/Watermark";
import { buildTimelineT2, totalDuration } from "./timings";
import { type ReelProps, reelPropsSchema, reelDefaultProps } from "./Reel";

// Template 4 is a clone of Template 3 (same on-screen intro caption, paired
// with the WhatIsEnglishMeaning_Female/Male.mp3 voice-over in assets/voice/)
// kept as its own file so it can diverge from Template 3 later without
// touching that template.
export const T4_INTRO_TEXT = "මේක ඉංග්‍රීසියෙන් කියන්නෙ කොහොමද?";

export const reelTemplate4PropsSchema = reelPropsSchema;
export const reelTemplate4DefaultProps: ReelProps = reelDefaultProps;

// Matches Template 3's extra reveal hold time - see ReelTemplate3.tsx.
const T4_EXTRA_REVEAL_SECONDS = 4;

function withExtraRevealTime(config: ReelProps["config"]): ReelProps["config"] {
  return { ...config, revealSeconds: config.revealSeconds + T4_EXTRA_REVEAL_SECONDS };
}

export const calculateReelTemplate4Metadata: CalculateMetadataFunction<ReelProps> = ({ props }) => {
  const timeline = buildTimelineT2(props.phrases.length, withExtraRevealTime(props.config));
  const transitionFrames = Math.round(props.config.transitionSeconds * props.config.fps);
  return {
    durationInFrames: totalDuration(timeline, transitionFrames),
    fps: props.config.fps,
    width: props.config.width,
    height: props.config.height,
  };
};

export function ReelTemplate4({
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
  const timeline = buildTimelineT2(phrases.length, withExtraRevealTime(config));
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
            content = (
              <IntroScene text={T4_INTRO_TEXT} voiceFile={introVoiceFile} voiceVolume={config.introVoiceVolume} theme="dark" />
            );
          } else if (item.type === "guessReveal") {
            content = (
              <GuessRevealSceneT3
                phrase={phrases[item.phraseIndex]}
                index={item.phraseIndex}
                total={phrases.length}
                promptFrames={item.promptFrames}
                countdownFrames={item.countdownFrames}
                tickFile={tickFile}
                tickVolume={config.tickVolume}
                revealSoundFile={revealSoundFile}
                revealSoundVolume={config.revealSoundVolume}
                promptTtsFile={ttsRevealFiles[item.phraseIndex] ?? null}
                promptTtsVolume={config.revealVoiceVolume}
                answerTtsFile={ttsPhraseFiles[item.phraseIndex] ?? null}
                answerTtsVolume={config.phraseVoiceVolume}
              />
            );
          } else {
            content = <OutroScene ctaUrl={config.ctaUrl} theme="light" />;
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
      <Watermark />
    </>
  );
}

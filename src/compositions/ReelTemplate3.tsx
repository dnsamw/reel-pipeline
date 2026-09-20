import { Fragment, type ReactNode } from "react";
import { Html5Audio, staticFile, type CalculateMetadataFunction } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { IntroScene } from "./scenes/IntroScene";
import { GuessRevealSceneT3 } from "./scenes/GuessRevealSceneT3";
import { OutroScene } from "./scenes/OutroScene";
import { buildTimelineT2, totalDuration } from "./timings";
import { type ReelProps, reelPropsSchema, reelDefaultProps } from "./Reel";
import { ThemeProvider } from "../theme/ThemeContext";

// Template 3's on-screen intro caption, paired with the
// WhatIsEnglishMeaning_Female/Male.mp3 voice-over in assets/voice/.
export const T3_INTRO_TEXT = "මේක ඉංග්‍රීසියෙන් කියන්නෙ කොහොමද?";

export const reelTemplate3PropsSchema = reelPropsSchema;
export const reelTemplate3DefaultProps: ReelProps = reelDefaultProps;

export const calculateReelTemplate3Metadata: CalculateMetadataFunction<ReelProps> = ({ props }) => {
  const timeline = buildTimelineT2(props.phrases.length, props.config);
  const transitionFrames = Math.round(props.config.transitionSeconds * props.config.fps);
  return {
    durationInFrames: totalDuration(timeline, transitionFrames),
    fps: props.config.fps,
    width: props.config.width,
    height: props.config.height,
  };
};

export function ReelTemplate3({
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
    <ThemeProvider theme={config.theme}>
      {musicFile && (
        <Html5Audio src={staticFile(`music/${musicFile}`)} loop trimBefore={musicStartFrame} volume={config.musicVolume} />
      )}
      <TransitionSeries>
        {timeline.map((item, i) => {
          let content: ReactNode;
          if (item.type === "intro") {
            content = (
              <IntroScene text={T3_INTRO_TEXT} voiceFile={introVoiceFile} voiceVolume={config.introVoiceVolume} theme="dark" />
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
    </ThemeProvider>
  );
}

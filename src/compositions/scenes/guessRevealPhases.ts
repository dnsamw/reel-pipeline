import { interpolate } from "remotion";

/**
 * Pure frame-math shared by GuessRevealSceneT2/T3 - both templates need the
 * exact same "prompt pins up + countdown fades in, then countdown fades out
 * + answer fades in" choreography, just with different content/theme, so
 * this is factored out rather than duplicated.
 */
export interface GuessRevealPhaseInput {
  frame: number;
  fps: number;
  /** How long the prompt shows alone before the countdown starts. */
  promptFrames: number;
  /** How long the countdown ring runs. */
  countdownFrames: number;
}

export interface GuessRevealPhaseOutput {
  /** Prompt block's extra translateY (px) on top of its own centering - 0 during phase A, animates to a fixed pinned offset. */
  promptTranslateY: number;
  promptScale: number;
  /** Countdown ring's opacity - fades in as the prompt pins up, fades out again before the answer. */
  ringOpacity: number;
  /** 0-1 fill progress of the countdown ring within the countdown phase. */
  ringProgress: number;
  countdownNumber: number;
  answerOpacity: number;
}

const PIN_TRANSITION_FRAMES = 12;
const ANSWER_TRANSITION_FRAMES = 10;
const PROMPT_PIN_TRANSLATE_Y = -420;
const PROMPT_PIN_SCALE = 0.72;

export function computeGuessRevealPhases({
  frame,
  fps,
  promptFrames,
  countdownFrames,
}: GuessRevealPhaseInput): GuessRevealPhaseOutput {
  const countdownStart = promptFrames;
  const countdownEnd = promptFrames + countdownFrames;

  const pinProgress = interpolate(frame, [countdownStart, countdownStart + PIN_TRANSITION_FRAMES], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const promptTranslateY = interpolate(pinProgress, [0, 1], [0, PROMPT_PIN_TRANSLATE_Y]);
  const promptScale = interpolate(pinProgress, [0, 1], [1, PROMPT_PIN_SCALE]);

  const ringOpacity = interpolate(
    frame,
    [countdownStart, countdownStart + PIN_TRANSITION_FRAMES, countdownEnd, countdownEnd + ANSWER_TRANSITION_FRAMES],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  const countdownRelativeFrame = Math.min(Math.max(frame - countdownStart, 0), countdownFrames);
  const ringProgress = countdownFrames > 0 ? countdownRelativeFrame / countdownFrames : 1;
  const steps = Math.max(1, Math.round(countdownFrames / fps));
  const segment = countdownFrames / steps;
  const countdownNumber = steps - Math.min(steps - 1, Math.floor(countdownRelativeFrame / segment));

  const answerOpacity = interpolate(frame, [countdownEnd, countdownEnd + ANSWER_TRANSITION_FRAMES], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return { promptTranslateY, promptScale, ringOpacity, ringProgress, countdownNumber, answerOpacity };
}

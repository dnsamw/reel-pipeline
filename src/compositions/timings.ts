import type { ReelConfig } from "../config/config";

export type TimelineItem =
  | { type: "intro"; durationInFrames: number }
  | { type: "phrase"; phraseIndex: number; durationInFrames: number }
  | { type: "countdown"; phraseIndex: number; durationInFrames: number }
  | { type: "reveal"; phraseIndex: number; durationInFrames: number }
  | { type: "outro"; durationInFrames: number };

/**
 * Single source of truth for scene durations - both Reel's calculateMetadata
 * (which needs the total up front) and the TransitionSeries that actually
 * lays out the scenes read from this, so they can never drift out of sync.
 */
export function buildTimeline(batchSize: number, config: ReelConfig): TimelineItem[] {
  const items: TimelineItem[] = [];
  items.push({ type: "intro", durationInFrames: Math.round(config.introSeconds * config.fps) });
  for (let i = 0; i < batchSize; i++) {
    items.push({ type: "phrase", phraseIndex: i, durationInFrames: Math.round(config.phraseSeconds * config.fps) });
    items.push({ type: "countdown", phraseIndex: i, durationInFrames: Math.round(config.countdownSeconds * config.fps) });
    items.push({ type: "reveal", phraseIndex: i, durationInFrames: Math.round(config.revealSeconds * config.fps) });
  }
  items.push({ type: "outro", durationInFrames: Math.round(config.outroSeconds * config.fps) });
  return items;
}

/**
 * Actual rendered length: a TransitionSeries crossfade doesn't add extra
 * time, it eats `transitionFrames` out of the total by overlapping the tail
 * of one scene with the head of the next - pass the same value used for the
 * reveal-to-outro <TransitionSeries.Transition> here so calculateMetadata
 * reports the true duration. Generic so it works for both buildTimeline and
 * buildTimelineT2's item shapes.
 */
export function totalDuration(items: { durationInFrames: number }[], transitionFrames = 0): number {
  return items.reduce((sum, item) => sum + item.durationInFrames, 0) - transitionFrames;
}

export type TimelineItemT2 =
  | { type: "intro"; durationInFrames: number }
  | {
      type: "guessReveal";
      phraseIndex: number;
      durationInFrames: number;
      promptFrames: number;
      countdownFrames: number;
    }
  | { type: "outro"; durationInFrames: number };

/**
 * Templates 2/3's timeline: unlike buildTimeline, the phrase/countdown/
 * reveal collapse into a single continuously-mounted "guessReveal" item per
 * phrase (see GuessRevealSceneT2/T3) - promptFrames/countdownFrames are
 * passed through so the scene component can compute its own internal phase
 * boundaries.
 */
export function buildTimelineT2(batchSize: number, config: ReelConfig): TimelineItemT2[] {
  const items: TimelineItemT2[] = [];
  items.push({ type: "intro", durationInFrames: Math.round(config.introSeconds * config.fps) });

  const promptFrames = Math.round(config.phraseSeconds * config.fps);
  const countdownFrames = Math.round(config.countdownSeconds * config.fps);
  const revealFrames = Math.round(config.revealSeconds * config.fps);

  for (let i = 0; i < batchSize; i++) {
    items.push({
      type: "guessReveal",
      phraseIndex: i,
      durationInFrames: promptFrames + countdownFrames + revealFrames,
      promptFrames,
      countdownFrames,
    });
  }
  items.push({ type: "outro", durationInFrames: Math.round(config.outroSeconds * config.fps) });
  return items;
}

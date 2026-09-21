import type { ReelConfig } from "../../config/config";
import type { CompositionRecipe, Beat } from "./schema";
import type { CustomBeat } from "./layers/schema";

export type RecipeTimelineItem =
  | { type: "intro"; durationInFrames: number }
  | { type: "phrase"; phraseIndex: number; durationInFrames: number }
  | { type: "countdown"; phraseIndex: number; durationInFrames: number }
  | { type: "reveal"; phraseIndex: number; durationInFrames: number }
  | {
      type: "guessReveal";
      phraseIndex: number;
      durationInFrames: number;
      promptFrames: number;
      countdownFrames: number;
      theme: "light" | "dark";
      prompt: "phrase" | "translationSi";
      answer: "phrase" | "translationSi";
    }
  | { type: "custom"; phraseIndex: number; durationInFrames: number; beat: CustomBeat }
  | { type: "outro"; durationInFrames: number };

function beatDurationFrames(beat: Beat, config: ReelConfig): number {
  const frames = (seconds: number) => Math.round(seconds * config.fps);
  switch (beat.kind) {
    case "phrase":
      return frames(config.phraseSeconds);
    case "countdown":
      return frames(config.countdownSeconds);
    case "reveal":
      return frames(config.revealSeconds);
    case "guessReveal":
      return frames(config.phraseSeconds) + frames(config.countdownSeconds) + frames(config.revealSeconds);
    case "custom":
      // Data-driven, not config-derived - the one beat kind whose duration is authored directly on the beat itself.
      return beat.durationInFrames;
    default:
      // intro/outro durations are handled directly in buildTimelineFromRecipe (config.introSeconds/outroSeconds) -
      // this branch only exists so TS flags it if a new per-phrase beat kind is ever added without updating this function.
      throw new Error(`beatDurationFrames: unexpected per-phrase beat kind "${beat.kind}"`);
  }
}

/**
 * Recipe-driven equivalent of timings.ts's buildTimeline/buildTimelineT2 -
 * same "single source of truth for both calculateMetadata and the actual
 * render" role, just reading the beat sequence from a CompositionRecipe
 * instead of it being implicit in which function you called.
 */
export function buildTimelineFromRecipe(recipe: CompositionRecipe, batchSize: number, config: ReelConfig): RecipeTimelineItem[] {
  const items: RecipeTimelineItem[] = [];
  items.push({ type: "intro", durationInFrames: Math.round(config.introSeconds * config.fps) });

  for (let phraseIndex = 0; phraseIndex < batchSize; phraseIndex++) {
    for (const beat of recipe.perPhraseBeats) {
      const durationInFrames = beatDurationFrames(beat, config);
      if (beat.kind === "guessReveal") {
        items.push({
          type: "guessReveal",
          phraseIndex,
          durationInFrames,
          promptFrames: Math.round(config.phraseSeconds * config.fps),
          countdownFrames: Math.round(config.countdownSeconds * config.fps),
          theme: beat.theme,
          prompt: beat.prompt,
          answer: beat.answer,
        });
      } else if (beat.kind === "custom") {
        items.push({ type: "custom", phraseIndex, durationInFrames, beat });
      } else {
        items.push({ type: beat.kind, phraseIndex, durationInFrames });
      }
    }
  }

  items.push({ type: "outro", durationInFrames: Math.round(config.outroSeconds * config.fps) });
  return items;
}

/** Same accounting as timings.ts's totalDuration - re-exported here so recipe code has one place to import from. */
export function totalDurationFromRecipe(items: { durationInFrames: number }[], transitionFrames = 0): number {
  return items.reduce((sum, item) => sum + item.durationInFrames, 0) - transitionFrames;
}

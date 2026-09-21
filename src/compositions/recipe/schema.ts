import { z } from "zod";
import { customBeatSchema } from "./layers/schema";

/**
 * A "composition recipe": data describing which of the existing scene
 * components (the "beat vocabulary" below) a composition sequences, and the
 * handful of per-beat choices that used to be hardcoded differently across
 * one hand-written .tsx per composition (Reel.tsx/ReelTemplate2.tsx/
 * ReelTemplate3.tsx, preserved on the backup/legacy-composition-renderer
 * branch) - so a new composition that recombines the SAME beat kinds into a
 * new order/mix is a JSON file instead of a new .tsx + a new <Composition>
 * registration in Root.tsx.
 *
 * Deliberately does NOT attempt to make font sizes, pixel positions, colors,
 * or animation curves into data - those already come from `config`/theme
 * inside each scene component (see the components themselves), and a
 * genuinely new visual layout still means writing a new beat-kind component.
 * This schema's job is the timeline/sequencing layer only. See
 * docs/COMPOSITION_DESIGNER.md for the full reasoning and what's out of scope.
 */

const themeSchema = z.enum(["light", "dark"]);

/** Where the phrase's on-screen text comes from - a literal string, or the config field every template already reads its intro copy from. */
const introTextSchema = z.union([
  z.object({ source: z.literal("config.introText") }),
  z.object({ source: z.literal("literal"), value: z.string() }),
]);

/** IntroScene as-is: on-screen prompt text + voice-over, single entry animation. `introVoiceKeyword` picks which intro voice-over set (assets/voice/) matches the on-screen question's language/direction - see audio/voice.ts's pickIntroVoice. */
const introBeatSchema = z.object({
  kind: z.literal("intro"),
  theme: themeSchema,
  text: introTextSchema,
  introVoiceKeyword: z.enum(["sinhala", "english"]),
});

/** PhraseScene as-is - no per-composition variation exists today; kept as its own kind (not folded into a generic "text beat") because it owns the numbered-badge + pronunciation layout other beats don't share. */
const phraseBeatSchema = z.object({ kind: z.literal("phrase") });

/** CountdownScene as-is - a frame/duration-driven ring, no phrase content, no per-composition variation. */
const countdownBeatSchema = z.object({ kind: z.literal("countdown") });

/** RevealScene as-is - meaning + explanation cards, no per-composition variation. */
const revealBeatSchema = z.object({ kind: z.literal("reveal") });

/** The Phrase field shown in each half of a guessReveal beat - see phrase.ts's Phrase type. */
const phraseFieldSchema = z.enum(["phrase", "translationSi"]);

/**
 * GuessRevealSceneT2/T3's fused pin-up/countdown/reveal beat (one continuous
 * mount instead of three cut scenes) - `prompt`/`answer` is the one thing
 * Template 2 vs Template 3 actually swap (English-first vs Sinhala-first),
 * everything else (the pin/countdown/reveal choreography itself) is shared
 * frame-math in guessRevealPhases.ts already.
 */
const guessRevealBeatSchema = z.object({
  kind: z.literal("guessReveal"),
  theme: themeSchema,
  prompt: phraseFieldSchema,
  answer: phraseFieldSchema,
});

/** OutroScene as-is - `theme` picks which palette it renders in (and, per OutroScene.tsx, deliberately borrows accent colors from the *other* palette for contrast - that borrowing rule itself is fixed code, not data). */
const outroBeatSchema = z.object({
  kind: z.literal("outro"),
  theme: themeSchema,
});

export const beatSchema = z.discriminatedUnion("kind", [
  introBeatSchema,
  phraseBeatSchema,
  countdownBeatSchema,
  revealBeatSchema,
  guessRevealBeatSchema,
  outroBeatSchema,
  customBeatSchema,
]);

export type Beat = z.infer<typeof beatSchema>;

/**
 * A beat that can repeat once per phrase in the batch - excludes intro/
 * outro, which only ever appear once. `custom` (recipe/layers/schema.ts) is
 * the one beat kind here whose visual content is itself data (a Layer[])
 * instead of a fixed scene component - see CompositionFromRecipe.tsx's
 * dispatch and timeline.ts's duration handling for the two places that
 * treat it differently from the other 4.
 */
const perPhraseBeatSchema = z.discriminatedUnion("kind", [phraseBeatSchema, countdownBeatSchema, revealBeatSchema, guessRevealBeatSchema, customBeatSchema]);

export const compositionRecipeSchema = z.object({
  id: z.string().describe('Matches the CLI/GUI "template" number today (1/2/3) for the built-ins; a free string for a new recipe'),
  name: z.string(),
  description: z.string().default(""),
  intro: introBeatSchema,
  /** The repeating unit between intro and outro, expanded once per phrase in the batch - e.g. [phrase, countdown, reveal] (Template 1) or [guessReveal] (Template 2/3). */
  perPhraseBeats: z.array(perPhraseBeatSchema).min(1),
  outro: outroBeatSchema,
  /**
   * Every existing composition applies exactly one crossfade, from the last
   * per-phrase beat into the outro - `at` is closed to that one junction
   * point rather than an arbitrary beat index, since that's the only
   * transition point that exists in the codebase to generalize from.
   */
  transition: z.object({
    at: z.literal("beforeOutro"),
    type: z.literal("fade"),
  }),
});

export type CompositionRecipe = z.infer<typeof compositionRecipeSchema>;

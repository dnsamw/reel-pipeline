import { z } from "zod";

// Mirrors theme/tokens.ts's Palette shape - duplicated here (rather than
// imported) so config.ts stays free of any React/theme import, since it's
// read by both Node-only scripts and bundled composition code.
const paletteSchema = z.object({
  primary: z.string(),
  brand2: z.string(),
  gold: z.string(),
  goldInk: z.string(),
  foreground: z.string(),
  mutedForeground: z.string(),
  border: z.string(),
  background: z.string(),
});

const themeSchema = z.object({ light: paletteSchema, dark: paletteSchema });

// A zod schema (not a plain TS interface) so Remotion Studio can render a
// real form in its sidebar - bounded z.number().min().max() fields become
// sliders, booleans become checkboxes, strings become text inputs. This is
// only used for interactive preview/tweaking in Studio; the production
// batch runner still reads defaultConfig below (or CLI-flag overrides).
export const configSchema = z.object({
  phrasesPerReel: z.number().int().min(1).max(6),
  introSeconds: z.number().min(0).max(10).describe("Seconds the intro 'guess the meaning' prompt holds"),
  phraseSeconds: z.number().min(0.5).max(12).describe("Seconds each phrase scene holds"),
  countdownSeconds: z.number().min(1).max(15),
  revealSeconds: z.number().min(0.5).max(12),
  outroSeconds: z.number().min(0.5).max(10),
  transitionSeconds: z.number().min(0).max(3).describe("Crossfade duration between the last reveal and the outro"),
  fps: z.number().int().min(1).max(60),
  width: z.number().int().min(1),
  height: z.number().int().min(1),
  chapterOrderRange: z.tuple([z.number(), z.number()]).nullable(),
  bookId: z.string().nullable().describe("Book.id or a substring of Book.title - required once more than one book exists in the DB"),
  ttsEnabled: z.boolean(),
  ttsRate: z.number().min(0.5).max(2).describe("TTS speaking-rate multiplier - 1 is normal speed, passed to Azure as SSML <prosody rate>"),
  theme: themeSchema.nullable().describe("Template library color override - null means the built-in brand palette (theme/tokens.ts)"),
  backgroundImage: z
    .string()
    .nullable()
    .describe("Filename under assets/background-images, shown full-bleed behind every scene - null uses the plain theme background color, \"random\" picks a different image from assets/background-images for each rendered reel"),
  backgroundImageScrim: z
    .number()
    .min(0)
    .max(1)
    .describe("Opacity of the theme-background-color tint drawn over backgroundImage for text legibility - 0 leaves the photo fully clear, 1 fully hides it"),
  textColors: z
    .record(z.string(), z.string().nullable())
    .nullable()
    .describe("Per-text-element color overrides keyed by theme/textColors.ts's TEXT_COLOR_FIELDS - a missing/null key uses the theme palette's color"),
  outroBackgroundColor: z
    .string()
    .nullable()
    .describe("Background color of the outro CTA scene - null uses the theme palette's color"),
  outroAccentColor: z
    .string()
    .nullable()
    .describe("Color of the two decorative circles on the outro CTA scene - null uses the theme palette's color"),
  musicVolume: z.number().min(0).max(1),
  tickVolume: z.number().min(0).max(1),
  revealSoundVolume: z.number().min(0).max(1),
  introVoiceVolume: z.number().min(0).max(1),
  phraseVoiceVolume: z.number().min(0).max(1),
  revealVoiceVolume: z.number().min(0).max(1),
  outputDir: z.string(),
  ttsDir: z.string().describe("Generated TTS audio - doubles as cache AND servable staticFile() dir since it's under assets/"),
  musicDir: z.string(),
  sfxDir: z.string(),
  voiceDir: z.string(),
  manifestPath: z.string(),
  ctaUrl: z.string().describe("Shown on the outro CTA scene - set to StudyPal's actual public URL"),
  introText: z.string().describe("On-screen text for the intro scene, spoken by the intro voice-over"),
});

export type ReelConfig = z.infer<typeof configSchema>;

/**
 * config.backgroundImage value meaning "a different random image from
 * assets/background-images for each reel" - resolved to a real path before
 * rendering (renderBatch.ts per batch, TemplateEditor for the live preview),
 * so compositions only ever see a concrete filename or null.
 */
export const RANDOM_BACKGROUND_IMAGE = "random";

export const defaultConfig: ReelConfig = {
  phrasesPerReel: 3,
  introSeconds: 3,
  phraseSeconds: 4.5,
  countdownSeconds: 5,
  revealSeconds: 5,
  outroSeconds: 3,
  transitionSeconds: 0.5,
  fps: 30,
  width: 1080,
  height: 1920,
  chapterOrderRange: null,
  bookId: null,
  ttsEnabled: false,
  ttsRate: 1,
  theme: null,
  backgroundImage: null,
  backgroundImageScrim: 0.55,
  textColors: null,
  outroBackgroundColor: null,
  outroAccentColor: null,
  musicVolume: 0.3,
  tickVolume: 0.6,
  revealSoundVolume: 0.8,
  introVoiceVolume: 1,
  phraseVoiceVolume: 1,
  revealVoiceVolume: 1,
  outputDir: "output",
  ttsDir: "assets/tts",
  musicDir: "assets/music",
  sfxDir: "assets/sfx",
  voiceDir: "assets/voice",
  manifestPath: "output/manifest.json",
  ctaUrl: "studypal.store",
  introText: "සිංහල අර්ථය කුමක්ද?",
};
